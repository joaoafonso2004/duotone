// A capa que reage ao som, do lado do JS.
//
// O que corre no iPhone -- o tap, o Metal do AVFoundation, o GLView -- não se
// pode correr aqui. O que se pode, e é onde os erros se escondem, é tudo o que
// está ENTRE eles:
//
//   - a ponte para o módulo nativo, incluindo uma build antiga que não o tem;
//   - a preferência do iPhone, que é SUA e nunca toca na chave do PC;
//   - o renderer: o shader que compila, o recorte da capa, e a limpeza da GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => {
    if (!(name in mocks)) throw Error('Missing mock: ' + name); return mocks[name];
  }, module, module.exports);
  return module.exports;
}

async function run() {
  const bridge = native => load('modules/duotone-audio/index.ts', { expo: { requireOptionalNativeModule: () => native } });
  const N = bridge(null).VALORES_DA_CAPA;
  assert.equal(N,257,'256 bins mais o envelope da batida');
  assert.deepEqual(await bridge(null).lerAnaliseDaCapa(),[]);
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => Array(N).fill(NaN) }).lerAnaliseDaCapa(),[]);
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => Array(9).fill(0) }).lerAnaliseDaCapa(),[],
    'um payload do tamanho antigo e recusado, nao interpretado a torto');
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => { throw Error('released'); } }).lerAnaliseDaCapa(),[]);
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => Array(N).fill(0) }).lerAnaliseDaCapa(),Array(N).fill(0));

  // A store a sério: uma leitura lenta do disco não pode desfazer um toque na
  // capa, e a chave partilhada com o PC nunca é lida nem escrita.
  const writes = []; let resolveRead, readKey;
  const capa = load('src/state/capaIOS.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: key => { readKey = key; return new Promise(resolve => { resolveRead = resolve; }); },
      setItem: async (key,value) => { writes.push([key,value]); },
    }, zustand: require('zustand'), '../lib/haptics': { hapticSelection() {} },
  });
  const pending = capa.loadCapaIOS(); capa.useCapaIOS.getState().toggle(); resolveRead('reactive'); await pending;
  assert.equal(capa.useCapaIOS.getState().mode,'static'); assert.equal(readKey,'pref:glitchModeIOS');
  capa.useCapaIOS.getState().setMode('off'); capa.useCapaIOS.getState().toggle();
  assert.equal(capa.useCapaIOS.getState().mode,'off','off can only be changed explicitly in settings');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes,[['pref:glitchModeIOS','static'],['pref:glitchModeIOS','off']]);

  const calls = [], shaders = load('src/lib/glitchShaders.ts'); let next = 0;
  // O MESMO GLSL do PC, byte a byte: um `\r` a mais e o driver que o recusa
  // seria o do telemóvel de alguém, meses depois. Ver `lib/glitchShaders.ts`.
  assert.ok(!shaders.VERTEX.includes('\r') && !shaders.FRAGMENT.includes('\r'), 'sem retornos de carro no shader');
  // O que o `readPixels` devolve: 0 é uma textura que não carregou (a capa
  // preta), qualquer outra coisa é imagem a sério.
  let pixel = 0;
  const gl = new Proxy({ NO_ERROR: 0, drawingBufferWidth: 512, drawingBufferHeight: 512 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (/^[A-Z_0-9]+$/.test(key)) return key;
      return (...args) => {
        calls.push([key,...args]);
        if (/^create/.test(key)) return { id: ++next };
        if (key === 'getShaderParameter' || key === 'getProgramParameter') return true;
        if (key === 'getError') return 0;
        if (key === 'getUniformLocation') return args[1];
        if (key === 'getAttribLocation') return 0;
        if (key === 'readPixels') { args[6][0] = pixel; args[6][1] = pixel; args[6][2] = pixel; }
      };
    },
  });
  const modulo = load('src/lib/glitchRendererIOS.ts', { './glitchShaders': shaders });
  const renderer = modulo.criarRendererIOS(gl,320,{ localUri:'file://cover.png',width:1600,height:900 });
  assert.deepEqual(calls.filter(c => c[0] === 'shaderSource').map(c => c[2]),[shaders.VERTEX,shaders.FRAGMENT]);
  const scale = calls.find(c => c[0] === 'uniform2f' && c[1] === 'uEscala');
  assert.deepEqual(scale.slice(2),[900/1600,1],'landscape thumbnails use cover, never stretch');

  // A CAPA PRETA. Um ficheiro que o expo-gl não lê vira uma textura 0x0 sem
  // erro nenhum -- por isso a pergunta é o que ficou desenhado, não se houve
  // erro. Preto absoluto nos quatro cantos é uma textura que não carregou.
  assert.equal(renderer.desenhouAlgo(),false,'textura vazia nao passa por boa');
  assert.equal(calls.filter(c=>c[0]==='endFrameEXP').length,0,'a verificacao nao apresenta o quadro');
  pixel = 40;
  assert.equal(renderer.desenhouAlgo(),true,'com imagem a serio, passa');

  const antesDoDraw = calls.filter(c=>c[0]==='drawArrays').length;
  renderer.draw(Array(257).fill(0),0);
  assert.equal(calls.filter(c=>c[0]==='drawArrays').length,antesDoDraw+1);
  const frame = calls.filter(c=>c[0]==='uniform4fv').pop()[2];
  assert.equal(frame[0],0); assert.equal(frame[6],0);
  assert.equal(frame[7],0,'sem agudos nao ha textura extra');

  // AS CONTAS SAO AS DO PC. O nivel e grave-first (0,82/0,18) e os agudos sao
  // um EXCESSO sobre um piso -- em cru ficavam altos sempre e tremia tudo.
  // UM BIN POR TEXEL. Era o esticar de oito bandas para 256 que fazia linhas
  // vizinhas receberem o mesmo valor -- e o shader le um texel por LINHA.
  const bins = Array.from({length:257},(_,i)=> i<256 ? (i%2 ? 200 : 40) : 0);
  renderer.draw(bins,1);
  const subida = calls.filter(c=>c[0]==='texSubImage2D').pop();
  // LUMINANCE: um byte por texel, como no PC. Em RGBA subiam 1024 bytes por
  // fotograma para usar 256.
  assert.equal(subida[7],'LUMINANCE','um byte por texel, nao quatro');
  const textura = subida[9];
  assert.equal(textura.length,256);
  assert.equal(textura[0],40); assert.equal(textura[1],200);
  assert.equal(textura[255],200,'o pente chega inteiro a textura');

  // O nivel sai DOS BINS, com as contas do beat.web.ts: graves (45-260 Hz) a
  // 0,82 mais o corpo (metade do espectro) a 0,18.
  const planos = Array.from({length:257},(_,i)=> i<256 ? 128 : 0);
  renderer.draw(planos,2);
  const comSinal = calls.filter(c=>c[0]==='uniform4fv').pop()[2];
  assert.ok(Math.abs(comSinal[0] - (128/255)*255) < 0.5,'bins planos dao o nivel desses bins');

  // Abaixo do piso os agudos NAO existem. Em cru estariam sempre acesos, e no
  // shader eles multiplicam pela batida -- acesos de base, tremia tudo.
  renderer.draw(Array.from({length:257},(_,i)=> i<256 ? 5 : 0),3);
  assert.equal(calls.filter(c=>c[0]==='uniform4fv').pop()[2][7],0,'abaixo do piso nao ha agudos');
  renderer.draw(Array.from({length:257},(_,i)=> i<256 ? 30 : 0),4);
  const meio = calls.filter(c=>c[0]==='uniform4fv').pop()[2][7];
  assert.ok(meio > 0 && meio < 1,'e entre o piso e o tecto sobem por graus');

  // A intensidade da preferencia entra no shader E na conta das caixas.
  assert.equal(modulo.MULTIPLICADOR.subtle,0.62);
  const suave = modulo.criarRendererIOS(gl,320,{ localUri:'file://cover.png',width:900,height:900 },modulo.MULTIPLICADOR.subtle);
  assert.equal(calls.filter(c=>c[0]==='uniform1f'&&c[1]==='uIntensidade').pop()[2],0.62,'a preferencia chega ao shader');
  suave.destroy();

  renderer.destroy(); renderer.destroy(); renderer.draw(Array(257).fill(1),1);
  const finais = calls.filter(c=>c[0]==='drawArrays').length;
  renderer.draw(Array(257).fill(1),2);
  assert.equal(calls.filter(c=>c[0]==='drawArrays').length,finais,'no draws after disposal');
  assert.equal(renderer.desenhouAlgo(),false,'nem verificacoes depois de fechado');
  console.log('Capa reactiva: ponte nativa, preferência do iPhone, capa preta e contas do PC passaram.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

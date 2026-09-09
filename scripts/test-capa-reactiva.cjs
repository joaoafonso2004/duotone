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
  assert.deepEqual(await bridge(null).lerAnaliseDaCapa(),[]);
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => [NaN] }).lerAnaliseDaCapa(),[]);
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => { throw Error('released'); } }).lerAnaliseDaCapa(),[]);
  assert.deepEqual(await bridge({ lerAnaliseDaCapa: () => Array(9).fill(0) }).lerAnaliseDaCapa(),Array(9).fill(0));

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
      };
    },
  });
  const renderer = load('src/lib/glitchRendererIOS.ts', { './glitchShaders': shaders }).criarRendererIOS(gl,320,{ localUri:'file://cover.png',width:1600,height:900 });
  assert.deepEqual(calls.filter(c => c[0] === 'shaderSource').map(c => c[2]),[shaders.VERTEX,shaders.FRAGMENT]);
  const scale = calls.find(c => c[0] === 'uniform2f' && c[1] === 'uEscala');
  assert.deepEqual(scale.slice(2),[900/1600,1],'landscape thumbnails use cover, never stretch');
  renderer.draw(Array(9).fill(0),0); assert.equal(calls.filter(c=>c[0]==='drawArrays').length,1);
  const frame = calls.find(c=>c[0]==='uniform4fv')[2]; assert.equal(frame[0],0); assert.equal(frame[6],0);
  renderer.destroy(); renderer.destroy(); renderer.draw(Array(9).fill(1),1);
  assert.equal(calls.filter(c=>c[0]==='drawArrays').length,1,'no draws after disposal');
  assert.equal(calls.filter(c=>c[0]==='deleteTexture').length,2,'textures released exactly once');
  console.log('Capa reactiva: ponte nativa, preferência do iPhone e renderer passaram.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

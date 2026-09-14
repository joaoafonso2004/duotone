// A capa flutuante do iPhone: preferência, migração do glitch antigo e os
// limites que impedem o movimento de deixar de ser subtil.
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
    if (!(name in mocks)) throw Error('Missing mock: ' + name);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

async function run() {
  const regra = load('src/lib/capaFlutuante3D.ts');
  const c = regra.CAPA_FLUTUANTE;

  assert.equal(regra.interpretarEstiloDaCapa('floating', 'off'), 'floating', 'a escolha nova ganha');
  assert.equal(regra.interpretarEstiloDaCapa('simple', 'reactive'), 'simple', 'a escolha simples fica');
  assert.equal(regra.interpretarEstiloDaCapa(null, 'off'), 'simple', 'glitch desligado migra para simples');
  assert.equal(regra.interpretarEstiloDaCapa(null, 'static'), 'simple', 'glitch estático migra para simples');
  assert.equal(regra.interpretarEstiloDaCapa(null, 'reactive'), 'floating', 'glitch reativo migra para 3D');
  assert.equal(regra.interpretarEstiloDaCapa(null, null), 'floating', 'uma instalação nova mostra o novo efeito');

  assert.ok(c.amplitude >= 2 && c.amplitude <= 4, 'a flutuação fica entre dois e quatro pontos');
  assert.ok(c.cicloMs >= 4000 && c.cicloMs <= 5500, 'o ciclo é lento, mas não parece parado');
  // A pose vem da screenshot de referência (NOSTYLIST, medida em alta resolução):
  // os cantos da face ficam perto de onde lá estão. Perto e não em cima: a face
  // roda um pouco MENOS do que na referência, para dominar (decisão de 13/9).
  // O canto de cima à direita é o que mais se afasta: é onde se nota rodar menos.
  let somaDosDesvios = 0;
  for (const [canto, [ax, ay]] of Object.entries(regra.CANTOS_DA_REFERENCIA)) {
    const [x, y] = regra.projetarCanto(canto, c);
    const desvioDoCanto = Math.hypot(x - ax, y - ay);
    somaDosDesvios += desvioDoCanto ** 2;
    assert.ok(desvioDoCanto <= 0.05,
      `o canto ${canto} afastou-se da referência: (${x.toFixed(3)}, ${y.toFixed(3)}) contra (${ax}, ${ay})`);
  }
  assert.ok(Math.sqrt(somaDosDesvios / 4) <= 0.035, 'em média, os cantos ficam a menos de 3,5% do lado da referência');
  // A pose de referência reproduz mesmo a screenshot -- senão a comparação acima
  // não diz nada.
  for (const [canto, [ax, ay]] of Object.entries(regra.CANTOS_DA_REFERENCIA)) {
    const [x, y] = regra.projetarCanto(canto, regra.POSE_DA_REFERENCIA);
    assert.ok(Math.hypot(x - ax, y - ay) <= 0.02, `a pose de referência não reproduz o canto ${canto}`);
  }
  const ref = regra.POSE_DA_REFERENCIA;
  assert.ok(c.rotateX < ref.rotateX && c.rotateY < ref.rotateY && Math.abs(c.rotateZ) < Math.abs(ref.rotateZ),
    'roda um pouco menos do que a referência: a face tem de dominar');
  assert.ok(c.perspectiva > ref.perspectiva, 'e com a perspetiva um pouco mais longe');
  // À deriva (13/9): a caixa inclina-se devagar, sem nunca passar da referência.
  const d = c.deriva;
  assert.ok(d.rotateX > 0 && d.rotateX <= 2 && d.rotateY > 0 && d.rotateY <= 2, 'a deriva inclina no máximo 2°');
  assert.ok(c.rotateX + d.rotateX < ref.rotateX && c.rotateY + d.rotateY < ref.rotateY,
    'nem no extremo da deriva a caixa roda mais do que a referência');
  const longeDeInteiro = (x) => Math.abs(x - Math.round(x)) > 0.2;
  assert.ok(longeDeInteiro(d.cicloMs / c.cicloMs) && longeDeInteiro(c.cicloMs / d.cicloMs),
    'o ciclo da deriva não é múltiplo do da flutuação: a combinação quase não se repete');
  // A onda que as move. A flutuação da 2.9.3 saltava do ponto mais alto para o
  // meio a cada ciclo; uma onda que acaba onde começa não tem por onde saltar.
  const seno = regra.ondaSeno();
  assert.equal(seno.outputRange[0], 0, 'a onda começa no repouso: arrancar e parar não saltam');
  assert.equal(seno.outputRange.at(-1), seno.outputRange[0], 'e acaba onde começa: um ciclo encaixa no seguinte');
  assert.equal(regra.ondaSeno(16, 0.25).outputRange.at(-1), regra.ondaSeno(16, 0.25).outputRange[0], 'o cosseno também');
  let pior = 0;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000, s = Math.min(seno.inputRange.length - 2, Math.floor(t * (seno.inputRange.length - 1)));
    const f = (t - seno.inputRange[s]) / (seno.inputRange[s + 1] - seno.inputRange[s]);
    const v = seno.outputRange[s] + (seno.outputRange[s + 1] - seno.outputRange[s]) * f;
    pior = Math.max(pior, Math.abs(v - Math.sin(2 * Math.PI * t)));
  }
  assert.ok(pior <= 0.02, `as amostras seguem o seno (desvio de ${(pior * 100).toFixed(1)}% da amplitude)`);
  assert.ok(regra.areaDaFace(c) >= regra.areaDaFace(ref),
    `a face ocupa pelo menos a área que ocupa na referência (${regra.areaDaFace(c).toFixed(3)})`);
  const desvio = regra.desvioDaFaceDeTras(c);
  assert.ok(desvio.x < 0 && desvio.y > 0, 'veem-se a aresta esquerda e a de baixo, como na referência');
  // A espessura VISÍVEL é a da foto: ~3,5% do lado na aresta de baixo e ~3,1% na
  // esquerda (medidas na referência em alta resolução, 13/9).
  const bordoDeBaixo = regra.projetar(0, 0.5, -c.espessura, c)[1] - regra.projetar(0, 0.5, 0, c)[1];
  const bordoEsquerdo = regra.projetar(-0.5, 0, 0, c)[0] - regra.projetar(-0.5, 0, -c.espessura, c)[0];
  assert.ok(Math.abs(bordoDeBaixo - 0.035) <= 0.005 && Math.abs(bordoEsquerdo - 0.031) <= 0.005,
    `a espessura visível é a da referência (baixo ${(bordoDeBaixo * 100).toFixed(1)}%, esquerda ${(bordoEsquerdo * 100).toFixed(1)}%)`);
  assert.ok(c.raio <= 3, 'cantos quase vivos: a caixa fecha nos cantos, sem buracos escuros');
  assert.ok(c.scale >= 0.85 && c.scale <= 0.94, 'a capa encolhe o suficiente para a espessura e a sombra caberem');
  // A espessura são as quatro laterais INTEIRAS: com a face e o verso fecham uma
  // caixa, e os cantos ficam com a cor da capa (13/9).
  for (const l of regra.LATERAIS) {
    const g = regra.geometriaDaLateral(l.lado, 300, 20);
    const vertical = l.lado === 'esquerda' || l.lado === 'direita';
    assert.deepEqual([g.largura, g.altura], vertical ? [20, 300] : [300, 20], `a lateral ${l.lado} tem o comprimento inteiro`);
    assert.ok(l.tras > l.frente, `a lateral ${l.lado} escurece para trás`);
  }
  const veuDe = (lado) => regra.LATERAIS.find((l) => l.lado === lado);
  assert.ok(veuDe('esquerda').frente < veuDe('baixo').frente, 'a esquerda apanha mais luz do que a de baixo');
  // Os materiais existem e têm o tamanho que o código assume.
  const tamanhoDoPng = (f) => { const b = fs.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(tamanhoDoPng('assets/capa3d-grao@3x.png'), [180, 180], 'o grão tem 60 pt a 3x');
  for (const f of ['assets/capa3d-sombra-ambiente.png', 'assets/capa3d-sombra-contacto.png', 'assets/capa3d-vinheta.png']) {
    assert.ok(fs.existsSync(path.join(root, f)), `${f} existe`);
  }

  // Uma leitura antiga do disco não pode desfazer a escolha feita no ecrã.
  const writes = [];
  let resolveNovo;
  const store = load('src/state/capaIOS.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: key => key === 'pref:artworkStyleIOS'
        ? new Promise(resolve => { resolveNovo = resolve; })
        : Promise.resolve('reactive'),
      setItem: async (key, value) => { writes.push([key, value]); },
    },
    zustand: require('zustand'),
    '../lib/haptics': { hapticSelection() {} },
    '../lib/capaFlutuante3D': regra,
  });
  const pending = store.loadCapaIOS();
  store.useCapaIOS.getState().setStyle('simple');
  resolveNovo(null);
  await pending;
  await flush();
  assert.equal(store.useCapaIOS.getState().style, 'simple');
  assert.equal(store.useCapaIOS.getState().loaded, true);
  assert.deepEqual(writes, [['pref:artworkStyleIOS', 'simple']], 'só se grava a escolha mais recente');

  const player = fs.readFileSync(path.join(root, 'src/components/PlayerRoot.tsx'), 'utf8');
  const capa3D = fs.readFileSync(path.join(root, 'src/components/CapaFlutuante3D.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
  const lyrics = fs.readFileSync(path.join(root, 'src/components/LyricsView.tsx'), 'utf8');
  const iosGlitch = [
    'src/components/CapaReactiva.ios.tsx',
    'src/lib/glitchRendererIOS.ts',
    'modules/duotone-audio/ios/AnaliseDaCapa.swift',
  ];
  for (const file of iosGlitch) assert.equal(fs.existsSync(path.join(root, file)), false, `${file} foi removido`);
  assert.match(player, /<CapaFlutuante3D/);
  assert.match(player, /opacity: capaFlutuante \? 0 :/,
    'a sombra plana da capa desliga-se com a capa 3D, também do lado das letras');
  const cubo = fs.readFileSync(path.join(root, 'src/components/ArtworkLyricsCube.tsx'), 'utf8');
  assert.match(cubo, /-direction\*180/, 'no 3D a caixa vira 180° inteira, com as letras no verso');
  assert.match(cubo, /LATERAIS\.map/, 'as laterais viram com a face');
  assert.match(cubo, /GraoDaFace/, 'o grão de pedra está nas faces, e não só nas laterais');
  // O modo repeat da Image não repetia no iPhone: a 2.9.2 mostrava um mosaico só,
  // no canto de cima à esquerda. O grão é repetido à mão.
  assert.doesNotMatch(cubo, /resizeMode=["']repeat/, 'o grão não depende do repeat da Image');
  const mosaicosDaLateral = regra.mosaicoDoGrao(370, 29, 60);
  assert.equal(mosaicosDaLateral.length, 7, 'uma lateral de 370 × 29 pt leva sete mosaicos');
  assert.deepEqual(mosaicosDaLateral.at(-1), { x: 360, y: 0 }, 'o último mosaico chega ao fim da lateral');
  assert.equal(regra.mosaicoDoGrao(370, 370, 60).length, 49, 'uma face de 370 pt fica coberta até ao canto de baixo à direita');
  assert.deepEqual(regra.mosaicoDoGrao(0, 370, 60), [], 'sem tamanho, sem mosaicos');
  // A opacidade do grão vem no PNG, e não como opacidade de grupo por cima de
  // dezenas de mosaicos; o que é estático na caixa é rasterizado.
  const alfaMaximoDoPng = (f) => {
    const b = fs.readFileSync(path.join(root, f));
    const largura = b.readUInt32BE(16), altura = b.readUInt32BE(20);
    const idat = [];
    for (let o = 8; o < b.length;) {
      const n = b.readUInt32BE(o);
      if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + n));
      o += 12 + n;
    }
    const cru = require('node:zlib').inflateSync(Buffer.concat(idat));
    let maximo = 0;
    for (let y = 0; y < altura; y++) {
      const linha = y * (largura * 4 + 1);
      assert.equal(cru[linha], 0, 'o gerador escreve as linhas sem filtro');
      for (let x = 0; x < largura; x++) maximo = Math.max(maximo, cru[linha + 1 + x * 4 + 3]);
    }
    return maximo;
  };
  assert.equal(alfaMaximoDoPng('assets/capa3d-grao@3x.png'), Math.round(150 * c.grao.opacidade), 'a opacidade do grão está no PNG');
  assert.doesNotMatch(cubo, /opacity:pose3D\.grao/, 'e não se aplica outra vez por cima');
  assert.match(cubo, /shouldRasterizeIOS/, 'o que é estático na caixa é rasterizado');
  const corpoDoLeitor = player.slice(player.indexOf('export function PlayerRoot'), player.indexOf('function BarraDoLeitor'));
  assert.ok(corpoDoLeitor.length > 1000, 'o corpo do PlayerRoot foi encontrado');
  assert.doesNotMatch(corpoDoLeitor, /usePlayer\(\(s\) => s\.positionMs\)/, 'o leitor não redesenha a cada posição: só a barra a lê');
  assert.match(player, /function BarraDoLeitor[\s\S]*usePlayer\(\(s\) => s\.positionMs\)/, 'a barra lê-a ela própria');
  assert.match(player, /pose3D=\{pose3D\}/, 'o cubo recebe a pose da capa 3D');
  assert.doesNotMatch(capa3D, /shadowOffset|shadowRadius/,
    'as sombras são difusas no fundo, e não um drop-shadow preso à capa');
  assert.doesNotMatch(capa3D, /blurRadius|MaskedView/,
    'sem luz circular: a cor do fundo vem da capa desfocada do leitor');
  assert.match(player, /capa3d-vinheta\.png/, 'com a capa 3D, o fundo leva a vinheta centrada na capa');
  // O loop repõe o valor com que o Animated.Value foi criado no início de cada
  // volta: uma ida e volta em sequência, nascida a 0,5, saltava do topo para o meio.
  assert.doesNotMatch(capa3D, /Animated\.loop\(\s*Animated\.sequence/,
    'a flutuação não é uma sequência de ida e volta dentro de um loop');
  assert.doesNotMatch(capa3D, /new Animated\.Value\(0\.5\)/, 'as fases nascem no repouso, a 0');
  assert.match(capa3D, /ondaSeno/, 'a onda sai das amostras do lib');
  assert.match(capa3D, /c\.deriva\.rotateX/, 'a caixa inclina-se à deriva');
  assert.doesNotMatch(player, /<CapaFlutuante3D[^>]*(?:showLyrics|turning)=/,
    'a pose exterior não muda quando o cubo roda para as letras');
  assert.doesNotMatch(capa3D, /enabled\s*&&\s*!showLyrics|!turning/,
    'capa e letras conservam a mesma pose 3D durante todo o swipe');
  assert.match(settings, /Artwork and lyrics keep the same 3D pose\./,
    'as Definições descrevem a pose 3D que as letras realmente mantêm');
  assert.doesNotMatch(settings, /Lyrics always settle flat/,
    'a explicação antiga não contradiz o efeito atual');
  assert.match(lyrics, /if\(manual\|\|!synced\)return;/,
    'a face escondida continua sincronizada; visible só bloqueia interação');

  console.log('Capa flutuante: pose subtil e contínua na capa e nas letras, migração e preferência passaram.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

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
  // A pose vem da screenshot de referência (NOSTYLIST): os quatro cantos da face
  // têm de continuar onde lá estão. Mexer num ângulo "a olho" parte isto.
  for (const [canto, [ax, ay]] of Object.entries(regra.CANTOS_DA_REFERENCIA)) {
    const [x, y] = regra.projetarCanto(canto, c);
    assert.ok(Math.hypot(x - ax, y - ay) <= 0.012,
      `o canto ${canto} afastou-se da referência: (${x.toFixed(3)}, ${y.toFixed(3)}) contra (${ax}, ${ay})`);
  }
  const desvio = regra.desvioDaFaceDeTras(c);
  assert.ok(desvio.x < 0 && desvio.y > 0, 'veem-se a aresta esquerda e a de baixo, como na referência');
  assert.ok(c.espessura > 0.03 && c.espessura <= 0.08, 'um objeto FINO: a espessura fica entre 3% e 8% do lado');
  assert.ok(c.fatias >= 10, 'a espessura tem fatias suficientes para não mostrar degraus num Retina');
  assert.ok(c.raio <= 10, 'cantos quase retos, como na referência');
  assert.ok(c.scale >= 0.85 && c.scale <= 0.94, 'a capa encolhe o suficiente para a espessura e a sombra caberem');
  assert.ok(regra.profundidadeDaFatia(0, c.fatias, 10) === -10 && regra.profundidadeDaFatia(c.fatias - 1, c.fatias, 10) < 0,
    'a fatia do fundo está à espessura inteira, e nenhuma fica no plano da face');

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
  assert.match(capa3D, /profundidadeDaFatia/,
    'a espessura são fatias em profundidade real, e não placas deslocadas em 2D');
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

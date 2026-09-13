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
  assert.ok(Math.abs(c.rotateX) <= 8 && Math.abs(c.rotateY) <= 12, 'a inclinação não vira uma demonstração 3D');
  assert.ok(c.rotateZ >= 6 && c.rotateZ <= 10, 'a diagonal continua próxima da referência');
  assert.ok(c.scale >= 0.88 && c.scale <= 0.94, 'a capa encolhe o suficiente para a profundidade caber');
  assert.ok(c.camadas >= 8, 'a aresta tem lâminas suficientes para não parecer uma escada num Retina');
  const primeira = regra.deslocamentoDaCamada(1), ultima = regra.deslocamentoDaCamada(c.camadas);
  assert.ok(primeira.x < 0 && primeira.y > 0, 'a profundidade nasce para a esquerda e para baixo');
  assert.deepEqual(ultima, { x: -c.profundidade * 0.72, y: c.profundidade });

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
  const lyrics = fs.readFileSync(path.join(root, 'src/components/LyricsView.tsx'), 'utf8');
  const iosGlitch = [
    'src/components/CapaReactiva.ios.tsx',
    'src/lib/glitchRendererIOS.ts',
    'modules/duotone-audio/ios/AnaliseDaCapa.swift',
  ];
  for (const file of iosGlitch) assert.equal(fs.existsSync(path.join(root, file)), false, `${file} foi removido`);
  assert.match(player, /<CapaFlutuante3D/);
  assert.match(lyrics, /if\(manual\|\|!synced\)return;/,
    'a face escondida continua sincronizada; visible só bloqueia interação');

  console.log('Capa flutuante: pose subtil, migração, preferência e letras em andamento passaram.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

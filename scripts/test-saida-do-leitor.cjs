/**
 * O Now Playing do PC sai em vez de desaparecer (20/10, `desktop/useSaida.web.ts`).
 *
 * Corre o hook num React de ensaio que faz o que o verdadeiro faz com um
 * `setState` durante o render: volta a correr o componente antes de o mostrar.
 * É isso que garante que não há um fotograma sem a camada entre "fechou" e
 * "começou a sair".
 *
 * Correr: node scripts/test-saida-do-leitor.cjs
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');

let estado = [], i = 0, efeitos = [], depsAntes = [], limpezas = [], relogios = [], agora = 0, sujo = false;
const react = {
  useState(inicial) {
    const k = i++;
    if (!(k in estado)) estado[k] = inicial;
    return [estado[k], (v) => { const novo = typeof v === 'function' ? v(estado[k]) : v; if (novo !== estado[k]) { estado[k] = novo; sujo = true; } }];
  },
  useEffect(fn, deps) {
    const k = i++;
    const mudou = !depsAntes[k] || deps.some((d, j) => d !== depsAntes[k][j]);
    if (mudou) { depsAntes[k] = deps; efeitos.push(() => { limpezas[k]?.(); limpezas[k] = fn() || null; }); }
  },
};
const modulo = { exports: {} };
const codigo = ts.transpileModule(fs.readFileSync('src/desktop/useSaida.web.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(codigo, {
  module: modulo, exports: modulo.exports, require: (m) => { if (m === 'react') return react; throw new Error(m); },
  setTimeout: (fn, ms) => { relogios.push({ fn, quando: agora + ms, vivo: true }); return relogios.length - 1; },
  clearTimeout: (id) => { if (relogios[id]) relogios[id].vivo = false; },
});
const { useSaida, SAIDA_DO_LEITOR_MS } = modulo.exports;

/** Um render como o do React: repete enquanto o próprio render mudou o estado; depois corre os efeitos. */
function render(aberto) {
  let saida, voltas = 0;
  do { sujo = false; i = 0; efeitos = []; saida = useSaida(aberto, SAIDA_DO_LEITOR_MS); assert.ok(++voltas < 5, 'o render não pára'); } while (sujo);
  for (const e of efeitos) e();
  return { montado: saida.montado, aSair: saida.aSair };
}
/** Passa o tempo; um relógio que dispara muda o estado e o componente volta a desenhar-se. */
function andar(ms, aberto) {
  agora += ms;
  let r = null;
  for (const t of relogios) if (t.vivo && t.quando <= agora) { t.vivo = false; t.fn(); r = render(aberto); }
  return r;
}

assert.ok(SAIDA_DO_LEITOR_MS >= 300 && SAIDA_DO_LEITOR_MS <= 500, 'perto do tempo da entrada da cor (450 ms)');

assert.deepEqual(render(false), { montado: false, aSair: false }, 'fechado de início: nada montado');
assert.deepEqual(render(true), { montado: true, aSair: false }, 'aberto');
// O fecho: no MESMO render continua montado, já a sair -- sem fotograma vazio.
assert.deepEqual(render(false), { montado: true, aSair: true }, 'ao fechar fica montado e a sair');
assert.equal(andar(SAIDA_DO_LEITOR_MS - 1, false), null, 'antes do fim continua');
assert.deepEqual(andar(1, false), { montado: false, aSair: false }, 'no fim desmonta');

// Reabrir a meio da saída cancela-a, e o relógio velho não a fecha depois.
render(true);
assert.deepEqual(render(false), { montado: true, aSair: true });
andar(100, false);
assert.deepEqual(render(true), { montado: true, aSair: false }, 'reaberto a meio: volta a estar aberto');
assert.equal(andar(SAIDA_DO_LEITOR_MS, true), null, 'a saída cancelada não dispara');
assert.deepEqual(render(true), { montado: true, aSair: false });

// Fechar outra vez começa uma saída nova, inteira.
assert.deepEqual(render(false), { montado: true, aSair: true });
assert.deepEqual(andar(SAIDA_DO_LEITOR_MS, false), { montado: false, aSair: false });

// O RootNavigator usa-o para a camada e para a cor da janela.
const nav = fs.readFileSync('src/navigation/RootNavigator.web.tsx', 'utf8').replace(/\r\n/g, '\n');
assert.match(nav, /const saidaDoLeitor = useSaida\(nowPlayingOpen, SAIDA_DO_LEITOR_MS\);/);
assert.match(nav, /\{saidaDoLeitor\.montado&&<View pointerEvents=\{saidaDoLeitor\.aSair\?'none':'auto'\}/, 'a sair já não apanha cliques');
assert.match(nav, /<FundoDaCapa onde="janela" aApagar=\{aApagarACor\}/, 'a cor da capa apaga-se');
assert.match(nav, /marcar\('main-a-voltar'\)/, 'a superfície volta ao fundo dela ao mesmo passo');
const casca = fs.readFileSync('src/desktop/casca.web.tsx', 'utf8').replace(/\r\n/g, '\n');
assert.match(casca, /\[data-dt~="np-a-sair"\]\{ animation: dt-np-sai /);
assert.match(casca, /\[data-dt~="janela-cor"\]\[data-dt~="a-apagar"\]\{ animation: dt-np-cor-sai 420ms/);

console.log('Saída do Now Playing do PC: fica montado a apagar-se, desmonta no fim, reabrir cancela, e a cor sai com ele.');

// A fila partilhada do PC: ordem real, Jam, seguir amigos e ações com índices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const track = (id) => ({ source: 'youtube', sourceId: id, title: id });
const a = track('a'), b = track('b'), c = track('c');
const calls = [];
const player = {
  current: a, queue: [a, b, c], queueIndex: 0, shuffle: true, shuffleOrder: [0, 2, 1],
  repeatMode: 'off', autoplayRadio: true, radioError: null, origemDaFila: null,
  upcomingQueue: () => [{ track: c, index: 2 }, { track: b, index: 1 }],
  playTrack: (...args) => calls.push(['play', ...args]),
  reordenarProximas: (...args) => calls.push(['move', ...args]),
  limparProximas: () => { calls.push(['clear']); return 2; },
};
const jam = { sessao: null, fila: [{ track: b }] };
const amigo = { seguindo: null, aSeguir: [c] };
const usePlayer = (select) => select(player);
usePlayer.getState = () => player;
let cursor = 0, state = [];
const react = {
  useMemo: (f) => f(), useEffect() {},
  useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = initial;
    return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
  },
};
function carregar(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, setTimeout, clearTimeout, require: (name) => {
    assert.ok(name in mocks, `${file}: import sem duplo: ${name}`);
    return mocks[name];
  } });
  return exports;
}
const { useFilaDoLeitor } = carregar('src/desktop/useFilaDoLeitor.web.ts', {
  react, '../state/player': { usePlayer },
  '../state/ouvirJuntos': { useOuvirJuntos: (select) => select(jam) },
  '../state/seguirAmigo': { useSeguirAmigo: (select) => select(amigo) },
  '../lib/leitorDoPc': carregar('src/lib/leitorDoPc.ts'),
  '../lib/grelhaQueCresce': carregar('src/lib/grelhaQueCresce.ts'),
});
const render = () => { cursor = 0; return useFilaDoLeitor({ more: (...args) => calls.push(['menu', ...args]), notify: (text) => calls.push(['notice', text]) }); };
let fila = render();
assert.equal(fila.upNext[0].track, c, 'mostra o percurso do shuffle, não a ordem natural');
fila.aoTocar(c);
assert.equal(calls.at(-1)[2], player.queue, 'saltar numa linha conserva a fila e a sua origem');
fila.aoMenu(c, 2);
assert.equal(calls.at(-1)[3].fila, 2, 'o menu recebe o índice real, não a posição visível');
fila.aoMover(0, 1);
assert.deepEqual(calls.at(-1), ['move', 0, 1], 'reordena as próximas, também com shuffle');
fila.limpar();
assert.ok(!calls.some((x) => x[0] === 'clear'), 'Clear pede confirmação');
fila = render();
assert.equal(fila.aConfirmarLimpar, true);
fila.limpar();
assert.equal(calls.at(-2)[0], 'clear');
assert.equal(calls.at(-1)[0], 'notice');

jam.sessao = { id: 'jam' };
fila = render();
assert.equal(fila.upNext[0].track, b, 'no Jam mostra a fila da sala');
assert.equal(fila.podeEditar, false);
assert.equal(fila.notaDoFim, null);
let antes = calls.length;
fila.aoMover(0, 1); fila.limpar();
assert.equal(calls.length, antes, 'não muda a fila da sala por uma porta lateral');
fila.aoMenu(b, 0);
assert.equal(calls.at(-1).length, 2, 'não passa o índice do Jam ao menu da fila pessoal');

amigo.seguindo = { userId: 'amigo' };
fila = render();
assert.equal(fila.upNext[0].track, c, 'a fila do amigo tem prioridade enquanto se segue');
assert.equal(fila.podeEditar, false);
antes = calls.length;
fila.aoTocar(c); fila.aoMover(0, 1); fila.limpar();
assert.equal(calls.length, antes, 'a fila do amigo é só de leitura');
fila.aoMenu(c, 0);
assert.equal(calls.at(-1).length, 2, 'o índice do amigo nunca remove uma faixa local');

jam.sessao = null; amigo.seguindo = null;
player.upcomingQueue = () => Array.from({ length: 2700 }, (_, index) => ({ track: b, index }));
state = [];
fila = render();
assert.equal(fila.linhasDaFila, 100);
fila.aoRolar({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 600 }, contentSize: { height: 5600 } } });
assert.equal(render().linhasDaFila, 100, 'não monta toda a biblioteca ao abrir');
fila.aoRolar({ nativeEvent: { contentOffset: { y: 5100 }, layoutMeasurement: { height: 600 }, contentSize: { height: 5600 } } });
assert.equal(render().linhasDaFila, 200, 'acrescenta um lote ao chegar perto do fim');
console.log('Fila do leitor no PC: shuffle, índices, Clear, Jam, amigos e carregamento por lotes passaram.');

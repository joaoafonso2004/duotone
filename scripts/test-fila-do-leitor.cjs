// A fila partilhada do PC: ordem real, Jam, seguir amigos e ações com índices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const track = (id) => ({ source: 'youtube', sourceId: id, title: id });
const a = track('a'), b = track('b'), c = track('c');
const calls = [];
const avisos = [];
const player = {
  current: a, queue: [a, b, c], queueIndex: 0, shuffle: true, shuffleOrder: [0, 2, 1],
  repeatMode: 'off', autoplayRadio: true, radioError: null, origemDaFila: null,
  upcomingQueue: () => [{ track: c, index: 2 }, { track: b, index: 1 }],
  playTrack: (...args) => calls.push(['play', ...args]),
  reordenarProximas: (...args) => calls.push(['move', ...args]),
  limparProximas: () => { calls.push(['clear']); return 2; },
  // O grupo da Radio e as animações (30/10): o que a store diz da Radio e o Undo do Clear.
  doRadio: [], radioTipo: 'musica', radioMode: 'off',
  fotografiaDaFila: () => ({ foto: 'antes' }),
  reporFila: (foto) => { calls.push(['repor', foto.foto]); return true; },
};
const jam = { sessao: null, fila: [{ track: b }] };
const amigo = { seguindo: null, aSeguir: [c] };
const usePlayer = (select) => select(player);
usePlayer.getState = () => player;
let cursor = 0, state = [];
const react = {
  useMemo: (f) => f(), useEffect() {},
  // Uma referência por posição, como o estado: a mesma de render para render.
  useRef(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = { current: initial };
    return state[i];
  },
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
const leitorDoPc = carregar('src/lib/leitorDoPc.ts');
const { useFilaDoLeitor } = carregar('src/desktop/useFilaDoLeitor.web.ts', {
  react, '../state/player': { usePlayer },
  '../lib/shuffle': { trackKey: (t) => `${t.source}:${t.sourceId}` },
  '../lib/avisoDeRemocao': {
    avisarRemocao: (aviso) => { calls.push(['aviso', aviso.texto, aviso.detalhe]); avisos.push(aviso); },
    contarMusicas: (n) => (n === 1 ? '1 song' : `${n} songs`),
  },
  '../state/ouvirJuntos': { useOuvirJuntos: (select) => select(jam) },
  '../state/seguirAmigo': { useSeguirAmigo: (select) => select(amigo) },
  '../lib/leitorDoPc': leitorDoPc,
  '../lib/grelhaQueCresce': carregar('src/lib/grelhaQueCresce.ts'),
  // Guardar a fila como playlist (11/10): a API é um duplo; o nome e as faixas são puros.
  '../api/playlists': {
    createPlaylist: async (nome) => { calls.push(['create', nome]); return { id: 'nova' }; },
    addTracksToPlaylist: async (id, faixas) => { calls.push(['add', id, faixas.map((t) => t.sourceId)]); },
  },
  '../lib/guardarFila': carregar('src/lib/guardarFila.ts'),
  '../lib/mensagemDeErro': carregar('src/lib/mensagemDeErro.ts'),
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
// As linhas saem primeiro, em cascata (30/10): a fila só muda DEPOIS, e um
// segundo clique durante a saída não faz nada.
assert.ok(!calls.some((x) => x[0] === 'clear'), 'a fila só muda depois de as linhas saírem');
fila = render();
assert.equal(fila.saida, 'limpar');
assert.equal(fila.aLimpar, true);
fila.limpar();
assert.ok(!calls.some((x) => x[0] === 'clear'));

// O grupo da Radio: a cauda da fila feita só de músicas da Radio (as chaves vêm do `trackKey`).
state = [];
player.doRadio = ['youtube:b'];
assert.equal(render().inicioDoGrupo, 1, 'a Radio juntou a última: o grupo começa nela');
player.doRadio = ['youtube:c'];
assert.equal(render().inicioDoGrupo, -1, 'uma da Radio no meio do que escolheste não abre grupo');
player.doRadio = ['youtube:b', 'youtube:c'];
assert.equal(render().inicioDoGrupo, 0);
player.doRadio = [];
// Enquanto a Radio procura, as linhas viram e saem; quando a nova chega, entra a virar.
player.radioMode = 'preparing';
assert.equal(render().saida, 'vira');
player.radioMode = 'off';
assert.equal(render().saida, null);
state = [];

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

// A seta abria e fechava aos solavancos (11/10): animava-se a LARGURA da calha,
// e a página toda voltava a ser arrumada a cada fotograma. Só o transform anima.
const casca = fs.readFileSync(require('node:path').join(__dirname, '../src/desktop/casca.web.tsx'), 'utf8');
assert.match(casca, /\[data-dt~="painel-do-leitor"\] \{ transition: transform 240ms/);
assert.doesNotMatch(casca, /painel-do-leitor"\] \{ transition: width/);
const painel = fs.readFileSync(require('node:path').join(__dirname, '../src/desktop/PainelDoLeitor.web.tsx'), 'utf8');
assert.match(painel, /transform: `translateX\(\$\{noSitio \? 0 : 100\}%\)`/, 'o painel desliza nos dois modos');
// A seta ficava no canto do conteúdo, por cima dos botões das páginas (11/10):
// vive na barra de título, à esquerda do minimizar.
assert.match(casca, /<View style=\{styles\.dragRegion as any\} \/>\s*\{comPainel \? <SetaDoPainel \/> : null\}/, 'a seta na barra de título, e só com a app aberta (não no login)');
assert.match(fs.readFileSync(require('node:path').join(__dirname, '../src/navigation/RootNavigator.web.tsx'), 'utf8'), /<TitleBar comPainel \/>/);
assert.match(painel, /overflow: 'clip'/, 'a janela não se deixa deslizar pelo foco');
assert.match(painel, /focus\?\.\(\{ preventScroll: true \}\)/, 'o foco não desliza nada');
assert.doesNotMatch(painel, /position: 'absolute', right: 16, top: 12/, 'a seta já não flutua por cima das páginas');

// Guardar a fila (11/10): a que toca e as próximas, sem repetidas, com o nome escolhido.
(async () => {
  // Passada a saída, a fila muda e o aviso deixa desfazer (como no iPhone).
  await new Promise((resolve) => setTimeout(resolve, leitorDoPc.esperaDaSaida(2) + 150));
  assert.equal(calls.filter((x) => x[0] === 'clear').length, 1, 'a fila mudou uma vez, depois da saída');
  assert.deepEqual(calls.find((x) => x[0] === 'aviso'), ['aviso', 'Cleared 2 songs', 'from Up next']);
  avisos[0].desfazer();
  assert.deepEqual(calls.find((x) => x[0] === 'repor'), ['repor', 'antes'], 'o Undo repõe a fotografia tirada antes');
  player.upcomingQueue = () => [{ track: c, index: 2 }, { track: a, index: 0 }, { track: b, index: 1 }];
  state = [];
  fila = render();
  fila.pedirNome();
  fila = render();
  assert.match(fila.aGuardar.nome, /^Queue · /, 'sem origem, "Queue · dia"');
  await fila.guardar('  Noite  ');
  assert.deepEqual(calls.find((x) => x[0] === 'create'), ['create', 'Noite']);
  // Por JSON: o array nasce no `vm`, outro reino.
  assert.equal(JSON.stringify(calls.find((x) => x[0] === 'add')), JSON.stringify(['add', 'nova', ['a', 'c', 'b']]), 'a que toca primeiro, sem repetidas');
  assert.match(calls.at(-1)[1], /Saved “Noite” · 3 songs/);
  console.log('Fila do leitor no PC: shuffle, índices, Clear, Jam, amigos, carregamento por lotes e Save passaram.');
})().catch((e) => { console.error(e); process.exit(1); });

// Executa a página iOS real e carrega dados por efeitos. Verifica as filas
// enviadas ao player pelos botões e pelas linhas, sem tocar na rede/áudio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const slots = [], effects = [];
let cursor = 0;
const slot = initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial(); return i; };
const changed = (a, b) => !a || !b || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
const React = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) { const i = slot(() => typeof initial === 'function' ? initial() : initial);
    return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useMemo(fn, deps) { const i = slot(() => ({})); if (changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
  useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
  useRef(initial) { const i = slot(() => ({current:initial})); return slots[i]; },
  useEffect(fn, deps) { const i = slot(() => ({})); if (changed(slots[i].deps, deps)) {
    slots[i].cleanup?.(); slots[i].deps = deps; effects.push(() => { slots[i].cleanup = fn(); });
  } },
};
// Hooks importados são funções soltas, sem `this`.
React.useCallback = (fn, deps) => React.useMemo(() => fn, deps);
const track = (id, duration) => ({ source: 'youtube', sourceId: id, title: id, artist: 'Isak', durationSeconds: duration });
const library = [track('saved-a', 100), track('saved-b', 120)];
// Mais do que as cinco à vista (20/10): o "See all songs" tem de aparecer.
const more = ['a', 'b', 'c', 'd', 'e'].map((x, i) => track(`more-${x}`, 180 + i));
const album = { id: 'album', title: 'Jon', artworkUrl: null, channelTitle: 'Album · 2026', tipo: 'Album', ano: '2026' };
const single = { id: 'single', title: 'Tia', artworkUrl: null, channelTitle: 'Single · 2025', tipo: 'Single', ano: '2025' };
const page = { musicas: [library[0], ...more], albuns: [album, single], mix: { playlistId: 'radio', videoId: 'radio-a' }, maisRecente: null, foto: 'canal.jpg' };
let resolverPagina;
const paginaPromise = new Promise(resolve => { resolverPagina = resolve; });
const calls = [], pushes = [];
const player = {
  shuffle: false, shuffleInteligente: false,
  tocarLista: async (...args) => calls.push(['list', ...args]),
  playTrack: (...args) => calls.push(['track', ...args]),
  // Tocar numa linha (6/10): a mesma fila, pela ação que sabe do "Start Radio from a song".
  tocarMusica: (...args) => calls.push(['track', ...args]),
  toggleShuffle: () => {},
};
const usePlayer = Object.assign(selector => selector(player), { getState: () => player });
const mocks = {
  react: React,
  'react-native': { ActivityIndicator: 'Spinner', Alert: { alert: (...args) => calls.push(['alert', ...args]) },
    FlatList: 'FlatList', Animated: { FlatList: 'FlatList', ScrollView: 'ScrollView', View: 'AnimatedView' }, Pressable: 'Pressable', Text: 'Text', View: 'View',
    StyleSheet: { create: x => x, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
  '@react-navigation/native': { useFocusEffect: fn => React.useEffect(fn, [fn]) },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
  'expo-image': { Image: 'Image' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' }, '@expo/vector-icons/Ionicons': 'Icon',
  // As peças da página (23/10, docs/artista-ios-maquete.html) e a vizinhança do catálogo, sem rede.
  '../components/SeccoesDoArtista': {
    alturaDaCapaDoArtista: () => 540, BolaDeVidro: 'GlassBall', BotaoDeTocar: 'PlayButton', CabecalhoDaSeccao: 'SectionHeader',
    CapaDoArtista: 'ArtistHero', DiscosDoArtista: 'Discs', FundoDaCorDoArtista: 'Tint', GrelhaDeMusicas: 'SongsGrid',
    LancamentoEmDestaque: 'Latest', ParecidosDoArtista: 'Similar', PilulaDeVidro: 'GlassPill', SobreOArtista: 'About',
  },
  '../components/MusicasDoArtistaSheet': { MusicasDoArtistaSheet: 'SongsSheet' },
  '../hooks/useVizinhancaDoArtista': { useVizinhancaDoArtista: () => ({ fas: 5_100_000, parecidos: ['Bon Iver'] }) },
  '../components/BrilhoDoEcra': { BrilhoDoEcra: 'Glow' }, '../components/EmptyState': { EmptyState: 'Empty' },
  '../components/Skeleton': { SkeletonDeFaixas: 'Skeleton', SkeletonDePrateleira: 'ShelfSkeleton' },
  '../state/gruposDaBiblioteca': { gruposDaBiblioteca: tracks => [{chave:'isak',faixas:tracks}] },
  '../state/doca': { useAlturaDosSeparadores: () => 54 },
  '../lib/avisoDeRemocao': { avisarErro() {} },
  '../components/PillButton': { PillButton: 'Pill' }, '../components/Screen': { Screen: 'Screen', useCabecalhoQueEncolhe: () => ({
    rolagem: { setValue() {}, interpolate: () => 0 }, onScroll: undefined, scrollEventThrottle: 16, espaco: 0, definirEspaco() {}, repor() {},
  }) },
  '../components/TrackActionsSheet': { TrackActionsSheet: 'Actions' }, '../components/TrackRow': { TrackRow: 'TrackRow' },
  '../components/YtPlaylistRecommendationSheet': { YtPlaylistRecommendationSheet: 'AlbumSheet' },
  '../state/catalogoDeFaixas': { comCatalogo: x => x }, '../api/library': { getLibrary: async () => library },
  '../lib/cacheDaBiblioteca': { lerFaixas: async read => read() }, '../api/catalogo': { fotoDoArtista: async () => 'catalogo.jpg', fotoJaConhecida: () => undefined },
  '../api/albunsDoArtista': { paginaDoArtista: () => paginaPromise }, '../api/search': { pesquisarMusica: async () => ({ faixas: more, continuacao: null, detalhes: {} }) },
  '../state/artistasFavoritos': { useArtistasFavoritos: Object.assign(selector => selector({ chaves: new Set(), alternar() {} }), { getState: () => ({ carregar: async () => {} }) }) },
  '../state/novosLancamentos': { marcarArtistaAberto() {} },
  // A ordem tem o seu teste (test-ordem-do-artista.ts): aqui fica a da lista.
  '../lib/ordemDoArtista': {
    detalheDaLinha: () => null, infoDe: () => null, ordenarMusicasDoArtista: lista => lista,
    infoDaPesquisa: () => ({ porVideo: {}, porTitulo: {} }), modosComDados: () => [],
  },
  '../lib/albunsDoArtista': { chaveDoTitulo: x => x },
  '../lib/prefs': { getOrdemDoArtista: async () => 'ouvidas', setOrdemDoArtista: async () => {} },
  '../state/saved': { useSaved: { getState: () => ({ refresh() {} }) } }, '../state/player': { usePlayer },
  '../state/mixDoArtista': { tocarMixDoArtista: async (...args) => { calls.push(['mix', ...args]); return true; } },
  '../state/theme': { useTheme: selector => selector({ theme: { gradient: ['#000', '#333'], color: '#fff' } }) },
  '../theme': { colors: {}, spacing: {}, radii: {}, type: {}, MINI_PLAYER_HEIGHT: 64 }, '../lib/haptics': { hapticSelection() {} },
  '../lib/artistName': { chaveDeArtista: name => name.toLowerCase(), displayArtist: t => t.artist, tituloDaFaixa: t => t.title,
    agruparPorArtista: tracks => [{ chave: 'isak', faixas: tracks }] },
  '../lib/capaDoEcraBloqueado': { capaParaLista: x => x },
};
// As regras da lista e do cabeçalho (20/10) são as verdadeiras, e não um duplo.
{
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'src/lib/musicasDoArtista.ts'), 'utf8');
  const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m, exports: m.exports });
  mocks['../lib/musicasDoArtista'] = m.exports;
}
const file = path.join(__dirname, '..', 'src/screens/LibraryGroupScreen.tsx');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(code, { setTimeout, clearTimeout, requestAnimationFrame: fn => setImmediate(fn), cancelAnimationFrame: clearImmediate,
  module: moduleUnderTest, exports: moduleUnderTest.exports, require: id => {
  assert.ok(id in mocks, 'Import sem duplo: ' + id); return mocks[id];
} });
const Screen = moduleUnderTest.exports.LibraryGroupScreen;
let tree;
// A imagem do topo a cada desenho (23/10): abre com a que se tocou e muda no máximo uma vez.
const herois = [];
function render() { cursor = 0; tree = Screen({ route: { params: { type: 'artist', name: 'Isak', capa: 'capa-tocada.jpg' } }, navigation: { goBack() {}, push: (...args) => pushes.push(args) } });
  const heroi = find(n => n.type === 'ArtistHero'); if (heroi) herois.push(heroi.props.foto);
  effects.splice(0).forEach(fn => fn()); return tree; }
const nodes = node => !node || typeof node !== 'object' ? [] : [node,
  ...(node.props?.children ?? []).flat(Infinity).flatMap(nodes),
  ...nodes(node.props?.accoes), ...nodes(node.props?.topLeft)];
const text = node => typeof node === 'string' ? node : (node?.props?.children ?? []).flat(Infinity).map(text).join('');
const find = predicate => nodes(tree).find(predicate);
// O Play grande (nas ações do cabeçalho); o pequeno da barra de cima vem depois.
const play = () => nodes(find(n => n.type === 'ArtistHero')).find(n => n.type === 'PlayButton' && n.props.label === 'Play Isak');
const grelha = () => find(n => n.type === 'SongsGrid');
const folha = () => find(n => n.type === 'SongsSheet');
const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); render(); } };
const ids = tracks => Array.from(tracks, t => t.sourceId);

async function main() {
  render();
  assert.ok(find(n => n.type === 'GlassPill' && n.props.label === 'Isak Mix'), 'Mix está presente antes de qualquer resposta remota');
  assert.ok(find(n => n.type === 'Skeleton' && n.props.linhas === 4), 'a primeira imagem já contém o carregamento das Top Songs');
  await flush();
  // Uma página só (23/10): nada de separadores, e as Top Songs com o "›".
  assert.equal(nodes(tree).filter(n => n.props?.accessibilityRole === 'tab').length, 0, 'sem separadores');
  const topo = find(n => n.type === 'SectionHeader' && n.props.titulo === 'Top Songs');
  assert.ok(topo, 'o título "Top Songs"');
  // As tuas aparecem logo, sem esperar pelas do canal (que entram por baixo).
  assert.deepEqual(ids(grelha().props.musicas), ['saved-a', 'saved-b'], 'as tuas não esperam pela rede');
  assert.ok(find(n => n.type === 'Skeleton' && n.props.linhas === 2), 'as outras dele a chegar, por baixo');
  assert.ok(find(n => n.type === 'ShelfSkeleton'), 'a discografia a chegar');
  play().props.onPress();
  assert.deepEqual(ids(calls.at(-1)[1]), ['saved-a', 'saved-b'], 'o Play toca o que já há');
  // Por baixo do nome, os fãs e quantas são tuas; nunca "0 songs".
  const heroi = find(n => n.type === 'ArtistHero');
  assert.equal(heroi.props.fas, '5.1M fans'); assert.equal(heroi.props.tuas, '2 in your library');
  resolverPagina(page); await flush();
  const todas = ['saved-a', 'saved-b', 'more-a', 'more-b', 'more-c', 'more-d', 'more-e'];
  assert.deepEqual(ids(grelha().props.musicas), todas, 'as tuas primeiro, depois as dele, na grelha (até 12)');
  assert.ok(!find(n => n.type === 'Skeleton' || n.type === 'ShelfSkeleton'), 'chegaram: sem esqueletos');
  const linha = t => grelha().props.renderLinha(t);
  assert.equal(linha(library[0]).props.showSavedBadge, true, 'as tuas vêm marcadas');
  // O Play e as linhas tocam a página toda.
  for (const [shuffle, smart] of [[true, false], [true, true], [false, false]]) {
    player.shuffle = shuffle; player.shuffleInteligente = smart; render(); play().props.onPress();
    assert.deepEqual(ids(calls.at(-1)[1]), todas);
    assert.equal(calls.at(-1)[2], shuffle); assert.equal(calls.at(-1)[3], smart, 'respeita o modo do leitor');
  }
  linha(more[1]).props.onPress();
  assert.deepEqual(ids(calls.at(-1)[2]), todas, 'tocar uma linha usa a mesma fila');
  // O "›" das Top Songs abre a folha com todas: tocar uma, ou todas baralhadas.
  assert.equal(folha().props.visible, false);
  find(n => n.type === 'SectionHeader' && n.props.titulo === 'Top Songs').props.aoCarregar(); render();
  assert.equal(folha().props.visible, true, 'a folha abriu');
  assert.deepEqual(ids(folha().props.musicas), todas);
  assert.equal(folha().props.chavesTuas.size, 2, 'sabe quais são as tuas');
  folha().props.aoTocar(more[2]); assert.deepEqual(ids(calls.at(-1)[2]), todas, 'da folha, a fila é a página toda');
  player.shuffle = false; render(); folha().props.aoTocarTudo(true);
  assert.equal(calls.at(-1)[0], 'list'); assert.equal(calls.at(-1)[2], true, 'o Shuffle da folha baralha');
  folha().props.onClose(); render(); assert.equal(folha().props.visible, false);
  // A discografia em dois carrosséis; um disco abre a folha dele.
  const discos = nodes(tree).filter(n => n.type === 'Discs');
  assert.deepEqual(discos.map(d => [d.props.titulo, d.props.discos.map(x => x.id)]), [['Albums', ['album']], ['Singles & EPs', ['single']]]);
  discos[1].props.aoAbrir(single); render();
  assert.equal(find(n => n.type === 'AlbumSheet').props.playlistId, 'single');
  // "Fans Also Like" abre a página do outro artista.
  const parecidos = find(n => n.type === 'Similar');
  assert.deepEqual(parecidos.props.nomes, ['Bon Iver']);
  parecidos.props.aoAbrir('Bon Iver');
  assert.equal(JSON.stringify(pushes.at(-1)), JSON.stringify(['LibraryGroup', { type: 'artist', name: 'Bon Iver' }]));
  // O About fecha a página com os números que ela já tem.
  const sobre = find(n => n.type === 'About');
  assert.equal(sobre.props.fas, '5.1M fans');
  assert.equal(sobre.props.numeros.map(x => `${x.valor} ${x.rotulo}`).join(' | '), '2 in your library | 7 songs | 1 album');
  find(n => n.type === 'GlassPill' && n.props.label === 'Isak Mix').props.onPress(); await flush();
  const mix = calls.find(c => c[0] === 'mix'); assert.equal(mix[1], 'Isak'); assert.equal(mix[2].mix.playlistId, 'radio');
  // A imagem do topo: a capa que se tocou, e depois a do catálogo, uma vez e sem passar pela do canal.
  const trocas = herois.filter((f, i) => i === 0 || f !== herois[i - 1]);
  assert.deepEqual(trocas, ['capa-tocada.jpg', 'catalogo.jpg'], 'a imagem do topo muda uma vez: ' + trocas.join(' -> '));
  console.log('Página do artista: as tuas primeiro e marcadas na grelha, a folha com todas, o cabeçalho sem "0 songs", a fila da página toda, shuffle, discografia, parecidos, About, Mix e a imagem que muda uma vez passaram.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

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
const more = [track('more-a', 180), track('more-b', 200)];
const album = { id: 'album', title: 'Jon', artworkUrl: null, channelTitle: 'Album · 2026' };
const page = { musicas: [library[0], ...more], albuns: [album], mix: { playlistId: 'radio', videoId: 'radio-a' }, maisRecente: null };
let resolverPagina;
const paginaPromise = new Promise(resolve => { resolverPagina = resolve; });
const calls = [];
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
    FlatList: 'FlatList', Animated: { FlatList: 'FlatList' }, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: x => x, hairlineWidth: 1 } },
  '@react-navigation/native': { useFocusEffect: fn => React.useEffect(fn, [fn]) },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
  'expo-image': { Image: 'Image' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' }, '@expo/vector-icons/Ionicons': 'Icon',
  '../components/CabecalhoDaPlaylist': { CabecalhoDaPlaylist: 'Header' },
  '../components/BrilhoDoEcra': { BrilhoDoEcra: 'Glow' }, '../components/EmptyState': { EmptyState: 'Empty' },
  '../components/Skeleton': { SkeletonDeFaixas: 'Skeleton' },
  '../state/gruposDaBiblioteca': { gruposDaBiblioteca: tracks => [{chave:'isak',faixas:tracks}] },
  '../state/doca': { useAlturaDosSeparadores: () => 54 },
  '../lib/avisoDeRemocao': { avisarErro() {} },
  '../components/PillButton': { PillButton: 'Pill' }, '../components/Screen': { Screen: 'Screen', useCabecalhoQueEncolhe: () => ({
    rolagem: { setValue() {} }, onScroll: undefined, scrollEventThrottle: 16, espaco: 0, definirEspaco() {}, repor() {},
  }) },
  '../components/TrackActionsSheet': { TrackActionsSheet: 'Actions' }, '../components/TrackRow': { TrackRow: 'TrackRow' },
  '../components/YtPlaylistRecommendationSheet': { YtPlaylistRecommendationSheet: 'AlbumSheet' },
  '../state/catalogoDeFaixas': { comCatalogo: x => x }, '../api/library': { getLibrary: async () => library },
  '../lib/cacheDaBiblioteca': { lerFaixas: async read => read() }, '../api/catalogo': { fotoDoArtista: async () => null },
  '../api/albunsDoArtista': { paginaDoArtista: () => paginaPromise }, '../api/search': { pesquisarFaixas: async () => more },
  '../state/artistasFavoritos': { useArtistasFavoritos: Object.assign(selector => selector({ chaves: new Set(), alternar() {} }), { getState: () => ({ carregar: async () => {} }) }) },
  '../state/saved': { useSaved: { getState: () => ({ refresh() {} }) } }, '../state/player': { usePlayer },
  '../state/mixDoArtista': { tocarMixDoArtista: async (...args) => { calls.push(['mix', ...args]); return true; } },
  '../state/theme': { useTheme: selector => selector({ theme: { gradient: ['#000', '#333'], color: '#fff' } }) },
  '../theme': { colors: {}, spacing: {}, radii: {}, type: {}, MINI_PLAYER_HEIGHT: 64 }, '../lib/haptics': { hapticSelection() {} },
  '../lib/artistName': { chaveDeArtista: name => name.toLowerCase(), displayArtist: t => t.artist,
    agruparPorArtista: tracks => [{ chave: 'isak', faixas: tracks }] },
  '../lib/capaDoEcraBloqueado': { capaParaLista: x => x },
};
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
function render() { cursor = 0; tree = Screen({ route: { params: { type: 'artist', name: 'Isak' } }, navigation: { goBack() {} } });
  effects.splice(0).forEach(fn => fn()); return tree; }
const nodes = node => !node || typeof node !== 'object' ? [] : [node,
  ...(node.props?.children ?? []).flat(Infinity).flatMap(nodes),
  ...nodes(node.props?.ListHeaderComponent), ...nodes(node.props?.accoes)];
const text = node => typeof node === 'string' ? node : (node?.props?.children ?? []).flat(Infinity).map(text).join('');
const find = predicate => nodes(tree).find(predicate);
const play = () => find(n => n.props?.accessibilityLabel === 'Play Isak');
const list = () => find(n => n.type === 'FlatList');
function tab(name) { const node = find(n => n.props?.accessibilityRole === 'tab' && text(n) === name); assert.ok(node, name); node.props.onPress(); render(); }
const flush = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); render(); } };
const ids = tracks => Array.from(tracks, t => t.sourceId);

async function main() {
  render();
  assert.ok(find(n=>n.props?.accessibilityLabel==='Isak Mix'),'Mix está presente antes de qualquer resposta remota');
  assert.equal(list().props.ListEmptyComponent.type,'Skeleton','a primeira imagem já contém o carregamento da lista');
  await flush();
  play().props.onPress();
  assert.deepEqual(ids(calls.at(-1)[1]), ['saved-a', 'saved-b'], 'Library Play só toca a biblioteca');
  tab('More songs');
  assert.equal(play().props.disabled, true, 'aguarda as mesmas músicas que a lista vai mostrar');
  const antes = calls.length; play().props.onPress(); assert.equal(calls.length, antes, 'não começa uma lista provisória');
  resolverPagina(page); await flush();
  assert.deepEqual(ids(list().props.data), ['more-a', 'more-b'], 'a aba exclui as já guardadas');
  play().props.onPress();
  assert.deepEqual(ids(calls.at(-1)[1]), ['more-a', 'more-b'], 'More songs Play começa na sua lista, sem músicas guardadas');
  const header = find(n => n.type === 'Header');
  assert.equal(header.props.faixas, 2); assert.equal(header.props.duracaoSegundos, 380, 'duração da lista escolhida');
  for (const [shuffle, smart] of [[true, false], [true, true], [false, false]]) {
    player.shuffle = shuffle; player.shuffleInteligente = smart; render(); play().props.onPress();
    assert.deepEqual(ids(calls.at(-1)[1]), ['more-a', 'more-b']);
    assert.equal(calls.at(-1)[2], shuffle); assert.equal(calls.at(-1)[3], smart, 'respeita o modo do leitor');
  }
  list().props.renderItem({ item: more[1] }).props.onPress();
  assert.deepEqual(ids(calls.at(-1)[2]), ['more-a', 'more-b'], 'tocar uma linha usa a mesma fila');
  find(n => n.props?.accessibilityLabel === 'Isak Mix').props.onPress(); await flush();
  const mix = calls.find(c => c[0] === 'mix'); assert.equal(mix[1], 'Isak'); assert.equal(mix[2].mix.playlistId, 'radio');
  tab('Albums'); assert.equal(play(), undefined, 'Albums não toca silenciosamente a biblioteca');
  tab('In your library'); play().props.onPress(); assert.deepEqual(ids(calls.at(-1)[1]), ['saved-a', 'saved-b']);
  // Não há fallback para a biblioteca quando a aba More songs está vazia.
  page.musicas = [...library];
  tab('More songs'); assert.equal(play(), undefined, 'sem músicas nesta aba não toca outra lista');
  console.log('Play da aba do artista: biblioteca, More songs, fila das linhas, shuffle, Mix, Albums e lista vazia passaram.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

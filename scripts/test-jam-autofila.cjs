// Executa a store do Jam e o pipeline de descoberta reais. Só armazenamento,
// rede e catálogo são duplos; os nomes, afinidade, escolha e matching são reais.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const { create } = require('zustand');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const dependencies = path.resolve(process.argv[3] || root);
const pure = new Map();
function load(file, mocks = {}) {
  const local = path.join(root, file);
  const source = fs.readFileSync(fs.existsSync(local) ? local : path.join(dependencies, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.') && (name.includes('/lib/') || file.startsWith('src/lib/'))) {
      const dependency = path.join(path.dirname(file), name).replaceAll('\\', '/') + '.ts';
      if (!pure.has(dependency)) pure.set(dependency, load(dependency));
      return pure.get(dependency);
    }
    throw Error('Missing mock: ' + name);
  }, module, module.exports);
  return module.exports;
}
const track = (id, artist = 'Isak Zigarro') => ({
  source: 'youtube', sourceId: id, title: `${artist} - ${id}`, artist,
  album: null, artworkUrl: null, durationSeconds: 180,
});
const artist = (id, nome) => ({ id, nome, fas: 100 });
const isak = artist(1, 'Isak Zigarro'), related = artist(2, 'Related artist'), bruno = artist(3, 'Bruno Mars');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture() {
  const calls = [], inserts = [], anchors = [];
  let portrait = new Map([['Bruno Mars', 100], ['Isak Zigarro', 1]]);
  let catalogAvailable = true, gate = null;
  const library = [track('saved-bruno-1', 'Bruno Mars'), track('saved-bruno-2', 'Bruno Mars'), track('saved-bruno-3', 'Bruno Mars')];
  const metadata = new Map();
  const discovery = load('src/api/descoberta.ts', {
    './cache': { DIA_MS: 86400000 }, '../state/connectivity': { useConnectivity: { getState: () => ({ offline: false }) } },
    '../state/recommendationFeedback': { feedbackReady: async () => {}, filterSuggestions: ts => ts,
      trackIsSuppressed: () => false, artistasPreferidos: () => [], artistWeight: () => 1 },
    './library': { getLibrary: async () => library, getLibraryKeys: async () => new Set() },
    '../lib/cacheDaBiblioteca': { lerFaixas: fn => fn() },
    './plays': {}, './perfilDeRecomendacoes': {},
    './afinidade': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
    './catalogo': {
      vizinhancaConfirmada: async name => {
        anchors.push(name);
        if (!catalogAvailable) return null;
        if (name === 'Isak Zigarro') return { artista: isak, semelhantes: [related] };
        if (name === 'Bruno Mars') return { artista: bruno, semelhantes: [] };
        return null;
      },
      topDoArtista: async id => Array.from({ length: 5 }, (_, index) => {
        const selected = [isak, related, bruno].find(a => a.id === id);
        const faixa = { titulo: `Recommendation ${id}-${index}`, artista: selected.nome, duracaoS: 180 };
        metadata.set(`${faixa.artista} ${faixa.titulo}`, faixa);
        return faixa;
      }),
    },
    './ytSearchFree': { searchYouTubeFreeWithChannel: async query => {
      const faixa = metadata.get(query);
      return [{ channel: `${faixa.artista} - Topic`, track: {
        ...track(query, faixa.artista), title: `${faixa.artista} - ${faixa.titulo} (Official Audio)`,
      } }];
    } },
    './youtube': {}, '../lib/descobertasMostradas': {}, '../lib/misturaDoDia': {},
  });
  let store;
  const exports = load('src/state/ouvirJuntos.ts', {
    zustand: { create }, 'react-native': { AppState: {} },
    './player': { registarOuvirJuntos() {}, usePlayer: { getState: () => ({}) } },
    '../api/ouvirJuntos': {
      retratoDaSessao: async () => portrait,
      juntarMuitasAFila: async (id, tracks) => { inserts.push({ id, tracks }); return tracks.length; },
      lerSessao: async () => store.getState().sessao, lerFila: async () => store.getState().fila,
    },
    '../lib/relogioPartilhado': {}, '../lib/sincronizacao': {}, '../lib/appVisibility': {},
    '../lib/supabase': { supabase: {} },
    '../api/descoberta': { candidatasParaDescoberta: async (...args) => {
      calls.push(args);
      const result = await discovery.candidatasParaDescoberta(...args);
      if (gate) await gate.promise;
      return result;
    } },
    '../lib/prefs': { getJamAutoFila: async () => true, setJamAutoFila: async () => {} },
    '../lib/eventos': { registar() {} },
    // Sem o Radio da sala ligado, o enchimento é o de sempre (6/10).
    '../api/radio': { fetchRadioTracks: async () => { throw Error('sem o Radio da sala não se usa o Radio'); } },
    '../lib/radio': { espalharArtistas: (lista) => lista },
  });
  store = exports.useOuvirJuntos;
  await Promise.resolve();
  const setSession = (current, id = 'jam', hostId = 'host') => store.setState({
    sessao: { id, hostId, track: current, aTocar: true, comecouEmServidor: 10, pausadaEmMs: 0,
      convidadosControlam: true, auxDe: null, acabouEm: null }, euId: 'host', fila: [], autoFila: true,
  });
  setSession(track('isak-1'));
  return { store, calls, inserts, anchors, setSession,
    portrait: value => { portrait = value; }, catalog: value => { catalogAvailable = value; },
    hold: () => (gate = deferred()),
  };
}
const added = f => f.inserts.flatMap(insert => insert.tracks);
async function requested(f) {
  for (let attempt = 0; attempt < 50 && !f.anchors.length; attempt++) await Promise.resolve();
  assert.ok(f.anchors.length, 'o pedido de descoberta começou');
}
(async () => {
  {
    const f = await fixture();
    f.setSession(track('isak-2')); f.setSession(track('isak-3'));
    await f.store.getState().encherSeSecar();
    assert.ok(added(f).length > 0, 'o Jam ainda encontra música para continuar');
    assert.equal(added(f).some(t => t.artist === 'Bruno Mars'), false,
      'ouvir Isak no Jam não transforma o histórico de Bruno Mars numa âncora');
    assert.ok(added(f).some(t => t.artist === 'Related artist'), 'não fica limitado ao mesmo artista');
    assert.deepEqual(new Set(f.anchors), new Set(['Isak Zigarro']));
    console.log('  ok - Isak + histórico de Bruno Mars: só Isak e semelhantes confirmados');
  }
  {
    const f = await fixture(); f.portrait(new Map());
    await f.store.getState().encherSeSecar();
    assert.ok(added(f).length, 'sem histórico geral, a música do Jam chega para recomendar');
    console.log('  ok - Jam recente sem histórico também tem continuidade');
  }
  {
    const f = await fixture(); f.catalog(false);
    await f.store.getState().encherSeSecar();
    assert.equal(added(f).length, 0, 'sem vizinhança confirmada não se preenche com outros gostos');
    console.log('  ok - catálogo sem correspondência não produz substitutos sem relação');
  }
  {
    const f = await fixture();
    f.setSession({ ...track('unknown'), title: 'Song', artist: null }, 'unknown-jam');
    await f.store.getState().encherSeSecar();
    assert.equal(added(f).length, 0, 'sem artista da sessão não se recorre ao histórico de Bruno Mars');
    console.log('  ok - metadados sem artista não ativam o fallback para o perfil geral');
  }
  {
    const f = await fixture();
    f.setSession(track('old-bruno', 'Bruno Mars'));
    for (let index = 1; index <= 6; index++) f.setSession(track(`isak-recent-${index}`));
    await f.store.getState().encherSeSecar();
    assert.equal(added(f).some(t => t.artist === 'Bruno Mars'), false, 'uma escolha antiga não substitui o ambiente recente');
    console.log('  ok - o contexto acompanha as seis músicas mais recentes');
  }
  for (const change of [
    ['desligar automático', f => f.store.setState({ autoFila: false })],
    ['trocar de Jam', f => f.setSession(track('other'), 'other-jam')],
    ['sair e voltar ao mesmo Jam', f => { f.store.getState().desligar(); f.setSession(track('isak-1')); }],
    ['trocar de artista', f => f.setSession(track('bruno-new', 'Bruno Mars'))],
    ['perder anfitrião', f => f.store.setState({ sessao: { ...f.store.getState().sessao, hostId: 'guest' } })],
    ['encher a fila à mão', f => f.store.setState({ fila: [1, 2, 3].map(n => ({ id: String(n), track: track(`manual-${n}`) })) })],
  ]) {
    const f = await fixture(), gate = f.hold();
    const pending = f.store.getState().encherSeSecar();
    await requested(f); change[1](f); gate.resolve(); await pending;
    assert.equal(added(f).length, 0, change[0] + ': uma resposta antiga não insere músicas');
    console.log('  ok - resposta antiga cancelada ao ' + change[0]);
  }
  {
    const f = await fixture(), gate = f.hold();
    const pending = f.store.getState().encherSeSecar(); await requested(f);
    await f.store.getState().encherSeSecar(); gate.resolve(); await pending;
    assert.equal(f.calls.length, 1, 'só um enchimento em paralelo');
    assert.equal(f.inserts.length, 1);
    console.log('  ok - pedidos simultâneos não duplicam o lote');
  }
  {
    const f = await fixture(), gate = f.hold();
    const pending = f.store.getState().encherSeSecar(); await requested(f);
    const queued = track('Isak Zigarro Recommendation 1-0');
    f.store.setState({ fila: [{ id: 'manual', track: queued }] });
    gate.resolve(); await pending;
    assert.ok(added(f).length > 0);
    assert.equal(added(f).some(t => t.sourceId === queued.sourceId), false, 'uma música entretanto acrescentada não entra duas vezes');
    console.log('  ok - alterações na fila durante a pesquisa não criam duplicados');
  }
  for (const prepare of [
    f => f.store.setState({ autoFila: false }),
    f => f.store.setState({ sessao: { ...f.store.getState().sessao, hostId: 'guest' } }),
    f => f.setSession(null),
  ]) {
    const f = await fixture(); prepare(f); await f.store.getState().encherSeSecar();
    assert.equal(f.calls.length, 0); assert.equal(added(f).length, 0);
  }
  console.log('Jam: continuidade pelo contexto, ausência de fallback global e cancelamento passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Auditoria: confirma as correções de contexto, perfil, respostas tardias, cache por conta e
 * âncoras das misturas. Corre com: node docs/auditoria-recomendacoes-2026-09-16/reproduzir.cjs
 * Usa módulos reais e dados sintéticos. Sem rede, contas ou escrita de prefs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '../..');

function ambiente(stubs = {}, remaps = {}) {
  const modules = new Map();
  function load(name) {
    name = name.replaceAll('\\', '/');
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (remaps[name]) return load(remaps[name]);
    if (modules.has(name)) return modules.get(name).exports;
    const file = path.join(raiz, name);
    let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    // Instrumentação só nesta VM: expõe funções privadas sem alterar src/.
    if (name === 'src/api/descoberta.ts') code += '\nexports.audit = { escolherAlvos, faixasParaProcurar };';
    const module = { exports: {} };
    modules.set(name, module);
    const math = Object.create(Math);
    math.random = () => 0;
    const context = vm.createContext({
      module, exports: module.exports, console, setTimeout, clearTimeout,
      setInterval, clearInterval, AbortController, URL, Map, Set, Date,
      Math: math, __DEV__: false,
      fetch: () => { throw Error('Esta auditoria não pode fazer pedidos de rede'); },
      require: (request) => {
        if (Object.hasOwn(stubs, request)) return stubs[request];
        if (remaps[request]) return load(remaps[request]);
        if (!request.startsWith('.')) return require(request);
        let target = path.relative(raiz, path.resolve(path.dirname(file), request)).replaceAll('\\', '/');
        if (remaps[target]) return load(remaps[target]);
        if (!/\.[cm]?[jt]sx?$/.test(target)) target += '.ts';
        return load(target);
      },
    });
    vm.runInContext(code, context, { filename: file });
    return module.exports;
  }
  return load;
}
const faixa = (id, artist = 'Aurora Azul') => ({
  source: 'youtube', sourceId: id, title: `Canção ${id}`, artist: `${artist} - Topic`,
  album: null, artworkUrl: null, durationSeconds: 180,
});
const defaults = {
  'src/api/cache.ts': { DIA_MS: 86400000, cacheGet: async () => null, cacheSet: async () => {} },
  'src/state/connectivity.ts': { useConnectivity: { getState: () => ({ offline: false }) } },
  'src/state/recommendationFeedback.ts': {
    artistasPreferidos: () => [], artistWeight: () => 1, feedbackReady: async () => {},
    filterSuggestions: (tracks) => [...tracks], trackIsSuppressed: () => false,
  },
  'src/api/library.ts': { getLibraryKeys: async () => new Set() },
  'src/api/plays.ts': { artistasParaRecomendacoes: async () => [], getTopArtists: async () => [], getHeavyRotation: async () => [] },
  'src/api/afinidade.ts': { paresDeArtistaEPlaylist: async () => ({ pares: [], faixas: [] }) },
  'src/api/catalogo.ts': {},
  'src/api/ytSearchFree.ts': {},
  'src/api/youtube.ts': {},
};

(async () => {
  const pure = ambiente();

  const consulted = [];
  const artist = (id, nome) => ({ id, nome, fas: 100 });
  const catalog = ambiente({ ...defaults, 'src/api/catalogo.ts': {
    vizinhancaDe: async (name) => ({ artista: artist(`proprio-${name}`, name), semelhantes: [
      artist(0, 'Aurora Azul'),
      ...Array.from({ length: 6 }, (_, i) => artist(`${name}-${i}`, `${name} Vizinho ${i}`)),
    ] }),
    topDoArtista: async (id, n) => {
      consulted.push(id);
      return Array.from({ length: n }, (_, i) => ({ artista: `Novo ${id}`, titulo: `Tema ${i}`, duracaoS: 180 }));
    },
  } });
  const discovery = catalog('src/api/descoberta.ts');
  const wanted = await discovery.audit.faixasParaProcurar(
    [{ nome: 'Ancora A', peso: 1 }, { nome: 'Ancora B', peso: 1 }],
    new Map([['aurora azul', 100]]),
  );
  assert.equal(consulted.includes(0), true);
  assert.ok(wanted.some(({ faixa: f }) => f.artista === 'Novo 0'));
  assert.equal(wanted.slice(0, 3).map((x) => x.ancora).join(','), 'Ancora A,Ancora B,Ancora A');
  console.log('2. CORRIGIDO: uma faixa nova de um artista conhecido chega às candidatas.');
  console.log('3. CORRIGIDO: duas âncoras de igual peso alternam A,B,A nas primeiras 3 candidatas.');

  const names = catalog('src/lib/artistName.ts');
  const consultadasPeloPerfil = [];
  const perfilLoad = ambiente({ ...defaults,
    'src/api/plays.ts': { ...defaults['src/api/plays.ts'], artistasParaRecomendacoes: async () => [
      { name: 'Aurora Azul', plays: 1 },
      { name: 'Horizonte Novo', plays: 100, externo: true },
      { name: 'Escolha Inicial', plays: 1, externo: true },
      { name: '999', plays: 90 },
    ] },
    'src/api/catalogo.ts': { vizinhancaDe: async (nome) => { consultadasPeloPerfil.push(nome); return null; } },
  });
  const perfil = await perfilLoad('src/api/perfilDeRecomendacoes.ts').lerPerfilDeRecomendacoes();
  const comPerfil = await discovery.audit.escolherAlvos([faixa('uma')], 4, perfil.escutas, perfil.externos);
  assert.ok(comPerfil.alvos.some(a => a.nome === 'Horizonte Novo'));
  assert.ok(comPerfil.alvos.some(a => a.nome === 'Escolha Inicial'));
  assert.equal(comPerfil.alvos.some(a => a.nome === '999'), false);
  await perfilLoad('src/api/descoberta.ts').descobertasPorAncora(
    [faixa('uma')], ['Aurora Azul', 'Horizonte Novo', 'Escolha Inicial', '999'],
  );
  assert.ok(consultadasPeloPerfil.includes('Horizonte Novo'));
  assert.ok(consultadasPeloPerfil.includes('Escolha Inicial'));
  assert.equal(consultadasPeloPerfil.includes('999'), false);
  console.log('4. CORRIGIDO: o perfil comum preserva Spotify/sementes até às âncoras, sem confiar no nome 999.');

  let fallbackCalls = 0;
  const fallback = ambiente({ ...defaults, 'src/api/catalogo.ts': {
    vizinhancaDe: async (nome) => ({
      artista: { id: 1, nome, fas: 100 },
      semelhantes: [{ id: 2, nome: 'Banda Próxima', fas: 100 }],
    }),
    topDoArtista: async (id) => id === 2
      ? [{ titulo: 'Luz Compatível', artista: 'Banda Próxima', duracaoS: 203 }]
      : [],
  }, 'src/api/youtube.ts': {
    searchYouTubePlaylists: async () => { fallbackCalls++; return [{ id: 'playlist-sem-relacao' }]; },
    fetchYouTubePlaylistById: async () => ({ items: [
      { videoId: 'incompativel', title: 'Orquestra Distante - Valsa da Noite',
        channel: 'Orquestra Distante - Topic', thumbnail: null },
      { videoId: 'versao-errada', title: 'Banda Próxima - Luz Compatível (Live)',
        channel: 'Banda Próxima - Topic', thumbnail: null },
      { videoId: 'validada', title: 'Banda Próxima - Luz Compatível',
        channel: 'Banda Próxima - Topic', thumbnail: null },
    ] }),
  } })('src/api/descoberta.ts');
  const neighbors = new Map();
  await fallback.taparBuracosComOYouTube(['Aurora Azul'], neighbors, names.chaveDeArtista);
  assert.equal(neighbors.get('aurora azul').map(t => t.sourceId).join(','), 'validada');
  assert.equal(neighbors.get('aurora azul')[0].durationSeconds, 203);
  console.log('5. CORRIGIDO: o fallback rejeita a música sem afinidade e a versão errada; só entra a gravação validada, com duração.');
  // A página pede 12 artistas e mostra 6 misturas: as âncoras são as dela, e o
  // remendo só pode correr para essas (aqui nenhuma resolve no YouTube).
  const twelve = Array.from({ length: 12 }, (_, i) => `Artista ${i}`);
  const biblioteca = twelve.map((name, i) => faixa(`b${i}`, name));
  const { vizinhas: doCatalogo, ancoras } = await fallback.descobertasPorAncora(biblioteca, twelve);
  assert.deepEqual([...ancoras], twelve.slice(0, 6));
  fallbackCalls = 0;
  await fallback.taparBuracosComOYouTube(ancoras, doCatalogo, names.chaveDeArtista);
  assert.equal(fallbackCalls, 6);
  console.log('6. CORRIGIDO: 12 artistas pedidos, as 6 âncoras são as primeiras da página e o fallback só lhes pode acudir a elas.');

  const affinity = pure('src/lib/afinidade.ts');
  const pairs = Array.from({ length: 60 }, (_, i) => ({ artista: `a${i}`, playlistId: 'misturada' }));
  const portrait = new Map([['a0', 1]]);
  const adjacent = affinity.artistasVizinhos(portrait, affinity.vizinhosPorPlaylist(pairs, (n) => n));
  let escolhasVizinhas = 0;
  const amostras = 1_000;
  for (let i = 0; i < amostras; i++) {
    const [escolhida] = affinity.alvosDeProcura(
      portrait, adjacent, 1, () => (i + 0.5) / amostras,
    );
    if (escolhida !== 'a0') escolhasVizinhas++;
  }
  const probability = escolhasVizinhas / amostras;
  assert.ok(probability <= 1 / 3 + 0.001);

  const alvoDaSessao = await discovery.audit.escolherAlvos(
    [faixa('actual', 'Aurora da Sessão')], 4,
    new Map([['horizonte global', 100]]),
    new Map([['horizonte global', 'Horizonte Global']]), true,
  );
  assert.equal(alvoDaSessao.alvos.map((a) => a.nome).join(','), 'Aurora da Sessão');
  console.log(`7. CORRIGIDO: a playlist de 60 artistas fica em ${(probability * 100).toFixed(1)}% e, na sessão, só o contexto atual fornece âncoras.`);

  let user = 'conta-A', reads = 0;
  const query = {
    select: () => query, eq: () => query, order: () => query,
    range: async () => {
      reads++;
      return { data: [{ playlist_id: user, tracks: faixa(user, user) }], error: null };
    },
  };
  const accountAffinity = ambiente({
    'src/lib/supabase.ts': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: user } } } }) },
      from: () => query,
    } },
  })('src/api/afinidade.ts');
  const first = await accountAffinity.paresDeArtistaEPlaylist();
  user = 'conta-B';
  const second = await accountAffinity.paresDeArtistaEPlaylist();
  assert.equal(reads, 2);
  assert.notEqual(first, second);
  assert.equal(second.pares[0].playlistId, 'conta-B');
  console.log('8. CORRIGIDO: trocar de conta na mesma sessão relê a afinidade da conta nova.');

  // Store verdadeira; reutiliza os duplos existentes para nativo, rede e prefs.
  const remaps = {};
  const leaves = {
    'src/state/lyrics': 'lyrics', 'src/state/connectivity': 'connectivity',
    'src/state/recommendationFeedback': 'recommendationFeedback', 'src/state/trackAdjustments': 'trackAdjustments',
    'src/state/auth': 'auth', 'src/api/plays': 'plays', 'src/api/radio': 'radio',
    'src/lib/playCounts': 'playCounts', 'src/lib/prefs': 'prefs',
    'src/lib/playbackAlternatives': 'playbackAlternatives', 'src/lib/eventos': 'eventos',
    'src/api/library': 'library', 'src/api/cache': 'cache', 'modules/duotone-audio': 'duotone-audio',
  };
  for (const [name, leaf] of Object.entries(leaves)) {
    remaps[name] = remaps[`${name}.ts`] = `scripts/duplos/${leaf}.ts`;
  }
  remaps['@react-native-async-storage/async-storage'] = 'scripts/duplos/async-storage.ts';
  let deliver, entered, atrasar = false;
  const contextos = [];
  const started = new Promise((r) => { entered = r; });
  const deferred = new Promise((r) => { deliver = r; });
  const playerLoad = ambiente({ 'src/api/descoberta.ts': {
    candidatasParaDescoberta: async (contexto) => {
      contextos.push(contexto);
      if (!atrasar) return [];
      entered(); return deferred;
    },
  } }, remaps);
  const { usePlayer } = playerLoad('src/state/player.ts');
  // Deixa a hidratação vazia do persist terminar antes de preparar a fila.
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  const queue = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => faixa(id));
  await usePlayer.getState().playTrack(queue[1], queue);
  usePlayer.getState()._onYtStateChange('playing');
  for (const index of [5, 3]) {
    await usePlayer.getState().playTrack(queue[index], usePlayer.getState().queue);
    usePlayer.getState()._onYtStateChange('playing');
  }
  usePlayer.setState({ shuffle: true, shuffleInteligente: true });
  await usePlayer.getState().semearSugestoes();
  assert.equal(contextos.at(-1).map(t => t.sourceId).join(','), 'D,F,B');
  await usePlayer.getState().intercalarSugestao();
  assert.equal(contextos.at(-1).map(t => t.sourceId).join(','), 'D,F,B');
  console.log('1. CORRIGIDO: os dois caminhos do Smart Shuffle recebem D,F,B após ouvir B → F → D.');

  atrasar = true;
  const oldQueue = [faixa('calma')], newQueue = [faixa('metal', 'Banda Metal')];
  usePlayer.setState({ queue: oldQueue, current: oldQueue[0], queueIndex: 0,
    shuffle: true, shuffleInteligente: true, shuffleOrder: ['youtube:calma'], sugeridas: [] });
  const pending = usePlayer.getState().intercalarSugestao();
  await started;
  await usePlayer.getState().playTrack(newQueue[0], newQueue);
  deliver([faixa('sugestao-calma-antiga', 'Cantor Calmo')]);
  assert.equal(await pending, false);
  assert.equal(usePlayer.getState().queue.some((t) => t.sourceId === 'sugestao-calma-antiga'), false);
  assert.ok(usePlayer.getState().queue.some((t) => t.sourceId === 'metal'));
  console.log('9. CORRIGIDO: após mudar de lista com playTrack, a resposta antiga é descartada.');
  console.log('\nContexto, novidade por faixa, peso das playlists, perfil, diversidade das âncoras, fallback da Search e respostas tardias, cache de afinidade por conta e âncoras das misturas corrigidos. Não mede satisfação musical.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function ambiente(os = 'ios', estado = 'active') {
  let agora = 10_000, proximo = 0;
  const intervalos = new Map(), prazos = new Map(), ouvintes = new Set(), web = new Set();
  const AppState = {
    currentState: estado,
    addEventListener: (_, fn) => { ouvintes.add(fn); return { remove: () => ouvintes.delete(fn) }; },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener: (_, fn) => web.add(fn),
    removeEventListener: (_, fn) => web.delete(fn),
  };
  const globals = {
    Date: class extends Date { static now() { return agora; } }, document, console,
    setInterval: (fn, ms) => { const id = ++proximo; intervalos.set(id, { fn, ms }); return id; },
    clearInterval: id => intervalos.delete(id),
    setTimeout: (fn, ms) => { const id = ++proximo; prazos.set(id, { fn, ms }); return id; },
    clearTimeout: id => prazos.delete(id),
  };
  function carregar(nome, mocks = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', nome), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { ...globals, module, exports: module.exports, require: id => {
      if (id in mocks) return mocks[id];
      throw Error('Import inesperado: ' + id);
    } }, { filename: nome });
    return module.exports;
  }
  const rn = { AppState, Platform: { OS: os } };
  const visibilidade = carregar('src/lib/appVisibility.ts', { 'react-native': rn });
  return {
    carregar, rn, visibilidade, intervalos, prazos, ouvintes, web,
    avancar: ms => { agora += ms; },
    estado: estado => { AppState.currentState = estado; for (const fn of [...ouvintes]) fn(estado); },
    janela: estado => { document.visibilityState = estado; for (const fn of [...web]) fn(); },
    bater: ms => { for (const [id, t] of [...intervalos]) if (t.ms === ms && intervalos.has(id)) t.fn(); },
    vencer: ms => { for (const [id, t] of [...prazos]) if (t.ms === ms && prazos.has(id)) { prazos.delete(id); t.fn(); } },
  };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
function store(inicial) {
  let estado = inicial;
  const ouvintes = new Set();
  return {
    getState: () => estado,
    subscribe: fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    mudar: patch => { const anterior = estado; estado = { ...estado, ...patch }; for (const fn of [...ouvintes]) fn(estado, anterior); },
    ouvintes,
  };
}

async function main() {
  // O temporizador desaparece de facto, incluindo no PC com AppState active.
  for (const os of ['ios', 'web']) {
    const a = ambiente(os);
    let tiques = 0;
    const parar = a.visibilidade.intervaloComAppVisivel(() => tiques++, 1000);
    a.bater(1000); assert.equal(tiques, 1);
    if (os === 'web') a.janela('hidden'); else a.estado('inactive');
    assert.equal(a.intervalos.size, 0, 'esconder remove o temporizador');
    a.bater(1000); assert.equal(tiques, 1);
    if (os === 'web') a.janela('visible'); else a.estado('active');
    a.estado('active'); assert.equal(a.intervalos.size, 1, 'voltar não duplica o relógio');
    a.bater(1000); assert.equal(tiques, 2);
    parar(); assert.equal(a.intervalos.size + a.ouvintes.size + a.web.size, 0);
    a.estado('active'); assert.equal(a.intervalos.size, 0, 'limpeza definitiva');
  }
  {
    const a = ambiente('ios', 'background');
    const parar = a.visibilidade.intervaloComAppVisivel(() => {}, 1000);
    assert.equal(a.intervalos.size, 0, 'montar em segundo plano não arma relógios');
    a.estado('active'); assert.equal(a.intervalos.size, 1); parar();
  }

  // Ciclo de vida real do publicador: CC, bloqueio e dois relógios de batimento.
  {
    const a = ambiente(), publicados = [];
    const player = store({ current: { sourceId: 'song' }, isPlaying: true, playbackConfirmed: true,
      buffering: false, error: null, positionMs: 0, positionAt: 10_000, playbackRate: 1,
      durationMs: 180_000, upcomingQueue: () => [] });
    const { iniciarPresenca } = a.carregar('src/lib/presenceSync.ts', {
      'react-native': a.rn, './appVisibility': a.visibilidade,
      './inatividadeDoSistema': { segundosSemInteracao: async () => 0 },
      './presencaAtiva': a.carregar('src/lib/presencaAtiva.ts'),
      'expo-crypto': { randomUUID: () => 'session' }, './deviceIdentity': { getDeviceId: async () => 'phone' },
      './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
        // A pergunta pela validade longa (marcas_em_falta) não é uma publicação.
        rpc: async (nome, dados) => { if (nome === 'publish_social_presence') publicados.push(dados); return {}; } } },
      '../state/player': { usePlayer: player },
      '../state/privacidade': { garantirPrivacidade: async () => {}, usePrivacidade: store({ privada: false }) },
      '../state/ouvirJuntos': { useOuvirJuntos: store({ sessao: null }) },
      './seguirAmigo': { proximasParaAPresenca: x => x, posicaoProjetada: x => x.positionMs },
    });
    const parar = iniciarPresenca('me'); await flush(); assert.equal(publicados.length, 1);
    a.estado('inactive'); a.estado('active'); await flush();
    assert.equal(publicados.length, 1, 'Centro de Controlo não publica presença');
    a.estado('inactive'); a.estado('background'); await flush();
    assert.equal(publicados.length, 2); assert.equal(publicados.at(-1).p_active, false);
    a.avancar(75_000); player.mudar({ positionMs: 75_000, positionAt: 85_000 });
    a.bater(75_000); await flush();
    assert.equal(publicados.length, 3, 'timeUpdate e intervalo só dão um batimento');
    assert.ok(publicados.at(-1).p_track, 'continua a anunciar música com o ecrã bloqueado');
    a.estado('active'); await flush(); assert.equal(publicados.length, 4);
    assert.equal(publicados.at(-1).p_active, true);
    parar(); await flush(); assert.equal(publicados.at(-1).p_end, true);
    assert.equal(a.intervalos.size + a.ouvintes.size + player.ouvintes.size, 0);
  }

  // O hook da capa deixa de animar/olhar para downloads escondido e atualiza ao voltar.
  {
    const a = ambiente(), efeitos = [], downloads = new Set();
    let emDisco = false, animacoes = 0, paragens = 0;
    class Value {
      setValue() {} interpolate() { return new Value(); } stopAnimation() { paragens++; }
    }
    const animation = () => ({ start() { animacoes++; }, stop() { paragens++; } });
    const Animated = { Value, timing: animation, loop: animation, sequence: animation, delay: animation,
      add: () => new Value(), multiply: () => new Value(), divide: () => new Value() };
    const Easing = { in: x => x, out: x => x, inOut: x => x, cubic: x => x, quad: x => x, linear: x => x };
    const player = store({ current: { sourceId: 'song' }, activeBackend: 'resolving', buffering: true });
    const { useMontagemDaCapa } = a.carregar('src/hooks/useMontagemDaCapa.ts', {
      react: { useEffect: fn => efeitos.push(fn), useMemo: fn => fn(), useRef: x => ({ current: x }), useState: x => [x, () => {}] },
      'react-native': { ...a.rn, Animated, Easing }, '../lib/appVisibility': a.visibilidade,
      '../lib/arranqueDaFaixa': { arranqueAtual: () => ({ videoId: 'song', pedidoEm: 10_000 }) },
      '../lib/montagemDaCapa': a.carregar('src/lib/montagemDaCapa.ts'),
      '../lib/recuoDoEncaixe': a.carregar('src/lib/recuoDoEncaixe.ts'),
      '../lib/youtubeCache': { cachedAudioFile: () => emDisco ? { exists: true } : null,
        estadoDoDownload: () => null, ouvirDownloads: fn => { downloads.add(fn); return () => downloads.delete(fn); } },
      '../state/player': { usePlayer: player }, './useReducedMotion': { useReducedMotion: () => false },
    });
    useMontagemDaCapa('song', true); const limpar = efeitos[0]();
    assert.equal(a.intervalos.size, 1); assert.ok(animacoes > 0);
    a.estado('background'); assert.equal(a.intervalos.size, 0); assert.ok(paragens > 0);
    const antes = animacoes; emDisco = true;
    for (const fn of downloads) fn();
    assert.equal(animacoes, antes, 'download escondido não volta a iniciar animações');
    a.estado('active'); assert.ok(animacoes > antes, 'capa reflete o download concluído ao voltar');
    assert.equal(a.intervalos.size + a.ouvintes.size + downloads.size + player.ouvintes.size, 0,
      'capa pronta larga o relógio e as subscrições');
    limpar();
  }

  // Cada atualização social lê a inbox uma vez, sem perder a retoma após bloqueio.
  {
    const a = ambiente(), handlers = new Map(); let inboxCalls = 0;
    const channel = { on(_, filtro, fn) { handlers.set(filtro.table, fn); return this; }, subscribe() { return this; } };
    const social = a.carregar('src/state/social.ts', {
      zustand: require('zustand'), 'react-native': a.rn,
      '../api/social': { getFriendships: async () => [], getGrupos: async () => [],
        getInboxItems: async () => { inboxCalls++; return []; }, lerConversasVistas: async () => ({}), marcarConversaVista: async () => {} },
      '../lib/prefs': { getChatsVistos: async () => ({}), marcarChatVisto: async () => ({}) },
      '../lib/supabase': { supabase: { rpc: async () => ({ data: null }), channel: () => channel, removeChannel: async () => {} } },
      '../lib/socialPresence': { estadoDaPresenca: () => ({}) }, '../lib/social': a.carregar('src/lib/social.ts'),
      '../lib/profileMedia': { clearProfileMediaCache() {} }, '../api/profiles': { getSocialConversations: async () => [] },
      '../lib/appVisibility': a.visibilidade, '../lib/inAppNotifications': a.carregar('src/lib/inAppNotifications.ts'),
      '../lib/recuperacaoDaInbox': a.carregar('src/lib/recuperacaoDaInbox.ts'),
      '../lib/socialActivity': a.carregar('src/lib/socialActivity.ts'),
      '../api/conversationPreviews': { getConversationPreviews: async () => ({ activity: {}, previews: {}, complete: true }) },
    });
    const parar = social.iniciarSocial('me'); await flush(); assert.equal(inboxCalls, 1);
    handlers.get('shared_items')({ eventType: 'INSERT' }); await flush();
    assert.equal(inboxCalls, 1, 'aviso aguarda o agrupamento de eventos');
    a.vencer(100); await flush();
    assert.equal(inboxCalls, 2, 'aviso relê uma vez');
    a.estado('background'); await flush(); assert.equal(a.intervalos.size, 0);
    a.estado('active'); await flush(); assert.equal(inboxCalls, 3, 'retoma relê uma vez');
    assert.equal(a.intervalos.size, 3);
    parar(); assert.equal(a.intervalos.size + a.ouvintes.size, 0);
  }

  // Leituras dos aparelhos: CC recente não lê; um bloqueio real relê sempre,
  // mesmo curto, pois um aviso pode ter sido perdido com o iPhone suspenso.
  for (const hook of ['connect', 'handoff']) {
    const a = ambiente(), efeitos = []; let leituras = 0, estadoDoCanal;
    const react = { useEffect: fn => efeitos.push(fn), useCallback: fn => fn,
      useRef: x => ({ current: x }), useState: x => [x, () => {}] };
    const player = store({ current: null, isPlaying: false });
    const usePlayer = Object.assign(fn => fn(player.getState()), player);
    const sessao = a.carregar('src/lib/handoff.ts');
    if (hook === 'connect') {
      const connect = a.carregar('src/lib/connectSync.ts', {
        react, 'react-native': a.rn, './appVisibility': a.visibilidade,
        '../state/player': { usePlayer }, './deviceIdentity': { getDeviceId: async () => 'phone' },
        '../api/playerSessions': {}, './sessionSync': {},
        './duotoneConnect': a.carregar('src/lib/duotoneConnect.ts', { './handoff': sessao }),
        '../api/comandosDeAparelho': {
          limparPedidosVelhos: async () => {}, pedidosParaMim: async () => { leituras++; return []; },
          ouvirPedidos: (_, __, estado) => { estadoDoCanal = estado; estado(true); return () => {}; },
        },
      });
      connect.useComandosDoAparelho('me');
    } else {
      const handoff = a.carregar('src/lib/sessionSync.ts', {
        react, 'react-native': a.rn, './appVisibility': a.visibilidade, './handoff': sessao,
        '../state/player': { usePlayer }, './deviceIdentity': { getDeviceId: async () => 'phone' },
        '../api/playerSessions': { fetchOtherSessionsLeves: async () => { leituras++; return []; }, temAvisosLeves: () => true },
        './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
          channel: () => ({ on() { return this; }, subscribe(fn) { estadoDoCanal = estado => fn(estado ? 'SUBSCRIBED' : 'CLOSED'); fn('SUBSCRIBED'); return this; } }),
          removeChannel: async () => {},
        } },
      });
      handoff.useHandoffSession();
    }
    const limpezas = efeitos.map(fn => fn()); await flush();
    assert.equal(leituras, 1, `${hook}: uma leitura no arranque`);
    a.estado('inactive'); a.estado('active'); await flush();
    assert.equal(leituras, 1, `${hook}: Centro de Controlo não relê`);
    a.estado('background'); assert.equal(a.intervalos.size, 0);
    a.estado('active'); await flush();
    assert.equal(leituras, 2, `${hook}: bloqueio curto relê imediatamente`);
    estadoDoCanal(false); a.estado('inactive'); a.estado('active'); await flush();
    assert.equal(leituras, 3, `${hook}: sem Realtime relê sempre ao voltar`);
    for (const limpar of limpezas) limpar?.();
    assert.equal(a.intervalos.size + a.ouvintes.size, 0);
  }
  console.log('Poupança em segundo plano: temporizadores, capa, presença e leituras da inbox passaram.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

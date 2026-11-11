/**
 * Quantos pedidos a app faz ao Supabase (6/10). O plano grátis dá 1 GB de
 * logs por ciclo, e cada pedido é uma linha da API Gateway: num dia, os do
 * Social eram 1,5 mil get_public_profiles, 977 chat_group_members, 805
 * chat_reads e 486 chat_groups, e os do Jam e das músicas começadas mais 722
 * listening_sessions e 641 faixas_comecadas. Isto prende os cortes:
 *
 *  - o Social não relê grupos e contactos em cada atualização automática;
 *  - o canal a ligar logo a seguir a uma atualização só lê a inbox;
 *  - uma mensagem nova não é uma atualização inteira;
 *  - no PC, a presença de um amigo com a janela escondida não obriga a ler ao voltar;
 *  - a mesma marca de leitura não vai duas vezes ao `chat_reads`;
 *  - o Jam lê as sessões abertas numa consulta, e não uma por cada Jam antigo;
 *  - as músicas começadas vão em lote;
 *  - os lotes usam os ids do aparelho, e as começadas, as escutas e as
 *    contagens saem na mesma volta (11/11).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');

function load(name, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports,${Object.keys(globals).join(',')}){${code}\n})`, { filename: name })(
    (id) => { if (id in mocks) return mocks[id]; throw new Error(`Unexpected import ${id} in ${name}`); },
    module, module.exports, ...Object.values(globals));
  return module.exports;
}
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const create = (fn) => {
  const state = createStore(() => ({}));
  const hook = Object.assign((selector) => selector(state.getState()), state);
  hook.setState = (patch) => state.setState(typeof patch === 'function' ? patch(state.getState()) : patch);
  hook.setState(fn(hook.setState, hook.getState));
  return hook;
};
const msg = (id, extra = {}) => ({ id, createdAt: new Date(Date.now()).toISOString(),
  sender: { id: 'ana', name: 'Ana', username: 'ana' }, itemType: 'track', trackData: null, message: 'Olá', groupId: null, ...extra });

/** Uma store do Social com tudo o que vai à rede contado. */
function social(plataforma, oQueMudou) {
  const c = { inbox: 0, amizades: 0, grupos: 0, presenca: 0, conversas: 0, previews: 0, vistas: 0, marcas: 0, removidos: 0 };
  const ambiente = { visivel: true, proximaInbox: [], estado: 'active', canais: [], aoMudarApp: null, aoMudarJanela: null,
    presencas: [], falharPresenca: false, esperarPresenca: null };
  const document = { visibilityState: 'visible', addEventListener: (_n, fn) => { ambiente.aoMudarJanela = fn; }, removeEventListener() {} };
  const window = { duotoneDesktop: {}, addEventListener() {}, removeEventListener() {} };
  const canal = () => {
    const c2 = { handlers: {}, aoEstado: null,
      on(_t, filtro, fn) { c2.handlers[filtro.table] = fn; return c2; },
      subscribe(fn) { c2.aoEstado = fn; return c2; } };
    ambiente.canais.push(c2);
    return c2;
  };
  const modulo = load('src/state/social.ts', {
    zustand: { create },
    // O "o que mudou?" (11/11): por omissão responde sempre "mudou", o
    // comportamento de antes (e o de quem ainda não correu a migração).
    '../lib/oQueMudou': oQueMudou ?? { verificarMudancas: async () => ({ mudou: true, confirmar() {} }) },
    'react-native': {
      AppState: { get currentState() { return ambiente.estado; }, addEventListener: (_n, fn) => { ambiente.aoMudarApp = fn; return { remove() {} }; } },
      Platform: { OS: plataforma },
    },
    '../api/social': {
      getInboxItems: async () => { c.inbox++; const r = ambiente.proximaInbox; ambiente.proximaInbox = []; return r; },
      getFriendships: async () => { c.amizades++; return [{ friendId: 'ana', status: 'accepted', name: 'Ana' }]; },
      getGrupos: async () => { c.grupos++; return []; },
      lerConversasVistas: async () => { c.vistas++; return {}; },
      marcarConversaVista: async () => { c.marcas++; },
    },
    '../lib/prefs': { getChatsVistos: async () => ({}), marcarChatVisto: async (id, ts) => ({ [id]: ts }) },
    '../lib/supabase': { supabase: {
      rpc: async (nome) => {
        if (nome === 'get_social_presence') c.presenca++;
        const items = ambiente.presencas; if (ambiente.esperarPresenca) await ambiente.esperarPresenca;
        return { data: { serverTime: new Date().toISOString(), items }, error: ambiente.falharPresenca ? {} : null };
      },
      channel: canal, removeChannel: async () => { c.removidos++; },
    } },
    '../lib/socialPresence': load('src/lib/socialPresence.ts'),
    '../lib/presencaAoVivo': { ouvirPresencasAoVivo: () => ({ atualizar() {}, pausar() {}, retomar() {}, parar() {} }), presencaDoEstado: () => null },
    '../lib/social': load('src/lib/social.ts'),
    '../lib/profileMedia': { clearProfileMediaCache() {} },
    '../api/profiles': { getSocialConversations: async () => { c.conversas++; return []; } },
    '../lib/appVisibility': { appEstaVisivel: () => ambiente.visivel, intervaloComAppVisivel: () => () => {} },
    '../lib/inAppNotifications': load('src/lib/inAppNotifications.ts'),
    '../lib/recuperacaoDaInbox': load('src/lib/recuperacaoDaInbox.ts'),
    '../lib/socialActivity': load('src/lib/socialActivity.ts'),
    '../api/conversationPreviews': { getConversationPreviews: async () => { c.previews++; return { activity: {}, previews: {}, complete: true }; } },
    './connectivity': { useConnectivity: { getState: () => ({ offline: false }) } },
  }, { document, window, setInterval: () => 0, clearInterval() {}, console: { warn() {} } });
  return { modulo, c, ambiente };
}

async function main() {
  {
    const { modulo, c, ambiente } = social('web');
    ambiente.falharPresenca = true;
    const parar = modulo.iniciarSocial('me'); await esperar(5);
    const agora = Date.now();
    const p = id => ({ user_id: 'ana', updated_at: new Date(agora + (id === 'b' ? 1 : 0)).toISOString(),
      currently_playing: { source: 'youtube', sourceId: id, title: id },
      online_until: new Date(agora + 60000).toISOString(), playing_until: new Date(agora + 60000).toISOString() });
    ambiente.canais[0].handlers.social_presence({ new: p('a') });
    assert.equal(modulo.useSocial.getState().friends[0].currentlyPlaying.sourceId, 'a', 'o Realtime mostra a música já, mesmo após uma leitura inicial falhada');
    assert.equal(c.presenca, 1, 'receber uma atividade não pede outra leitura');
    ambiente.falharPresenca = false; ambiente.presencas = [p('b')];
    await modulo.relerPresencas();
    assert.equal(modulo.useSocial.getState().friends[0].currentlyPlaying.sourceId, 'b', 'a recuperação redesenha a atividade sem esperar pelo tique de 30 s');
    let concluir; ambiente.esperarPresenca = new Promise(r => { concluir = r; });
    const antiga = modulo.relerPresencas(); parar(); concluir(); await antiga;
    assert.equal(modulo.presencaDe('ana'), undefined, 'uma leitura da conta anterior não ressuscita presenças depois de sair');
  }
  // --- iPhone: arranque, canal, mensagens, regresso à app ---------------------
  {
    const { modulo, c, ambiente } = social('ios');
    const parar = modulo.iniciarSocial('me');
    await esperar(5);
    assert.deepEqual([c.inbox, c.grupos, c.conversas, c.presenca, c.previews], [1, 1, 1, 1, 1], 'o arranque lê tudo uma vez');
    // O canal liga logo a seguir: só a inbox (o que chegou entre a leitura e o canal).
    ambiente.canais[0].aoEstado('SUBSCRIBED');
    await esperar(5);
    assert.deepEqual([c.inbox, c.grupos, c.conversas, c.presenca, c.previews], [2, 1, 1, 1, 1],
      'o canal a ligar não é uma segunda atualização inteira');

    // Uma mensagem nova: a inbox e as pré-visualizações, sem grupos, contactos nem presença.
    ambiente.proximaInbox = [msg('m1')];
    ambiente.canais[0].handlers.shared_items({ eventType: 'INSERT', new: { sender_id: 'ana' } });
    await esperar(130);
    assert.deepEqual([c.inbox, c.grupos, c.conversas, c.presenca, c.previews], [3, 1, 1, 1, 2],
      'uma mensagem não relê os grupos nem a presença');
    assert.ok(modulo.useSocial.getState().activity.ana > 0, 'a ordem das conversas sobe com a mensagem, sem a atualização inteira');

    // Uma mensagem de um grupo que a lista ainda não tem: lê os fixos, uma vez.
    ambiente.proximaInbox = [msg('g1', { groupId: 'grupo-novo' })];
    ambiente.canais[0].handlers.shared_items({ eventType: 'INSERT', new: { sender_id: 'ana' } });
    await esperar(130);
    assert.equal(c.grupos, 2, 'grupo desconhecido: lêem-se os grupos');
    ambiente.canais[0].handlers.shared_items({ eventType: 'INSERT', new: { sender_id: 'ana' } });
    await esperar(130);
    assert.equal(c.grupos, 2, 'o mesmo grupo desconhecido não volta a pedir os grupos');

    // Uma amizade que muda pede tudo.
    ambiente.canais[0].handlers.friendships({});
    await esperar(130);
    assert.equal(c.grupos, 3, 'uma amizade mudada relê os fixos');

    // Regresso à app no iPhone: o canal sai em segundo plano e volta. Uma
    // atualização leve (com presença, que o canal não trouxe), e o canal a
    // ligar só lê a inbox.
    const antes = { ...c };
    ambiente.visivel = false; ambiente.estado = 'background'; ambiente.aoMudarApp('background');
    await esperar(5);
    assert.equal(c.removidos, 1, 'o canal sai em segundo plano');
    ambiente.visivel = true; ambiente.estado = 'active'; ambiente.aoMudarApp('active');
    await esperar(5);
    assert.equal(ambiente.canais.length, 2, 'volta a ligar');
    ambiente.canais[1].aoEstado('SUBSCRIBED');
    await esperar(5);
    assert.deepEqual({ inbox: c.inbox - antes.inbox, grupos: c.grupos - antes.grupos, conversas: c.conversas - antes.conversas,
      presenca: c.presenca - antes.presenca, previews: c.previews - antes.previews },
    { inbox: 2, grupos: 0, conversas: 0, presenca: 1, previews: 1 },
    'voltar à app: uma atualização leve e a inbox do canal (eram duas inteiras, ~20 pedidos)');

    // Quem atualiza à mão (puxar para atualizar, uma ação no Social) lê tudo.
    await modulo.useSocial.getState().refresh();
    assert.equal(c.grupos, antes.grupos + 1, 'à mão relê os grupos');

    // A mesma marca de leitura vai uma vez à conta; uma mais nova vai.
    const t1 = '2026-10-06T12:00:00.000Z', t2 = '2026-10-06T12:05:00.000Z';
    await modulo.useSocial.getState().markRead('ana', t1);
    await modulo.useSocial.getState().markRead('ana', t1);
    assert.equal(c.marcas, 1, 'a mesma marca não se reenvia a cada carga da conversa');
    await modulo.useSocial.getState().markRead('ana', t2);
    assert.equal(c.marcas, 2, 'uma marca mais nova vai');
    parar();
  }

  // --- iPhone com o "o que mudou?" (11/11): voltar sem nada de novo -----------
  // O porteiro verdadeiro (lib/porteiroDasMudancas.ts), com as marcas da conta
  // falsas e o pedido contado.
  {
    const marcas = { mensagens: '2026-11-11T10:00:00Z' };
    let perguntas = 0;
    // O relógio do porteiro anda um minuto por regresso: a resposta partilha-se
    // 5 s entre as partes da app, e aqui tudo corre em milissegundos.
    let relogio = 0;
    const { criarPorteiro } = load('src/lib/porteiroDasMudancas.ts');
    const porteiro = criarPorteiro({
      conta: async () => 'me', agora: () => relogio,
      pedir: async () => { perguntas++; return { ...marcas }; },
    });
    const { modulo, c, ambiente } = social('ios', { verificarMudancas: (p, o) => porteiro.verificar(p, o) });
    const parar = modulo.iniciarSocial('me');
    await esperar(5);
    ambiente.canais[0].aoEstado('SUBSCRIBED');
    await esperar(5);
    const voltar = async (n) => {
      relogio += 60_000;
      ambiente.visivel = false; ambiente.estado = 'background'; ambiente.aoMudarApp('background');
      await esperar(5);
      ambiente.visivel = true; ambiente.estado = 'active'; ambiente.aoMudarApp('active');
      await esperar(5);
      ambiente.canais[n].aoEstado('SUBSCRIBED');
      await esperar(5);
    };
    const difDe = (antes) => ({ inbox: c.inbox - antes.inbox, vistas: c.vistas - antes.vistas, previews: c.previews - antes.previews,
      presenca: c.presenca - antes.presenca, grupos: c.grupos - antes.grupos, perguntas: perguntas - antes.perguntas });

    // O primeiro regresso ainda não tem marca confirmada: lê como antes, e confirma.
    let antes = { ...c, perguntas };
    await voltar(1);
    assert.deepEqual(difDe(antes), { inbox: 1, vistas: 1, previews: 1, presenca: 1, grupos: 0, perguntas: 2 },
      'o primeiro regresso lê (e o canal a ligar já não relê a inbox: a marca não mudou)');

    // Sem nada de novo: só a presença (o canal saiu em segundo plano) e as duas perguntas.
    antes = { ...c, perguntas };
    await voltar(2);
    assert.deepEqual(difDe(antes), { inbox: 0, vistas: 0, previews: 0, presenca: 1, grupos: 0, perguntas: 2 },
      'voltar sem nada de novo: eram duas inboxes (com as marcas de leitura), as conversas e a presença');

    // Uma mensagem nova noutro lado muda a marca: lê.
    marcas.mensagens = '2026-11-11T10:05:00Z';
    ambiente.proximaInbox = [msg('m9')];
    antes = { ...c, perguntas };
    await voltar(3);
    assert.equal(c.inbox - antes.inbox, 1, 'uma marca nova relê a inbox');
    assert.equal(c.previews - antes.previews, 1);
    assert.ok(modulo.useSocial.getState().received.some((m) => m.id === 'm9'), 'e a mensagem aparece');

    // Uma amizade mudada também.
    marcas.amizades = '2026-11-11T10:06:00Z';
    antes = { ...c, perguntas };
    await voltar(4);
    assert.equal(c.inbox - antes.inbox, 1, 'uma amizade mudada relê');
    parar();
  }

  // --- PC: a presença de um amigo com a janela escondida -----------------------
  {
    const { modulo, c, ambiente } = social('web');
    const parar = modulo.iniciarSocial('me');
    await esperar(5);
    ambiente.canais[0].aoEstado('SUBSCRIBED');
    await esperar(5);
    // O primeiro regresso da janela relê (leve); o segundo, dentro do minuto, não.
    ambiente.visivel = false; ambiente.aoMudarJanela();
    ambiente.visivel = true; ambiente.aoMudarJanela();
    await esperar(5);
    const antes = c.inbox;
    ambiente.visivel = false; ambiente.aoMudarJanela();
    ambiente.canais[0].handlers.social_presence({ new: { user_id: 'ana', updated_at: new Date().toISOString() } });
    ambiente.visivel = true; ambiente.aoMudarJanela();
    await esperar(130);
    assert.equal(c.inbox, antes, 'a presença de um amigo com a janela escondida não obriga a uma leitura ao voltar');
    assert.equal(c.grupos, 1, 'no PC os grupos só se leram no arranque');
    parar();
  }

  // --- Jam: as sessões abertas numa consulta -----------------------------------
  {
    const pedidos = [];
    const consulta = (tabela) => {
      const q = { tabela, filtros: [],
        select() { return q; }, eq(...a) { q.filtros.push(['eq', ...a]); return q; },
        in(...a) { q.filtros.push(['in', ...a]); return q; }, is(...a) { q.filtros.push(['is', ...a]); return q; },
        maybeSingle() { return q; },
        then(ok, erro) {
          pedidos.push(tabela);
          const dados = tabela === 'listening_members'
            ? Array.from({ length: 30 }, (_, i) => ({ session_id: `s${i}`, joined_at: new Date(i * 1000).toISOString() }))
            : [{ id: 's29', host_id: 'host', track: null, started_at: null, ended_at: null }];
          return Promise.resolve({ data: dados, error: null }).then(ok, erro);
        } };
      return q;
    };
    const api = load('src/api/ouvirJuntos.ts', {
      '../lib/supabase': { supabase: { from: consulta, rpc: async () => ({ data: null, error: null }) } },
      '../lib/relogioPartilhado': {},
    });
    const abertas = await api.minhasSessoesAbertas('eu');
    assert.deepEqual(pedidos, ['listening_members', 'listening_sessions'],
      'trinta Jams antigos: dois pedidos, e não trinta e um');
    assert.equal(abertas.length, 1);
    assert.equal(abertas[0].id, 's29');
    assert.equal(abertas[0].entrouEm, 29_000, 'a hora de entrada continua a vir dos membros');
  }

  // --- As músicas começadas vão em lote ----------------------------------------
  {
    const pedidos = [];
    let conta = 'eu';
    const timers = [];
    const plays = load('src/api/plays.ts', {
      '../lib/supabase': { supabase: { from: (tabela) => ({
        upsert: async (linhas) => { pedidos.push([tabela, linhas.length]); return { error: null }; },
      }) } },
      '../lib/idDaConta': { idDaConta: async () => conta },
      '../lib/idsNoCatalogo': { idGuardado: async () => null, guardarId: async () => {}, esquecerId: async () => {} },
      './library': { upsertTrack: async () => { throw Error('um a um, não'); },
        upsertTracks: async (faixas) => { pedidos.push(['upsert_catalog_tracks', faixas.length]);
          return new Map(faixas.map((f) => [`${f.source}:${f.sourceId}`, `id-${f.sourceId}`])); } },
      '../lib/artistasSemente': {}, '../lib/gostoDoSpotify': {}, '../lib/prefs': {}, '../lib/artistName': {},
    }, { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} });
    const faixa = (id) => ({ source: 'youtube', sourceId: id, title: id, artist: 'A' });
    await plays.registarInicioDaFaixa(faixa('a'));
    await plays.registarInicioDaFaixa(faixa('b'));
    await plays.registarInicioDaFaixa(faixa('a'));
    assert.deepEqual(pedidos, [], 'começar músicas não vai logo à rede');
    assert.equal(timers.length, 1, 'um envio agendado, não um por música');
    assert.equal(timers[0].ms, plays.INICIOS_ESPERAM_MS);
    await plays.enviarInicios();
    assert.deepEqual(pedidos, [['upsert_catalog_tracks', 2], ['faixas_comecadas', 2]],
      'um pedido ao catálogo e um ao faixas_comecadas, sem repetidas');
    // Com 20 à espera vão sem esperar pelo relógio.
    pedidos.length = 0;
    for (let i = 0; i < plays.INICIOS_POR_LOTE; i++) await plays.registarInicioDaFaixa(faixa(`x${i}`));
    assert.deepEqual(pedidos, [['upsert_catalog_tracks', 20], ['faixas_comecadas', 20]]);
    // Os de uma conta de onde se saiu não vão para a seguinte.
    pedidos.length = 0;
    await plays.registarInicioDaFaixa(faixa('c'));
    conta = 'outra';
    await plays.enviarInicios();
    assert.deepEqual(pedidos, [], 'um início não muda de conta');
  }

  // --- Os lotes usam os ids do aparelho, e um id recusado esquece-se (11/11) --
  {
    const pedidos = [], esquecidos = [], guardados = [];
    const noDisco = new Map([['youtube:a', 'id-a'], ['youtube:b', 'id-b']]);
    let erro = null;
    const plays = load('src/api/plays.ts', {
      '../lib/supabase': { supabase: { from: (tabela) => ({
        upsert: async (linhas) => { pedidos.push([tabela, linhas.length]); return { error: erro }; },
        insert: async (linhas) => { pedidos.push([tabela, linhas.length]); return { error: erro }; },
      }) } },
      '../lib/idDaConta': { idDaConta: async () => 'eu' },
      '../lib/idsNoCatalogo': {
        idGuardado: async (c) => noDisco.get(c) ?? null,
        guardarId: async (c, id) => { guardados.push(c); noDisco.set(c, id); },
        esquecerId: async (c) => { esquecidos.push(c); noDisco.delete(c); },
      },
      './library': { upsertTrack: async () => { throw Error('um a um, não'); },
        upsertTracks: async (faixas) => { pedidos.push(['upsert_catalog_tracks', faixas.length]);
          return new Map(faixas.map((f) => [`${f.source}:${f.sourceId}`, `id-${f.sourceId}`])); } },
      '../lib/artistasSemente': {}, '../lib/gostoDoSpotify': {}, '../lib/prefs': {}, '../lib/artistName': {},
    }, { setTimeout: () => 1, clearTimeout() {}, console: { ...console, error() {}, warn() {} } });
    const faixa = (id) => ({ source: 'youtube', sourceId: id, title: id, artist: 'A' });
    assert.equal(plays.INICIOS_ESPERAM_MS, 10 * 60_000, 'as começadas esperam o mesmo que as escutas');
    await plays.registarInicioDaFaixa(faixa('a'));
    await plays.registarInicioDaFaixa(faixa('b'));
    await plays.enviarInicios();
    assert.deepEqual(pedidos, [['faixas_comecadas', 2]], 'músicas com o id no disco não perguntam ao catálogo');
    pedidos.length = 0;
    await plays.registarInicioDaFaixa(faixa('a'));
    await plays.registarInicioDaFaixa(faixa('c'));
    await plays.enviarInicios();
    assert.deepEqual(pedidos, [['upsert_catalog_tracks', 1], ['faixas_comecadas', 2]], 'só a nova vai ao catálogo');
    assert.deepEqual(guardados, ['youtube:c'], 'e o id dela fica no disco');
    pedidos.length = 0;
    const em = new Date(0).toISOString();
    assert.equal(await plays.enviarEscutasAtrasadas([{ faixa: faixa('a'), em }, { faixa: faixa('c'), em }]), true);
    assert.deepEqual(pedidos, [['plays', 2]], 'as escutas a seguir às começadas já não perguntam ao catálogo');
    erro = { code: '42501', message: 'rls' };
    assert.equal(await plays.enviarEscutasAtrasadas([{ faixa: faixa('a'), em }]), false);
    assert.deepEqual(esquecidos, [], 'um erro que não é do id não o esquece');
    erro = { code: '23503', message: 'fk' };
    await plays.enviarEscutasAtrasadas([{ faixa: faixa('a'), em }]);
    assert.deepEqual(esquecidos, ['youtube:a'], 'um id que já não existe no catálogo esquece-se');
    erro = null; pedidos.length = 0;
    await plays.enviarEscutasAtrasadas([{ faixa: faixa('a'), em }]);
    assert.deepEqual(pedidos, [['upsert_catalog_tracks', 1], ['plays', 1]], 'e volta a ser pedido');
  }

  // --- O envio da escuta: um pedido por volta, e os pedidos de antes sem o SQL (11/11)
  {
    let ordem = [], lotes = [], resposta = 'feito', falharAntigo = false;
    const timers = [];
    let iniciosNaFila = [], contagensNaFila = [], devolvidos = [], avisoDosInicios = null, avisoDasContagens = null;
    const disco = new Map();
    const armazenamento = { getItem: async (k) => disco.get(k) ?? null,
      setItem: async (k, v) => { disco.set(k, v); }, removeItem: async (k) => { disco.delete(k); } };
    let agora = 1_000_000;
    const fila = load('src/state/escutasPorEnviar.ts', {
      '@react-native-async-storage/async-storage': { default: armazenamento, ...armazenamento },
      'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
      '../api/plays': {
        enviarInicios: async () => { ordem.push('começadas'); },
        enviarEscutasAtrasadas: async (lote) => { ordem.push(`escutas:${lote.length}`); return !falharAntigo; },
        registarLoteDaEscuta: async (lote) => { lotes.push(lote); return resposta; },
        tirarIniciosPorEnviar: () => { const l = iniciosNaFila; iniciosNaFila = []; return l; },
        devolverInicios: (_conta, l) => { devolvidos.push(...l); },
        definirAvisoDosInicios: (f) => { avisoDosInicios = f; },
      },
      '../lib/playCounts': {
        enviarContagensPendentes: async () => { ordem.push('contagens'); },
        contagensPorEnviar: async () => ({ uid: 'eu', contagens: contagensNaFila }),
        contagensEnviadas: async (_uid, foram) => { contagensNaFila = contagensNaFila.filter((c) => !foram.includes(c)); },
        definirAvisoDasContagens: (f) => { avisoDasContagens = f; },
      },
      '../lib/escutasPendentes': load('src/lib/escutasPendentes.ts'),
      './auth': { useAuth: { getState: () => ({ session: { user: { id: 'eu' } } }), subscribe: () => () => {} } },
      './connectivity': { useConnectivity: { getState: () => ({ offline: false }), subscribe: () => () => {} } },
    }, {
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
      Date: class extends Date { static now() { return agora; } },
    });
    const faixa = { source: 'youtube', sourceId: 'a', title: 'a', artist: 'A' };
    const naFila = async () => JSON.parse(disco.get('plays:pendentes:v1:eu') ?? '[]');
    const ouvir = async () => { fila.guardarEscutaPorEnviar(faixa, new Date(agora++), new Date(agora)); await esperar(5); };

    // Um relógio só para as três: as começadas e as contagens avisam o envio.
    const desligar = fila.instalarEnvioDeEscutas();
    await esperar(5);
    assert.equal(lotes.length, 0, 'nada à espera: o arranque não faz pedidos');
    timers.length = 0;
    avisoDosInicios(false); avisoDasContagens(); avisoDosInicios(false);
    assert.equal(timers.length, 1, 'as começadas e as contagens armam o mesmo relógio, uma vez');
    assert.equal(timers[0].ms, fila.ESCUTAS_ESPERAM_MS);

    // Tudo num pedido.
    iniciosNaFila = [{ track: faixa, em: 'x' }];
    contagensNaFila = [{ operationDevice: 'd', operationSequence: 1 }];
    await ouvir();
    timers[0].fn();
    await esperar(10);
    assert.equal(lotes.length, 1, 'um pedido');
    assert.equal(lotes[0].escutas.length, 1); assert.equal(lotes[0].comecadas.length, 1); assert.equal(lotes[0].contagens.length, 1);
    assert.deepEqual(ordem, [], 'nenhum dos pedidos de antes');
    assert.equal((await naFila()).length, 0, 'as escutas saem da fila');
    assert.equal(contagensNaFila.length, 0, 'e as contagens');

    // Um lote que falha: tudo fica para a próxima, e não se tenta pelos pedidos de antes.
    lotes = []; resposta = 'falhou';
    iniciosNaFila = [{ track: faixa, em: 'y' }];
    contagensNaFila = [{ operationDevice: 'd', operationSequence: 2 }];
    await ouvir();
    await fila.enviarEscutasPorEnviar();
    assert.equal(lotes.length, 1);
    assert.deepEqual(ordem, [], 'uma falha não gasta os pedidos de antes');
    assert.equal(devolvidos.length, 1, 'as começadas voltam à fila');
    assert.equal((await naFila())[0].tentativas, 1, 'a escuta fica, com mais uma tentativa');
    assert.equal(contagensNaFila.length, 1, 'as contagens ficam');

    // Sem a função no servidor: os pedidos de antes, e só se volta a tentar ao fim de 6 h.
    lotes = []; resposta = 'sem-funcao'; devolvidos = [];
    iniciosNaFila = [{ track: faixa, em: 'z' }];
    await fila.enviarEscutasPorEnviar();
    assert.equal(lotes.length, 1);
    assert.equal(devolvidos.length, 1, 'as começadas voltam, para irem pelo caminho de antes');
    assert.deepEqual(ordem, ['começadas', 'escutas:1', 'contagens'],
      'as começadas primeiro (deixam os ids na memória), depois as escutas e as contagens');
    ordem = []; lotes = [];
    await ouvir();
    await fila.enviarEscutasPorEnviar();
    assert.equal(lotes.length, 0, 'não se pergunta outra vez pela função logo a seguir');
    assert.deepEqual(ordem, ['começadas', 'escutas:1', 'contagens']);
    ordem = [];
    falharAntigo = true;
    await ouvir();
    await fila.enviarEscutasPorEnviar();
    assert.deepEqual(ordem, ['começadas', 'escutas:1'], 'uma escuta que falhou não gasta outro pedido nas contagens');
    falharAntigo = false; ordem = [];
    agora += fila.SEM_FUNCAO_ESPERA_MS + 1; resposta = 'feito';
    await fila.enviarEscutasPorEnviar();
    assert.equal(lotes.length, 1, 'ao fim de 6 h volta a experimentar a função');
    assert.deepEqual(ordem, []);
    assert.equal((await naFila()).length, 0);

    // Com muitas começadas, vai já.
    lotes = [];
    iniciosNaFila = [{ track: faixa, em: 'w' }];
    avisoDosInicios(true);
    await esperar(5);
    assert.equal(lotes.length, 1, 'o teto das começadas manda logo');
    desligar();
    assert.equal(avisoDosInicios, null); assert.equal(avisoDasContagens, null);
  }

  // --- O lote da escuta no plays.ts: o que vai no pedido (11/11) --------------
  {
    const chamadas = [];
    let erro = null;
    const timers = [];
    const plays = load('src/api/plays.ts', {
      '../lib/supabase': { supabase: { rpc: async (nome, args) => { chamadas.push([nome, args]); return { error: erro }; } } },
      '../lib/idDaConta': { idDaConta: async () => 'eu' },
      '../lib/idsNoCatalogo': { idGuardado: async () => null, guardarId: async () => {}, esquecerId: async () => {} },
      './library': {}, '../lib/artistasSemente': {}, '../lib/gostoDoSpotify': {}, '../lib/prefs': {}, '../lib/artistName': {},
    }, { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
      console: { ...console, error() {} } });
    const f = (id, extra = {}) => ({ source: 'youtube', sourceId: id, title: ` ${id} `, artist: 'A', durationSeconds: 200.6, ...extra });
    assert.equal(await plays.registarLoteDaEscuta({
      escutas: [{ faixa: f('a'), em: 'e1' }, { faixa: f('a'), em: 'e2' }, { faixa: f('mau', { title: '   ' }), em: 'e3' }],
      comecadas: [{ track: f('b', { artworkUrl: 'x'.repeat(3000), durationSeconds: 99999 }), em: 'c1' }],
      contagens: [{ operationSequence: 1 }],
    }), 'feito');
    assert.equal(chamadas.length, 1);
    const [nome, { p_lote }] = chamadas[0];
    assert.equal(nome, 'registar_escutas');
    assert.deepEqual(p_lote.faixas.map((x) => x.sourceId), ['a', 'b'], 'cada faixa uma vez; a que o catálogo recusava fica de fora');
    assert.equal(p_lote.faixas[0].title, 'a'); assert.equal(p_lote.faixas[0].durationSeconds, 201);
    assert.equal(p_lote.faixas[1].artworkUrl, null); assert.equal(p_lote.faixas[1].durationSeconds, null);
    assert.deepEqual(p_lote.escutas, [{ source: 'youtube', sourceId: 'a', em: 'e1' }, { source: 'youtube', sourceId: 'a', em: 'e2' }]);
    assert.deepEqual(p_lote.comecadas, [{ source: 'youtube', sourceId: 'b', em: 'c1' }]);
    assert.deepEqual(p_lote.contagens, [{ operationSequence: 1 }]);
    erro = { code: 'PGRST202', message: 'not found' };
    assert.equal(await plays.registarLoteDaEscuta({ escutas: [], comecadas: [], contagens: [] }), 'sem-funcao');
    erro = { code: '57014', message: 'timeout' };
    assert.equal(await plays.registarLoteDaEscuta({ escutas: [], comecadas: [], contagens: [] }), 'falhou');

    // Os inícios: com o envio da escuta instalado não têm relógio próprio.
    const avisos = [];
    plays.definirAvisoDosInicios((ja) => avisos.push(ja));
    await plays.registarInicioDaFaixa(f('a'));
    assert.deepEqual(avisos, [false]); assert.equal(timers.length, 0, 'sem relógio próprio');
    const tirados = plays.tirarIniciosPorEnviar('eu');
    assert.equal(tirados.length, 1); assert.equal(plays.tirarIniciosPorEnviar('eu').length, 0, 'saíram da fila');
    plays.devolverInicios('eu', tirados);
    assert.equal(plays.tirarIniciosPorEnviar('outra').length, 0, 'os de outra conta não vão');
    plays.devolverInicios('eu', tirados);
    for (let i = 0; i < plays.INICIOS_POR_LOTE; i++) await plays.registarInicioDaFaixa(f(`x${i}`));
    assert.equal(avisos.at(-1), true, 'no teto do lote, avisa que é para ir já');
    plays.definirAvisoDosInicios(null);
  }

  // --- A conversa aberta (lida no código: é um efeito de um componente) --------
  {
    const hub = fs.readFileSync(path.join(__dirname, '../src/components/SocialHub.tsx'), 'utf8');
    assert.match(hub, /table:'shared_items'\},\(evento\)=>\{if\(minhaDaqui\(evento\.new as any\)\)void load\(\);\}\)/,
      'só as minhas mensagens desta conversa relêem a conversa (as outras chegam pela inbox)');
    assert.match(hub, /intervaloComAppVisivel\(\(\)=>\{if\(!aoVivo\|\|\+\+voltas%5===0\)void load\(\);\},60000\)/,
      'com o canal ligado, a conversa relê-se de cinco em cinco minutos');
    assert.match(hub, /if \(aoVivo && !esteveAtras && !perdida && Date\.now\(\) - ultimaCarga < 60_000\) return;/,
      'voltar à janela não relê a conversa a cada foco');
  }

  // --- Os ajustes e os presets do EQ não releem com a app escondida -----------
  for (const f of ['src/state/presets.ts', 'src/state/trackAdjustments.ts']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(s, /intervaloComAppVisivel\(\s*\(\)\s*=>\s*recuperar\(10\s*\*\s*60_000\)\s*,\s*120000\)/, `${f}: a recuperação só com a app à vista`);
    assert.doesNotMatch(s, /setInterval\(\s*\(\)\s*=>\s*recuperar/, `${f}: sem setInterval a correr no tabuleiro`);
  }

  console.log('Pedidos ao Supabase: Social, chat, Jam, músicas começadas e o lote da escuta passaram.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

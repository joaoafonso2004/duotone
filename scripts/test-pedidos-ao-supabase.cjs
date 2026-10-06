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
 *  - as músicas começadas vão em lote.
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
function social(plataforma) {
  const c = { inbox: 0, amizades: 0, grupos: 0, presenca: 0, conversas: 0, previews: 0, vistas: 0, marcas: 0, removidos: 0 };
  const ambiente = { visivel: true, proximaInbox: [], estado: 'active', canais: [], aoMudarApp: null, aoMudarJanela: null };
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
      rpc: async (nome) => { if (nome === 'get_social_presence') c.presenca++; return { data: { serverTime: new Date().toISOString(), items: [] }, error: null }; },
      channel: canal, removeChannel: async () => { c.removidos++; },
    } },
    '../lib/socialPresence': { estadoDaPresenca: () => ({}) },
    '../lib/social': load('src/lib/social.ts'),
    '../lib/profileMedia': { clearProfileMediaCache() {} },
    '../api/profiles': { getSocialConversations: async () => { c.conversas++; return []; } },
    '../lib/appVisibility': { appEstaVisivel: () => ambiente.visivel, intervaloComAppVisivel: () => () => {} },
    '../lib/inAppNotifications': load('src/lib/inAppNotifications.ts'),
    '../lib/recuperacaoDaInbox': load('src/lib/recuperacaoDaInbox.ts'),
    '../lib/socialActivity': load('src/lib/socialActivity.ts'),
    '../api/conversationPreviews': { getConversationPreviews: async () => { c.previews++; return { activity: {}, previews: {}, complete: true }; } },
  }, { document, window, setInterval: () => 0, clearInterval() {}, console: { warn() {} } });
  return { modulo, c, ambiente };
}

async function main() {
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

  console.log('Pedidos ao Supabase: Social, chat, Jam e músicas começadas passaram.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

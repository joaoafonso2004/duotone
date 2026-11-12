/**
 * Os canais do Realtime não ficam mortos (12/11).
 *
 * O relatório do PC do João dizia `realtime: NOT connected, 0/0 channels joined`
 * e a inbox era lida de minuto a minuto: o servidor tinha fechado os canais (o
 * provável: a chave pública empurrada como token quando a sessão falhou), e o
 * realtime-js nunca volta a entrar num canal fechado. Duas partes:
 *
 *  1. `lib/tokenDoRealtime.ts`: o Realtime só recebe JWTs -- também contra o
 *     `RealtimeClient` verdadeiro, sem rede.
 *  2. `state/social.ts`: o canal do Social volta a ligar-se depois de um CLOSED
 *     (com uma espera que cresce), um canal antigo com o mesmo nome sai antes
 *     de se ligar o novo, e a recuperação de 2 min apanha um canal que sumiu.
 *
 * Correr: node scripts/test-canais-do-realtime.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').replace(/\r\n/g, '\n');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.stack || e.message}`); }
}

function ambiente(os = 'web') {
  let proximo = 0;
  const intervalos = new Map(), prazos = new Map(), ouvintes = new Set(), web = new Set();
  const AppState = {
    currentState: 'active',
    addEventListener: (_, fn) => { ouvintes.add(fn); return { remove: () => ouvintes.delete(fn) }; },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener: (_, fn) => web.add(fn),
    removeEventListener: (_, fn) => web.delete(fn),
  };
  const globals = {
    Date, document, console, AbortController, window: {},
    setInterval: (fn, ms) => { const id = ++proximo; intervalos.set(id, { fn, ms }); return id; },
    clearInterval: (id) => intervalos.delete(id),
    setTimeout: (fn, ms) => { const id = ++proximo; prazos.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => prazos.delete(id),
  };
  function carregar(nome, mocks = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(ler(nome), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { ...globals, module, exports: module.exports, require: (id) => {
      if (id in mocks) return mocks[id];
      throw Error('Import inesperado: ' + id);
    } }, { filename: nome });
    return module.exports;
  }
  const rn = { AppState, Platform: { OS: os } };
  const visibilidade = carregar('src/lib/appVisibility.ts', { 'react-native': rn });
  return {
    carregar, rn, visibilidade, intervalos, prazos,
    bater: (ms) => { for (const [id, t] of [...intervalos]) if (t.ms === ms && intervalos.has(id)) t.fn(); },
    vencer: (ms) => { for (const [id, t] of [...prazos]) if (t.ms === ms && prazos.has(id)) { prazos.delete(id); t.fn(); } },
    esperas: () => [...prazos.values()].map((t) => t.ms),
  };
}

/** Um supabase falso com o registo de canais do realtime-js: o mesmo nome devolve o mesmo canal. */
function realtimeFalso() {
  const canais = [];
  const criados = [];
  const removidos = [];
  const supabase = {
    rpc: async () => ({ data: null }),
    getChannels: () => canais,
    channel(nome) {
      const topico = `realtime:${nome}`;
      const existente = canais.find((c) => c.topic === topico);
      if (existente) return existente;
      const c = { topic: topico, estado: 'closed', cb: null,
        on() { return this; },
        subscribe(cb) { if (this.estado === 'closed') { this.estado = 'joining'; this.cb = cb; } return this; } };
      canais.push(c);
      criados.push(c);
      return c;
    },
    async removeChannel(c) {
      const i = canais.indexOf(c);
      if (i >= 0) canais.splice(i, 1);
      removidos.push(c);
      c.estado = 'closed';
      c.cb?.('CLOSED');
    },
  };
  /** O servidor fecha o canal: sai da ligação e avisa com CLOSED, como o realtime-js. */
  const fecharNoServidor = (c) => { const i = canais.indexOf(c); if (i >= 0) canais.splice(i, 1); c.estado = 'closed'; c.cb?.('CLOSED'); };
  const ligar = (c) => { c.estado = 'joined'; c.cb?.('SUBSCRIBED'); };
  return { supabase, canais, criados, removidos, fecharNoServidor, ligar };
}

function social(a, rt) {
  return a.carregar('src/state/social.ts', {
    zustand: require('zustand'), 'react-native': a.rn,
    '../lib/oQueMudou': { verificarMudancas: async () => ({ mudou: false, confirmar() {} }) },
    '../api/social': { getFriendships: async () => [], getGrupos: async () => [],
      getInboxItems: async () => [], lerConversasVistas: async () => ({}), marcarConversaVista: async () => {} },
    '../lib/prefs': { getChatsVistos: async () => ({}), marcarChatVisto: async () => ({}) },
    '../lib/supabase': { supabase: rt.supabase },
    '../lib/socialPresence': { estadoDaPresenca: () => ({}) },
    '../lib/presencaAoVivo': { ouvirPresencasAoVivo: () => ({ atualizar() {}, pausar() {}, retomar() {}, parar() {} }), presencaDoEstado: () => null },
    '../lib/social': a.carregar('src/lib/social.ts'),
    '../lib/profileMedia': { clearProfileMediaCache() {} }, '../api/profiles': { getSocialConversations: async () => [], esquecerPerfisPublicos() {} },
    '../lib/appVisibility': a.visibilidade, '../lib/inAppNotifications': a.carregar('src/lib/inAppNotifications.ts'),
    '../lib/recuperacaoDaInbox': a.carregar('src/lib/recuperacaoDaInbox.ts'),
    '../lib/socialActivity': a.carregar('src/lib/socialActivity.ts'),
    '../api/conversationPreviews': { getConversationPreviews: async () => ({ activity: {}, previews: {}, complete: true }) },
    './connectivity': { useConnectivity: { getState: () => ({ offline: false }) } },
  });
}

(async () => {
  console.log('\no token do Realtime');
  const tk = ambiente().carregar('src/lib/tokenDoRealtime.ts');
  const JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.assinatura_-1';
  const JWT2 = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ5In0.outra';
  const PUBLICA = 'sb_publishable_8vXMNabcdef';

  await caso('reconhece um JWT e recusa a chave pública', () => {
    assert.equal(tk.pareceJwt(JWT), true);
    for (const nao of [PUBLICA, '', null, undefined, 'a.b', 'a.b.c.d', 'eyJ.eyJ.com espaço']) assert.equal(tk.pareceJwt(nao), false, String(nao));
  });
  await caso('nunca devolve a chave pública: uma sessão que falha fica no último JWT', async () => {
    let lida = { token: JWT };
    const token = tk.criarTokenDoRealtime(async () => lida);
    assert.equal(await token(), JWT);
    lida = { token: undefined, erro: new Error('rede') };
    assert.equal(await token(), JWT, 'a renovação falhou: fica o último');
    lida = { token: PUBLICA };
    assert.equal(await token(), JWT, 'outra coisa que não um JWT também não passa');
    const atira = tk.criarTokenDoRealtime(async () => { throw new Error('lock'); });
    assert.equal(await atira(), null, 'sem nenhum JWT ainda: null, e o realtime-js não empurra nada');
    lida = { token: JWT2 };
    assert.equal(await token(), JWT2, 'o renovado entra');
  });
  await caso('sem sessão e sem erro é sair da conta: esquece o token', async () => {
    let lida = { token: JWT };
    const token = tk.criarTokenDoRealtime(async () => lida);
    await token();
    lida = { token: null };
    assert.equal(await token(), null);
    lida = { token: undefined, erro: new Error('rede') };
    assert.equal(await token(), null, 'depois de sair não volta o token de quem saiu');
  });
  await caso('contra o RealtimeClient verdadeiro: a chave pública nunca chega a token', async () => {
    const { RealtimeClient } = require('@supabase/realtime-js');
    let lida = { token: JWT };
    const comGuarda = new RealtimeClient('ws://127.0.0.1:9/realtime/v1', {
      accessToken: tk.criarTokenDoRealtime(async () => lida), params: { apikey: PUBLICA } });
    await comGuarda.setAuth();
    assert.equal(comGuarda.accessTokenValue, JWT);
    lida = { token: undefined, erro: new Error('rede') };
    await comGuarda.setAuth();
    assert.equal(comGuarda.accessTokenValue, JWT, 'com a guarda fica o JWT');
    // O que o supabase-js fazia sem ela: `session?.access_token ?? supabaseKey`.
    let sessao = JWT;
    const semGuarda = new RealtimeClient('ws://127.0.0.1:9/realtime/v1', {
      accessToken: async () => sessao ?? PUBLICA, params: { apikey: PUBLICA } });
    await semGuarda.setAuth();
    sessao = null;
    await semGuarda.setAuth();
    assert.equal(semGuarda.accessTokenValue, PUBLICA, 'sem a guarda o token passava a ser a chave pública');
    comGuarda.disconnect(); semGuarda.disconnect();
  });
  await caso('a app usa a guarda, e o supabase-js deixa-a substituir o dele', () => {
    const fonte = ler('src/lib/supabase.ts');
    assert.match(fonte, /const tokenDoRealtime = criarTokenDoRealtime\(async \(\) => \{\n\s*const \{ data, error \} = await supabase\.auth\.getSession\(\);\n\s*return \{ token: data\.session\?\.access_token, erro: error \};/);
    assert.match(fonte, /realtime: \{\n(?:\s*\/\/.*\n)*\s*accessToken: tokenDoRealtime,/);
    // As opções `realtime` entram DEPOIS do `accessToken` do supabase-js: se uma
    // atualização mudar a ordem, a guarda deixa de valer e isto tem de partir.
    const sb = fs.readFileSync(require.resolve('@supabase/supabase-js'), 'utf8');
    assert.match(sb, /accessToken: this\._getAccessToken\.bind\(this\),\s*fetch: this\.fetch\s*\}, settings\.realtime\)/);
  });

  console.log('\no canal do Social no PC');
  await caso('fechado pelo servidor, volta a ligar-se, com a espera a crescer', async () => {
    const a = ambiente('web'); const rt = realtimeFalso();
    const s = social(a, rt);
    const parar = s.iniciarSocial('me'); await flush();
    assert.equal(rt.criados.length, 1);
    const primeiro = rt.criados[0];
    rt.ligar(primeiro); await flush();
    rt.fecharNoServidor(primeiro); await flush();
    assert.deepEqual(a.esperas().filter((ms) => ms >= 5000), [5000], 'espera 5 s antes de voltar');
    a.vencer(5000); await flush();
    assert.equal(rt.criados.length, 2, 'um canal novo');
    assert.notEqual(rt.criados[1], primeiro);
    assert.equal(rt.canais.length, 1);
    // Volta a fechar sem nunca pegar: a espera cresce.
    rt.fecharNoServidor(rt.criados[1]); await flush();
    assert.ok(a.esperas().includes(30000), 'à segunda, 30 s');
    a.vencer(30000); await flush();
    assert.equal(rt.criados.length, 3);
    // Pegou: a espera volta ao início.
    rt.ligar(rt.criados[2]); await flush();
    rt.fecharNoServidor(rt.criados[2]); await flush();
    assert.ok(a.esperas().includes(5000), 'depois de ligado, recomeça nos 5 s');
    parar(); await flush();
    assert.equal(a.esperas().filter((ms) => ms >= 5000).length, 0, 'sair da conta larga a espera');
    assert.equal(rt.criados.length, 3, 'e não liga outro');
  });
  await caso('um canal antigo com o mesmo nome sai antes de se ligar o novo', async () => {
    const a = ambiente('web'); const rt = realtimeFalso();
    const velho = rt.supabase.channel('social:me');
    velho.estado = 'leaving';
    const s = social(a, rt);
    const parar = s.iniciarSocial('me'); await flush();
    assert.ok(rt.removidos.includes(velho), 'o que ainda lá estava saiu');
    assert.equal(rt.criados.length, 2, 'e ligou-se um novo, em vez de reaproveitar o que estava a sair');
    assert.equal(rt.criados[1].estado, 'joining');
    parar();
  });
  await caso('a recuperação de 2 min apanha um canal que sumiu sem aviso', async () => {
    const a = ambiente('web'); const rt = realtimeFalso();
    const s = social(a, rt);
    const parar = s.iniciarSocial('me'); await flush();
    const primeiro = rt.criados[0];
    rt.ligar(primeiro); await flush();
    // Sai da ligação, e o CLOSED perde-se.
    rt.canais.splice(rt.canais.indexOf(primeiro), 1); primeiro.cb('CHANNEL_ERROR'); await flush();
    a.bater(120000); await flush();
    assert.ok(a.esperas().includes(5000), 'agenda a religação');
    a.vencer(5000); await flush();
    assert.equal(rt.criados.length, 2);
    parar();
  });
  await caso('largar o canal de propósito não o volta a ligar', async () => {
    const a = ambiente('web'); const rt = realtimeFalso();
    const s = social(a, rt);
    const parar = s.iniciarSocial('me'); await flush();
    rt.ligar(rt.criados[0]); await flush();
    parar(); await flush();
    assert.equal(rt.removidos.length, 1);
    assert.equal(a.esperas().filter((ms) => ms >= 5000).length, 0);
  });

  console.log('\no iPhone');
  await caso('escondido, o canal fechado não volta até a app voltar à frente', async () => {
    const a = ambiente('ios'); const rt = realtimeFalso();
    const s = social(a, rt);
    const parar = s.iniciarSocial('me'); await flush();
    rt.ligar(rt.criados[0]); await flush();
    rt.fecharNoServidor(rt.criados[0]); await flush();
    a.rn.AppState.currentState = 'background';
    a.vencer(5000); await flush();
    assert.equal(rt.criados.length, 1, 'escondido não liga');
    parar();
  });

  if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exitCode = 1; }
  else console.log('\nCanais do Realtime: todos os casos passaram.');
})();

/**
 * A conta do Spotify no processo principal (10/11) -- electron/contaDoSpotify.cjs.
 * Corre sem Electron e sem rede: um `electron` falso (janelas e sessão) e um
 * `fetch` falso. O que se confere é o caminho de cada consulta: o token tirado
 * dos pedidos do leitor, um token só para várias consultas, renovar no 401,
 * reler os hashes quando o Spotify muda o leitor, e o login caducado.
 *
 * Correr: node scripts/test-conta-do-spotify.cjs
 */
const assert = require('node:assert/strict');
const Module = require('node:module');

// ---- o Electron falso -------------------------------------------------------
const sessao = {
  antes: null, cabecalhos: null,
  webRequest: {
    onBeforeRequest(filtro, f) { sessao.antes = typeof filtro === 'function' ? filtro : f; },
    onBeforeSendHeaders(filtro, f) { sessao.cabecalhos = typeof filtro === 'function' ? filtro : f; },
  },
  cookies: {
    lista: [], ouvinte: null,
    get: async () => sessao.cookies.lista,
    on(_ev, f) { sessao.cookies.ouvinte = f; },
    removeListener() { sessao.cookies.ouvinte = null; },
  },
  clearCache: async () => {}, clearStorageData: async () => {},
  setPermissionRequestHandler(f) { sessao.permissoes = f; },
};
let janelas = 0;
let tokens = 0;
const SCRIPT = 'https://open.spotifycdn.com/cdn/build/web-player/web-player.0123abcd.js';
let ultima = null;
class BrowserWindow {
  constructor(opcoes) {
    this.id = ++janelas;
    this.opcoes = opcoes;
    this.destruida = false;
    this.eventos = {};
    const eventos = {};
    this.webContents = {
      id: this.id, eventos, setAudioMuted() {}, setUserAgent(ua) { this.ua = ua; },
      getUserAgent: () => 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Electron/44.3.0 duotone/2.7.0 Safari/537.36',
      on(ev, f) { eventos[ev] = f; }, setWindowOpenHandler(f) { this.abrir = f; },
    };
    ultima = this;
  }
  on(ev, f) { this.eventos[ev] = f; }
  close() { this.destroy(); }
  // O leitor web a carregar: pede o seu script e faz uma consulta com o token dele.
  loadURL() {
    setTimeout(() => {
      sessao.antes?.({ webContentsId: this.id, url: SCRIPT, resourceType: 'script' }, () => {});
      sessao.antes?.({ webContentsId: this.id, url: 'https://i.scdn.co/image/x', resourceType: 'image' }, (r) => { cancelouImagem ||= r.cancel; });
      sessao.cabecalhos?.({ requestHeaders: { Authorization: `Bearer T${++tokens}`, 'Client-Token': 'C', 'Spotify-App-Version': '1.2.95' } }, () => {});
    }, 1);
    return Promise.resolve();
  }
  isDestroyed() { return this.destruida; }
  destroy() {
    if (this.destruida) return;
    this.destruida = true;
    this.eventos.closed?.();
  }
  focus() {}
}
let cancelouImagem = false;
const avisos = [];
const electronFalso = {
  app: { getName: () => 'duotone', getPath: () => require('node:os').tmpdir() },
  BrowserWindow,
  dialog: { showMessageBox: async (_janela, opcoes) => { avisos.push(opcoes); return { response: 0 }; } },
  session: { fromPartition: () => sessao },
};
const carregar = Module._load;
Module._load = function (pedido, ...resto) {
  return pedido === 'electron' ? electronFalso : carregar.call(this, pedido, ...resto);
};

// ---- a rede falsa -------------------------------------------------------------
const HASH_NOVO = 'f'.repeat(64);
let respostas = [];
const enviados = [];
global.fetch = async (url, opcoes) => {
  if (url === SCRIPT) return { text: async () => `x,"fetchPlaylist","query","${HASH_NOVO}",y` };
  enviados.push({ url, cabecalhos: opcoes.headers, corpo: JSON.parse(opcoes.body) });
  const r = respostas.shift();
  if (!r) throw new Error('resposta a mais');
  return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, headers: { get: () => null }, json: async () => r.json };
};

const conta = require('../electron/contaDoSpotify.cjs');

(async () => {
  assert.equal(conta.agenteDoChrome('Mozilla/5.0 Chrome/140.0 Electron/44.3.0 duotone/2.7.0 Safari/537.36'),
    'Mozilla/5.0 Chrome/140.0 Safari/537.36', 'o login do Spotify e o do Google recusam quem diz ser o Electron');

  conta.configurar();
  sessao.permissoes(null, 'media', (ok) => assert.equal(ok, false, 'a partição do Spotify não pede nada'));

  assert.deepEqual(await conta.consultar('deleteThing', {}), { ok: false, falha: 'recusado' }, 'só as consultas da lista');
  assert.equal(enviados.length, 0);

  // A primeira consulta abre o leitor escondido e usa o token dele.
  respostas = [{ json: { data: { playlistV2: { name: 'X' } } } }];
  const r1 = await conta.consultar('fetchPlaylist', { uri: 'spotify:playlist:x', offset: 0, limit: 1 });
  assert.deepEqual(r1, { ok: true, dados: { playlistV2: { name: 'X' } } });
  assert.equal(enviados[0].cabecalhos.authorization, 'Bearer T1');
  assert.equal(enviados[0].cabecalhos['client-token'], 'C');
  assert.equal(enviados[0].corpo.operationName, 'fetchPlaylist');
  assert.equal(enviados[0].corpo.extensions.persistedQuery.sha256Hash, HASH_NOVO, 'o hash lido do script do leitor');
  assert.equal(enviados[0].corpo.variables.uri, 'spotify:playlist:x');
  assert.equal(cancelouImagem, true, 'o leitor escondido não descarrega imagens');
  const janelasDepoisDaPrimeira = janelas;

  // A segunda reaproveita o token.
  respostas = [{ json: { data: { me: { profile: {} } } } }];
  assert.equal((await conta.consultar('profileAttributes', {})).ok, true);
  assert.equal(janelas, janelasDepoisDaPrimeira, 'um token só para várias consultas');
  assert.equal(enviados[1].corpo.extensions.persistedQuery.sha256Hash, conta.CONSULTAS.profileAttributes, 'o hash guardado quando o script não o traz');

  // 401: um token novo, e a consulta repete-se.
  respostas = [{ status: 401 }, { json: { data: { ok: 1 } } }];
  assert.deepEqual(await conta.consultar('libraryV3', { offset: 0 }), { ok: true, dados: { ok: 1 } });
  assert.equal(janelas, janelasDepoisDaPrimeira + 1);
  assert.equal(enviados.at(-1).cabecalhos.authorization, 'Bearer T2');

  // 401 duas vezes: o login caducou.
  respostas = [{ status: 401 }, { status: 401 }];
  assert.deepEqual(await conta.consultar('libraryV3', { offset: 0 }), { ok: false, falha: 'desligado' });

  // O Spotify mudou o leitor: relê-se uma vez, e se continuar, diz-se.
  respostas = [{ json: { errors: [{ message: 'PersistedQueryNotFound' }] } }, { json: { data: { ok: 2 } } }];
  assert.deepEqual(await conta.consultar('fetchLibraryTracks', { offset: 0, limit: 1 }), { ok: true, dados: { ok: 2 } });
  respostas = [{ json: { errors: [{ message: 'PersistedQueryNotFound' }] } }, { json: { errors: [{ message: 'PersistedQueryNotFound' }] } }];
  assert.deepEqual(await conta.consultar('fetchLibraryTracks', { offset: 0, limit: 1 }), { ok: false, falha: 'mudou' });

  // Sem sessão o leitor abre como anónimo: o `me` vem vazio.
  respostas = [{ json: { errors: [{ message: 'User not authorized' }], data: { me: null } } }];
  assert.deepEqual(await conta.consultar('profileAttributes', {}), { ok: false, falha: 'desligado' });

  // Só erros, sem dados: não é uma biblioteca vazia.
  respostas = [{ json: { errors: [{ message: 'Something else' }] } }];
  assert.deepEqual(await conta.consultar('libraryV3', { offset: 0 }), { ok: false, falha: 'recusado' });

  // Um 403 seco.
  respostas = [{ status: 403 }];
  assert.deepEqual(await conta.consultar('libraryV3', { offset: 0 }), { ok: false, falha: 'recusado' });

  assert.equal(respostas.length, 0, 'nenhuma resposta ficou por usar');

  // ---- entrar ----------------------------------------------------------------
  const cookie = (valor) => ({ name: 'sp_dc', value: valor, domain: '.spotify.com' });
  {
    // O login acaba quando aparece o sp_dc; a janela fecha-se sozinha.
    const feito = conta.entrar(null);
    const janela = ultima;
    assert.equal(janela.webContents.ua, 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36');
    assert.equal(janela.opcoes.webPreferences.session, sessao, 'na partição do Spotify');
    assert.equal(conta.entrar(null), feito, 'carregar outra vez traz a mesma janela para a frente');
    assert.deepEqual(janela.webContents.abrir({ url: 'javascript:alert(1)' }), { action: 'deny' });
    assert.equal(janela.webContents.abrir({ url: 'https://www.facebook.com/login' }).action, 'allow', 'o Continuar com o Facebook abre a sua janela');
    // O Google recusa entrar dentro de apps (11/11): não se abre, e diz-se o que fazer.
    assert.deepEqual(janela.webContents.abrir({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' }), { action: 'deny' });
    assert.equal(avisos.length, 1, 'avisa');
    assert.match(avisos[0].detail, /code/, 'o aviso explica o login com código');
    let travou = false;
    janela.webContents.eventos['will-navigate']({ preventDefault: () => { travou = true; } }, 'https://accounts.google.com/signin');
    assert.equal(travou, true, 'navegar para o Google na mesma janela também se trava');
    travou = false;
    janela.webContents.eventos['will-redirect']({ preventDefault: () => { travou = true; } }, 'https://accounts.google.co.uk/x');
    assert.equal(travou, true, 'e um redirecionamento para lá');
    travou = false;
    janela.webContents.eventos['will-navigate']({ preventDefault: () => { travou = true; } }, 'https://accounts.spotify.com/login/password');
    assert.equal(travou, false, 'o login do próprio Spotify segue');
    assert.equal(avisos.length, 3);
    sessao.cookies.ouvinte(null, { name: 'sp_t', value: 'x' }, 'explicit', false);
    assert.equal(janela.destruida, false, 'outro cookie não chega');
    sessao.cookies.ouvinte(null, cookie('abc'), 'explicit', false);
    assert.equal(await feito, true);
    assert.equal(janela.destruida, true);
    assert.equal(sessao.cookies.ouvinte, null, 'deixa de ouvir os cookies');
  }
  {
    // Fechar a janela antes de entrar.
    const feito = conta.entrar(null);
    ultima.close();
    assert.equal(await feito, false);
  }
  {
    // Já com sessão o cookie não muda: chegar ao leitor com ele também conta.
    sessao.cookies.lista = [cookie('abc')];
    const feito = conta.entrar(null);
    const janela = ultima;
    await janela.webContents.eventos['did-navigate'](null, 'https://accounts.spotify.com/login');
    assert.equal(janela.destruida, false, 'ainda na página de login');
    await janela.webContents.eventos['did-navigate'](null, 'https://open.spotify.com/');
    assert.equal(await feito, true);
    sessao.cookies.lista = [];
  }
  {
    // No leitor sem o cookie (entrou como anónimo): ainda não.
    const feito = conta.entrar(null);
    const janela = ultima;
    await janela.webContents.eventos['did-navigate'](null, 'https://open.spotify.com/');
    assert.equal(janela.destruida, false);
    janela.close();
    assert.equal(await feito, false);
  }
  console.log('conta do Spotify (processo principal): ok');
})().catch((e) => { console.error(e); process.exit(1); });

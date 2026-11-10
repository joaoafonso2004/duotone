const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * A conta do Spotify no PC (10/11), lida como o leitor web do próprio Spotify
 * a lê -- o método do ytspot (github.com/Chaitanya-Shahare/ytspot, MIT).
 *
 * ## Porque não é a API oficial
 *
 * A app do Spotify do Duotone está em modo de desenvolvimento: só entram as
 * contas acrescentadas à mão no painel, no máximo cinco, e desde maio de 2025
 * esse teto só sobe a empresas com 250 mil utilizadores. Aqui a pessoa entra
 * no open.spotify.com numa janela, e a biblioteca lê-se pela API que o leitor
 * web usa (o "pathfinder"), com o token do próprio leitor.
 *
 * ## Como
 *
 * - **Entrar**: uma janela com a página de login do Spotify, numa partição só
 *   dela (`persist:spotify`). Fecha-se sozinha quando aparece o cookie `sp_dc`.
 * - **O token**: uma cópia escondida do leitor web, aberta só quando é preciso,
 *   faz os seus pedidos ao `api-partner.spotify.com`, e daí copiam-se os
 *   cabeçalhos (`authorization`, `client-token`). Assim não se imita o TOTP
 *   que o Spotify pede a quem tira tokens à parte: quem os tira é o leitor.
 * - **As consultas** são guardadas do lado do Spotify e chamam-se por um hash,
 *   que muda quando sai um leitor web novo. Leem-se do script do leitor de
 *   cada vez; os de baixo são os que ele tinha a 8/11/2026, para o caso de essa
 *   leitura falhar.
 *
 * ## O que este ficheiro promete
 *
 * - O `sp_dc` e o token **nunca saem deste processo**: nem para a janela da
 *   app, nem para o Supabase. A janela só recebe as respostas.
 * - Só correm as consultas de `CONSULTAS`, só de leitura.
 * - Nada corre até a pessoa carregar no botão; as janelas só existem enquanto
 *   se entra ou se lê.
 * - É frágil por natureza: se o Spotify mudar o leitor web, a falha é
 *   `mudou`, e a app di-lo em vez de mostrar uma biblioteca vazia.
 */

const ABERTO = 'https://open.spotify.com/';
const LOGIN = `https://accounts.spotify.com/login?continue=${encodeURIComponent(ABERTO)}`;
const PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v2/query';
const PARTICAO = 'spotify';
const sessao = () => session.fromPartition(`persist:${PARTICAO}`);

const CONSULTAS = {
  profileAttributes: '08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0',
  libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
};

/** Quanto tempo o token copiado se usa antes de ir buscar outro (o do leitor dura uma hora). */
const VIDA_DO_TOKEN_MS = 40 * 60 * 1000;
const ESPERA_PELO_TOKEN_MS = 30000;
const ESPERA_POR_CONSULTA_MS = 20000;

/** As páginas de login do Google e do Spotify recusam browsers que dizem ser o Electron. */
function agenteDoChrome(ua) {
  const nome = app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ua.replace(/ Electron\/\S+/, '').replace(new RegExp(` ${nome}\\/\\S+`, 'i'), '');
}

/** Nada nesta partição pede microfone, câmara ou notificações. */
function configurar() {
  sessao().setPermissionRequestHandler((_c, _p, responder) => responder(false));
}

/** Nunca ligado = a partição ainda não existe no disco; perguntar à sessão criava-a. */
async function ligada() {
  if (!fs.existsSync(path.join(app.getPath('userData'), 'Partitions', PARTICAO))) return false;
  return (await sessao().cookies.get({ url: ABERTO, name: 'sp_dc' })).some((c) => !!c.value);
}

/**
 * O "Continuar com o Google" (11/11). O Google recusa entrar dentro de apps
 * ("Este navegador ou esta aplicação podem não ser seguros") -- o João deu com
 * isso logo no primeiro ensaio. Não se contorna: diz-se o que fazer. Uma conta
 * do Spotify criada com o Google tem esse email, e o login do Spotify manda um
 * código para ele, sem palavra-passe.
 */
const doGoogle = (url) => /^https:\/\/accounts\.google\.[a-z.]+\//i.test(String(url ?? ''));
function avisarDoGoogle(janela) {
  if (janela.isDestroyed()) return;
  void dialog.showMessageBox(janela, {
    type: 'info',
    title: 'Log in to Spotify',
    message: "Google doesn't allow signing in inside apps",
    detail: 'Type the email of your Google account in the Spotify login and choose to log in with a code. Spotify emails you a code, and no password is needed.',
    buttons: ['OK'],
  }).catch(() => undefined);
}

let login = null;
/** Abre o login do Spotify; `true` quando entrou, `false` se a janela fechou antes. */
function entrar(pai) {
  if (login) {
    login.janela.focus();
    return login.feito;
  }
  const opcoes = (largura, altura) => ({
    width: largura, height: altura, title: 'Log in to Spotify', autoHideMenuBar: true,
    backgroundColor: '#121212', parent: pai ?? undefined,
    webPreferences: { session: sessao(), contextIsolation: true, sandbox: true },
  });
  const janela = new BrowserWindow(opcoes(480, 760));
  janela.webContents.setUserAgent(agenteDoChrome(janela.webContents.getUserAgent()));
  // "Continuar com o Apple/Facebook" abrem a sua janela; partilham a sessão do
  // login e fecham com ele. O do Google não chega a abrir (`avisarDoGoogle`).
  const popups = new Set();
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (doGoogle(url)) { avisarDoGoogle(janela); return { action: 'deny' }; }
    return /^https:\/\//.test(url) ? { action: 'allow', overrideBrowserWindowOptions: opcoes(480, 700) } : { action: 'deny' };
  });
  const travarOGoogle = (e, url) => {
    if (!doGoogle(url)) return;
    e.preventDefault();
    avisarDoGoogle(janela);
  };
  janela.webContents.on('will-navigate', travarOGoogle);
  janela.webContents.on('will-redirect', travarOGoogle);
  janela.webContents.on('did-create-window', (popup) => {
    popup.webContents.setUserAgent(agenteDoChrome(popup.webContents.getUserAgent()));
    popups.add(popup);
    popup.on('closed', () => popups.delete(popup));
  });
  const feito = new Promise((resolver) => {
    const aoCookie = (_e, c, _causa, removido) => {
      if (c.name === 'sp_dc' && c.value && !removido) acabar(true);
    };
    let acabou = false;
    const acabar = (ok) => {
      // Destruir a janela dispara o `closed`: a segunda chamada não conta.
      if (acabou) return;
      acabou = true;
      sessao().cookies.removeListener('changed', aoCookie);
      login = null;
      for (const p of popups) if (!p.isDestroyed()) p.destroy();
      if (!janela.isDestroyed()) janela.destroy();
      // Uma conta nova: o token da anterior já não serve.
      if (ok) acesso = null;
      resolver(ok);
    };
    sessao().cookies.on('changed', aoCookie);
    janela.on('closed', () => acabar(false));
    // Já com sessão, o cookie não muda e o login segue direto para o leitor:
    // chegar lá com o `sp_dc` também é ter entrado.
    janela.webContents.on('did-navigate', async (_e, url) => {
      if (!url.startsWith(ABERTO)) return;
      const ha = (await sessao().cookies.get({ url: ABERTO, name: 'sp_dc' })).some((c) => !!c.value);
      if (ha && login?.janela === janela) acabar(true);
    });
  });
  login = { janela, feito };
  janela.loadURL(LOGIN).catch(() => undefined); // uma falha a carregar vê-se na própria janela
  return feito;
}

/** Esquece a conta: o cookie, a cache e o token. */
async function sair() {
  login?.janela.close();
  acesso = null;
  if (!fs.existsSync(path.join(app.getPath('userData'), 'Partitions', PARTICAO))) return;
  await sessao().clearStorageData();
  await sessao().clearCache();
}

class Falha extends Error {
  constructor(tipo, detalhe) {
    super(detalhe ?? tipo);
    this.tipo = tipo;
  }
}

/** Os cabeçalhos do leitor web e os hashes atuais, tirados de uma cópia escondida que se fecha logo. */
async function autorizar() {
  const s = sessao();
  const janela = new BrowserWindow({
    show: false, skipTaskbar: true,
    webPreferences: { session: s, backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  const pagina = janela.webContents;
  pagina.setAudioMuted(true);
  pagina.setUserAgent(agenteDoChrome(pagina.getUserAgent()));
  let script = '';
  try {
    const cabecalhos = await new Promise((resolver, rejeitar) => {
      const relogio = setTimeout(() => rejeitar(new Falha('rede', 'O leitor web não respondeu.')), ESPERA_PELO_TOKEN_MS);
      // Ninguém vê esta página: sem imagens, vídeo nem letra.
      s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, responder) => {
        const desta = d.webContentsId === pagina.id;
        if (desta && /\/web-player\/web-player\.[0-9a-f]+\.js$/.test(d.url)) script = d.url;
        responder({ cancel: desta && ['image', 'media', 'font'].includes(d.resourceType) });
      });
      s.webRequest.onBeforeSendHeaders({ urls: ['https://api-partner.spotify.com/*'] }, (d, responder) => {
        const h = Object.fromEntries(Object.entries(d.requestHeaders).map(([k, v]) => [k.toLowerCase(), v]));
        if (h.authorization && h['client-token']) {
          clearTimeout(relogio);
          resolver(h);
        }
        responder({ requestHeaders: d.requestHeaders });
      });
      pagina.on('did-fail-load', (_e, codigo, descricao, _url, principal) => {
        if (principal && codigo !== -3) {
          clearTimeout(relogio);
          rejeitar(new Falha('rede', descricao));
        }
      });
      janela.loadURL(ABERTO).catch(() => undefined); // as falhas chegam pelo did-fail-load
    });
    return {
      quando: Date.now(),
      cabecalhos: {
        authorization: cabecalhos.authorization,
        'client-token': cabecalhos['client-token'],
        'spotify-app-version': cabecalhos['spotify-app-version'] ?? '',
        'app-platform': cabecalhos['app-platform'] ?? 'WebPlayer',
        'user-agent': cabecalhos['user-agent'] ?? '',
        'accept-language': cabecalhos['accept-language'] ?? 'en',
        'content-type': 'application/json;charset=UTF-8',
        accept: 'application/json',
        origin: 'https://open.spotify.com',
        referer: ABERTO,
      },
      hashes: await hashesAtuais(script),
    };
  } finally {
    s.webRequest.onBeforeRequest(null);
    s.webRequest.onBeforeSendHeaders(null);
    janela.destroy();
    // Os scripts do leitor só voltam a ser precisos na próxima importação.
    s.clearCache().catch(() => undefined);
  }
}

async function hashesAtuais(script) {
  const hashes = { ...CONSULTAS };
  if (!script) return hashes;
  try {
    const js = await (await fetch(script, { signal: AbortSignal.timeout(ESPERA_POR_CONSULTA_MS) })).text();
    for (const nome of Object.keys(hashes)) {
      const achado = js.match(new RegExp(`"${nome}","query","([0-9a-f]{64})"`))?.[1];
      if (achado) hashes[nome] = achado;
    }
  } catch {
    // Os de cima podem ainda ser os atuais.
  }
  return hashes;
}

/** Um só pedido de token de cada vez: várias consultas que veem o token caducar partilham o novo. */
let acesso = null;
function autorizado() {
  if (acesso && Date.now() - acesso.quando > VIDA_DO_TOKEN_MS) acesso = null;
  if (!acesso) {
    // Uma falha não fica guardada: a próxima consulta tenta de novo.
    const pedido = autorizar().catch((e) => {
      if (acesso?.pedido === pedido) acesso = null;
      throw e;
    });
    acesso = { quando: Date.now(), pedido };
  }
  return acesso.pedido;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma consulta ao pathfinder, com o token do leitor. Tenta outra vez quando o
 * Spotify está ocupado, a ligação cai ou o token caduca. Devolve
 * `{ ok: true, dados }` ou `{ ok: false, falha }`, com a falha a ser
 * `desligado`, `rede`, `ocupado`, `mudou` ou `recusado`.
 */
async function consultar(nome, variaveis) {
  if (!Object.hasOwn(CONSULTAS, nome)) return { ok: false, falha: 'recusado' };
  let renovado = false;
  let reler = false;
  try {
    for (let n = 1; ; n++) {
      const pedido = autorizado();
      const a = await pedido;
      let r;
      try {
        r = await fetch(PATHFINDER, {
          method: 'POST',
          headers: a.cabecalhos,
          body: JSON.stringify({ variables: variaveis, operationName: nome, extensions: { persistedQuery: { version: 1, sha256Hash: a.hashes[nome] } } }),
          signal: AbortSignal.timeout(ESPERA_POR_CONSULTA_MS),
        });
      } catch {
        if (n >= 4) return { ok: false, falha: 'rede' };
        await esperar(1000 * n);
        continue;
      }
      if (r.status === 401 && !renovado) {
        renovado = true;
        if (acesso?.pedido === pedido) acesso = null;
        continue;
      }
      if ((r.status === 429 || r.status >= 500) && n < 6) {
        const depois = Number(r.headers.get('retry-after'));
        await esperar(Math.min(30, depois > 0 ? depois : 2 ** n) * 1000);
        continue;
      }
      if (r.status === 429) return { ok: false, falha: 'ocupado' };
      if (r.status === 401) return { ok: false, falha: 'desligado' };
      if (!r.ok) return { ok: false, falha: r.status >= 500 ? 'ocupado' : 'recusado' };
      const json = await r.json();
      const erro = typeof json?.errors?.[0]?.message === 'string' ? json.errors[0].message : '';
      if (/PersistedQueryNotFound/i.test(erro)) {
        // Saiu um leitor novo: um token novo traz os hashes do script novo.
        if (reler) return { ok: false, falha: 'mudou' };
        reler = true;
        if (acesso?.pedido === pedido) acesso = null;
        continue;
      }
      if (erro && /not authorized|unauthorized/i.test(erro) && json?.data?.me == null) return { ok: false, falha: 'desligado' };
      // Uma resposta só com erros (uma parcial ainda traz dados) não é uma biblioteca vazia.
      if (erro && !json?.data) return { ok: false, falha: 'recusado' };
      return { ok: true, dados: json.data };
    }
  } catch (e) {
    return { ok: false, falha: e instanceof Falha ? e.tipo : 'rede' };
  }
}

module.exports = { configurar, ligada, entrar, sair, consultar, CONSULTAS, agenteDoChrome };

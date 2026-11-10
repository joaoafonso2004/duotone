/**
 * A conta do Spotify no iPhone pelo leitor web (11/11). O mesmo método do PC
 * (`electron/contaDoSpotify.cjs`, o do ytspot), com o que o iPhone deixa fazer.
 *
 * Porquê: o login oficial (`api/spotifyConta.ts`) só aceita as cinco contas
 * acrescentadas à mão no painel do Spotify. Um utilizador: "your account may
 * need to be added to the app" -- o `sem-acesso`.
 *
 * Como:
 * - Uma WebView escondida abre o open.spotify.com (`LeitorDoSpotify.tsx`).
 * - O WKWebView não deixa espreitar os pedidos como o Electron. Por isso este
 *   script entra ANTES de a página carregar, embrulha o `fetch` e o
 *   `XMLHttpRequest`, e guarda os cabeçalhos (`authorization`, `client-token`)
 *   que o próprio leitor manda ao `api-partner.spotify.com`.
 * - As consultas correm DENTRO da página, com esses cabeçalhos, e só a
 *   resposta volta à app (`postMessage`). O token nunca sai da página.
 * - Os hashes das consultas leem-se do script do leitor, como no PC; os
 *   guardados são os de 8/11/2026.
 *
 * Sem imports: o script é texto, e `scripts/test-script-do-leitor-do-spotify.ts`
 * corre-o com um `window` falso.
 */

export const ENDERECO_DO_LEITOR = 'https://open.spotify.com/';
export const ENDERECO_DO_LOGIN = `https://accounts.spotify.com/login?continue=${encodeURIComponent(ENDERECO_DO_LEITOR)}`;

/**
 * O leitor escondido pede a página como o Safari do Mac: com o agente do
 * iPhone, o open.spotify.com pode mostrar o convite para a app em vez do leitor.
 */
export const AGENTE_DO_SAFARI_DO_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

/** Os mesmos de `electron/contaDoSpotify.cjs` (que é CommonJS e não importa isto). */
export const HASHES_GUARDADOS: Record<string, string> = {
  profileAttributes: '08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0',
  libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
};

/** O login do Google recusa WebViews ("disallowed_useragent"): diz-se o que fazer em vez de o abrir. */
export const doGoogle = (url: string | null | undefined) => /^https:\/\/accounts\.google\.[a-z.]+\//i.test(String(url ?? ''));

/** O login acabou: o Spotify mandou para o leitor. */
export const chegouAoLeitor = (url: string | null | undefined) => /^https:\/\/open\.spotify\.com(\/|$)/i.test(String(url ?? ''));

/** O que a página manda à app. */
export type MensagemDoLeitor =
  | { tipo: 'pronto' }
  | { tipo: 'resposta'; id: number; ok: true; dados: unknown }
  | { tipo: 'resposta'; id: number; ok: false; falha: 'desligado' | 'rede' | 'ocupado' | 'mudou' | 'recusado' };

/** Lê uma mensagem da página; `null` para o que não é nosso. */
export function lerMensagem(texto: string): MensagemDoLeitor | null {
  try {
    const m = JSON.parse(texto);
    if (m?.tipo === 'pronto') return { tipo: 'pronto' };
    if (m?.tipo === 'resposta' && typeof m.id === 'number') {
      return m.ok ? { tipo: 'resposta', id: m.id, ok: true, dados: m.dados } : { tipo: 'resposta', id: m.id, ok: false, falha: m.falha ?? 'rede' };
    }
  } catch {
    // Outra mensagem qualquer da página.
  }
  return null;
}

/** A chamada que a app injeta para uma consulta. */
export function chamadaDaConsulta(id: number, nome: string, variaveis: Record<string, unknown>): string {
  return `window.__duotoneSpotify && window.__duotoneSpotify.consultar(${id}, ${JSON.stringify(nome)}, ${JSON.stringify(variaveis)}, ${JSON.stringify(HASHES_GUARDADOS[nome] ?? '')}); true;`;
}

/**
 * O script que entra antes de a página carregar. ES5 de propósito: corre no
 * motor da página, e não passa pelo Babel da app.
 */
export const SCRIPT_DO_LEITOR = `(function () {
  if (window.__duotoneSpotify) return;
  var PARCEIRO = 'api-partner.spotify.com';
  var CONSULTAS = ['profileAttributes', 'libraryV3', 'fetchLibraryTracks', 'fetchPlaylist'];
  var DO_LEITOR = /\\/web-player\\/web-player\\.[0-9a-f]+\\.js(\\?.*)?$/;
  var cabecalhos = null;
  var hashes = null;
  var fetchOriginal = window.fetch;

  function enviar(m) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {}
  }
  function guardar(h) {
    if (!h || !h.authorization || !h['client-token']) return;
    var primeira = !cabecalhos;
    cabecalhos = {
      'authorization': h.authorization,
      'client-token': h['client-token'],
      'spotify-app-version': h['spotify-app-version'] || '',
      'app-platform': h['app-platform'] || 'WebPlayer'
    };
    if (primeira) enviar({ tipo: 'pronto' });
  }
  function emMinusculas(hs) {
    var h = {};
    if (!hs) return h;
    if (typeof hs.forEach === 'function') { hs.forEach(function (v, k) { h[String(k).toLowerCase()] = v; }); return h; }
    for (var k in hs) { if (Object.prototype.hasOwnProperty.call(hs, k)) h[String(k).toLowerCase()] = hs[k]; }
    return h;
  }

  window.fetch = function (entrada, opcoes) {
    try {
      var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
      if (String(url).indexOf(PARCEIRO) >= 0) {
        guardar(emMinusculas((opcoes && opcoes.headers) || (entrada && entrada.headers)));
      }
    } catch (e) {}
    return fetchOriginal.apply(this, arguments);
  };

  var abrir = XMLHttpRequest.prototype.open;
  var por = XMLHttpRequest.prototype.setRequestHeader;
  var mandar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__duotoneUrl = String(url || '');
    this.__duotoneCabecalhos = {};
    return abrir.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (this.__duotoneCabecalhos) this.__duotoneCabecalhos[String(k).toLowerCase()] = v; } catch (e) {}
    return por.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try { if (this.__duotoneUrl && this.__duotoneUrl.indexOf(PARCEIRO) >= 0) guardar(this.__duotoneCabecalhos); } catch (e) {}
    return mandar.apply(this, arguments);
  };

  function scriptDoLeitor() {
    var i, s = document.scripts || [];
    for (i = 0; i < s.length; i++) if (DO_LEITOR.test(s[i].src || '')) return s[i].src;
    var r = (window.performance && performance.getEntriesByType) ? performance.getEntriesByType('resource') : [];
    for (i = 0; i < r.length; i++) if (DO_LEITOR.test(r[i].name || '')) return r[i].name;
    return null;
  }
  function lerHashes() {
    if (hashes) return Promise.resolve(hashes);
    var url = scriptDoLeitor();
    if (!url) return Promise.resolve({});
    return fetchOriginal(url).then(function (r) { return r.text(); }).then(function (js) {
      var h = {};
      for (var i = 0; i < CONSULTAS.length; i++) {
        var m = js.match(new RegExp('"' + CONSULTAS[i] + '","query","([0-9a-f]{64})"'));
        if (m) h[CONSULTAS[i]] = m[1];
      }
      hashes = h;
      return h;
    }, function () { return {}; });
  }

  window.__duotoneSpotify = {
    consultar: function (id, nome, variaveis, guardado) {
      if (!cabecalhos) { enviar({ tipo: 'resposta', id: id, ok: false, falha: 'desligado' }); return; }
      lerHashes().then(function (h) {
        var cab = { 'content-type': 'application/json;charset=UTF-8', 'accept': 'application/json' };
        for (var k in cabecalhos) cab[k] = cabecalhos[k];
        return fetchOriginal('https://' + PARCEIRO + '/pathfinder/v2/query', {
          method: 'POST',
          headers: cab,
          body: JSON.stringify({ variables: variaveis, operationName: nome, extensions: { persistedQuery: { version: 1, sha256Hash: h[nome] || guardado } } })
        });
      }).then(function (r) {
        if (r.status === 401) return { falha: 'desligado' };
        if (r.status === 429 || r.status >= 500) return { falha: 'ocupado' };
        if (!r.ok) return { falha: 'recusado' };
        return r.json().then(function (j) {
          var erro = (j && j.errors && j.errors[0] && j.errors[0].message) || '';
          if (/PersistedQueryNotFound/i.test(erro)) { hashes = null; return { falha: 'mudou' }; }
          if (erro && /not authorized|unauthorized/i.test(erro) && (!j.data || j.data.me == null)) return { falha: 'desligado' };
          if (erro && !j.data) return { falha: 'recusado' };
          return { dados: j.data };
        });
      }).then(function (x) {
        enviar(x.falha ? { tipo: 'resposta', id: id, ok: false, falha: x.falha } : { tipo: 'resposta', id: id, ok: true, dados: x.dados });
      }, function () {
        enviar({ tipo: 'resposta', id: id, ok: false, falha: 'rede' });
      });
    }
  };
})();
true;`;

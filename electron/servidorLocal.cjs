'use strict';
/**
 * O que o servidor local (http://localhost:18081) responde a cada pedido da
 * janela. Quem abre as portas (os dois loopbacks) continua a ser o main.cjs;
 * aqui fica só o "que ficheiro, com que cabeçalhos", sem `require('electron')`,
 * para se testar com um servidor a sério (scripts/test-servidor-local.mjs).
 *
 * ## A cache (21/11)
 *
 * Até aqui as respostas levavam só o `Content-Type`. Sem validadores, o
 * Chromium não podia reaproveitar nada: medido num Electron à parte, em seis
 * arranques seguidos com o mesmo perfil o bundle de 3,1 MB vinha SEMPRE inteiro
 * (200) e a cache do código compilado do V8 nunca se usava. Ela só sobrevive a
 * uma resposta 304 ou a uma leitura da cache HTTP; uma resposta 200 apaga-a.
 *
 * - Os ficheiros com o hash do conteúdo no nome (o bundle do Expo, as fontes, as
 *   imagens) nunca mudam: `immutable`, um ano. Numa versão nova o hash muda, e o
 *   index.html passa a pedir outro nome.
 * - O resto (o index.html, o favicon, o metadata.json) volta a perguntar em
 *   cada arranque (`no-cache`) e recebe 304 quando não mudou. É o index.html
 *   que diz que bundle carregar, por isso nunca pode ficar preso numa versão.
 * - O ETag é o SHA-1 do conteúdo, calculado uma vez por ficheiro: os ficheiros
 *   vivem dentro do asar e não mudam enquanto a app está aberta.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
};
const PARA_SEMPRE = 'public, max-age=31536000, immutable';
const PERGUNTAR_SEMPRE = 'no-cache';

function resolverFicheiroLocal(reqUrl, webRoot) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((reqUrl || '/').split('?')[0]);
  } catch {
    return { status: 400 };
  }
  const safeUrlPath = (urlPath === '/' ? '/index.html' : urlPath).replace(/^[/\\]+/, '');
  const filePath = path.resolve(webRoot, safeUrlPath);
  const relative = path.relative(webRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { status: 403 };
  return { status: 200, filePath };
}

/** `index-7b00...ca.js`, `archivo-latin.cd56...24.woff2`: 32 hexadecimais antes da extensão. */
function temHashNoNome(caminho) {
  return /[.-][0-9a-f]{32}\.[a-z0-9]+$/i.test(String(caminho));
}

function etagDe(dados) {
  return `"${crypto.createHash('sha1').update(dados).digest('base64url')}"`;
}

/**
 * O `If-None-Match` do pedido aceita o ETag que temos? Pode ser `*` ou uma
 * lista, e a comparação é a fraca (RFC 9110, 13.1.2): `W/"x"` vale `"x"`.
 */
function naoMudou(ifNoneMatch, etag) {
  if (typeof ifNoneMatch !== 'string' || !ifNoneMatch.trim() || !etag) return false;
  const semW = (t) => t.trim().replace(/^W\//, '');
  const alvo = semW(etag);
  return ifNoneMatch.split(',').some((t) => t.trim() === '*' || semW(t) === alvo);
}

/** O tratador de pedidos para `http.createServer`, a servir `webRoot`. */
function servirFicheiros(webRoot, { ler = fs.readFile } = {}) {
  const etags = new Map();
  const responder = (req, res, filePath, dados) => {
    let etag = etags.get(filePath);
    if (!etag) {
      etag = etagDe(dados);
      etags.set(filePath, etag);
    }
    const cabecalhos = { ETag: etag, 'Cache-Control': temHashNoNome(filePath) ? PARA_SEMPRE : PERGUNTAR_SEMPRE };
    if (naoMudou(req.headers['if-none-match'], etag)) {
      res.writeHead(304, cabecalhos);
      res.end();
      return;
    }
    const tipo = TIPOS[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': tipo, ...cabecalhos });
    res.end(dados);
  };
  return (req, res) => {
    const resolved = resolverFicheiroLocal(req.url, webRoot);
    if (resolved.status !== 200) {
      res.statusCode = resolved.status;
      res.end(resolved.status === 400 ? 'Bad Request' : 'Forbidden');
      return;
    }
    ler(resolved.filePath, (err, data) => {
      if (!err) {
        responder(req, res, resolved.filePath, data);
        return;
      }
      // Um caminho que não existe é uma rota da app: volta o index.html.
      const indice = path.resolve(webRoot, 'index.html');
      ler(indice, (err2, data2) => {
        if (err2) {
          res.statusCode = 404;
          res.end('Not Found');
        } else {
          responder(req, res, indice, data2);
        }
      });
    });
  };
}

module.exports = { resolverFicheiroLocal, servirFicheiros, temHashNoNome, naoMudou, etagDe, PARA_SEMPRE, PERGUNTAR_SEMPRE };

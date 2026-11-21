// O servidor local do Windows (electron/servidorLocal.cjs), com um servidor
// http a sério numa porta livre e uma pasta como a do `expo export`.
//
// O que se prova (21/11): os ficheiros com hash no nome ficam na cache um ano
// (`immutable`); o resto pergunta sempre e recebe 304 quando não mudou; o
// caminho que não existe continua a dar o index.html; e as defesas de antes
// (400 e 403) ficam. Sem isto o bundle de 3,1 MB vinha inteiro a cada arranque
// e a cache do código compilado do V8 nunca se usava.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { servirFicheiros, temHashNoNome, naoMudou, etagDe, PARA_SEMPRE, PERGUNTAR_SEMPRE } = require('../electron/servidorLocal.cjs');

// --- as peças puras ---
assert.equal(temHashNoNome('/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js'), true);
assert.equal(temHashNoNome('C:\\app\\dist-web\\assets\\fonts\\archivo-latin.cd56e2ec63d7a63df092f824f981253c.woff2'), true);
assert.equal(temHashNoNome('/index.html'), false);
assert.equal(temHashNoNome('/favicon.ico'), false);
assert.equal(temHashNoNome('/metadata.json'), false);
assert.equal(temHashNoNome('/assets/logo-7b007d07.png'), false, 'um hash curto não conta');

const etag = etagDe(Buffer.from('ola'));
assert.match(etag, /^"[A-Za-z0-9_-]+"$/);
assert.notEqual(etagDe(Buffer.from('ola')), etagDe(Buffer.from('olá')), 'conteúdo diferente, ETag diferente');
assert.equal(naoMudou(etag, etag), true);
assert.equal(naoMudou(`W/${etag}`, etag), true, 'a comparação do If-None-Match é a fraca');
assert.equal(naoMudou(`"outro", ${etag}`, etag), true, 'uma lista');
assert.equal(naoMudou('*', etag), true);
assert.equal(naoMudou('"outro"', etag), false);
assert.equal(naoMudou('', etag), false);
assert.equal(naoMudou(undefined, etag), false);

// --- um servidor a sério ---
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'duotone-servidor-'));
const BUNDLE = '/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js';
fs.mkdirSync(path.join(raiz, '_expo/static/js/web'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'index.html'), `<!doctype html><script src="${BUNDLE}" defer></script>`);
fs.writeFileSync(path.join(raiz, BUNDLE), 'console.log("duotone")');
fs.writeFileSync(path.join(raiz, 'metadata.json'), '{}');
fs.writeFileSync(path.join(os.tmpdir(), 'duotone-segredo.txt'), 'nao');

let leituras = 0;
const servidor = http.createServer(servirFicheiros(raiz, {
  ler: (f, cb) => { leituras++; fs.readFile(f, cb); },
}));
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const porta = servidor.address().port;
const pedir = (caminho, cabecalhos = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: porta, path: caminho, headers: cabecalhos }, (res) => {
    const partes = [];
    res.on('data', (p) => partes.push(p));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes).toString('utf8') }));
  }).on('error', reject);
});

try {
  const indice = await pedir('/');
  assert.equal(indice.status, 200);
  assert.equal(indice.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(indice.headers['cache-control'], PERGUNTAR_SEMPRE, 'o index.html diz que bundle carregar: pergunta sempre');
  assert.ok(indice.headers.etag);
  assert.match(indice.corpo, /index-7b00/);

  const indiceIgual = await pedir('/index.html', { 'If-None-Match': indice.headers.etag });
  assert.equal(indiceIgual.status, 304, 'sem mudanças, 304');
  assert.equal(indiceIgual.corpo, '', 'um 304 não leva corpo');
  assert.equal(indiceIgual.headers.etag, indice.headers.etag);
  assert.equal(indiceIgual.headers['cache-control'], PERGUNTAR_SEMPRE);

  const bundle = await pedir(BUNDLE);
  assert.equal(bundle.status, 200);
  assert.equal(bundle.headers['content-type'], 'application/javascript; charset=utf-8');
  assert.equal(bundle.headers['cache-control'], PARA_SEMPRE, 'com o hash no nome, um ano');
  assert.equal(bundle.corpo, 'console.log("duotone")');
  assert.notEqual(bundle.headers.etag, indice.headers.etag);
  assert.equal((await pedir(BUNDLE, { 'If-None-Match': `W/${bundle.headers.etag}` })).status, 304);
  assert.equal((await pedir(BUNDLE, { 'If-None-Match': '"velho"' })).status, 200, 'outro ETag recebe o ficheiro');

  const meta = await pedir('/metadata.json');
  assert.equal(meta.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(meta.headers['cache-control'], PERGUNTAR_SEMPRE);

  // Uma rota da app (ou um bundle que já não existe) dá o index.html, com o ETag dele.
  const rota = await pedir('/settings?x=1');
  assert.equal(rota.status, 200);
  assert.equal(rota.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(rota.headers.etag, indice.headers.etag);
  assert.equal(rota.headers['cache-control'], PERGUNTAR_SEMPRE, 'nunca fica um ano com o index.html');
  const bundleVelho = await pedir('/_expo/static/js/web/index-00000000000000000000000000000000.js');
  assert.equal(bundleVelho.headers['cache-control'], PERGUNTAR_SEMPRE, 'um nome com hash que não existe não leva o index.html para a cache um ano');
  assert.equal((await pedir('/settings', { 'If-None-Match': indice.headers.etag })).status, 304);

  // As defesas de antes.
  assert.equal((await pedir('/%E0%A4%A')).status, 400, 'URL malformada');
  assert.equal((await pedir('/..%5Cduotone-segredo.txt')).status, 403, 'não sai da pasta');
  assert.equal((await pedir('/../duotone-segredo.txt')).corpo.includes('nao'), false);

  assert.ok(leituras > 0);
  console.log('Servidor local do Windows: hash no nome um ano, o resto com ETag e 304, rotas no index.html, 400/403 como antes.');
} finally {
  servidor.close();
  fs.rmSync(raiz, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), 'duotone-segredo.txt'), { force: true });
}

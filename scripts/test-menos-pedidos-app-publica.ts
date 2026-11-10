/**
 * Menos pedidos ao Supabase com a app pública (10/11). Com ~6,5 mil pedidos por
 * hora, os logs do plano grátis (1 GB) acabavam o mês no teto. Os cortes são
 * pedidos repetidos, nunca funcionalidades:
 *   - os artistas mais ouvidos ficam 10 min em memória, por conta;
 *   - a chave antiga das playlists (`playlist:v2:`) já não se pede: era sempre falha;
 *   - os favoritos só se releem quando o aviso do Realtime diz que ELES mudaram;
 *   - as preferências sobem uma vez quando o iPhone bloqueia (eram duas).
 *
 * Os artistas mais ouvidos correm a sério, com o Supabase falso a contar.
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-menos-pedidos-app-publica.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('\nos artistas mais ouvidos');
const plays = ler('src/api/plays.ts');
await caso('ficam 10 minutos em memória, por conta e por tamanho', () => {
  assert.match(plays, /const TOP_VALE_MS = 10 \* 60 \* 1000;/);
  assert.match(plays, /const chave = `\$\{conta\}:\$\{limit\}`;/);
  assert.match(plays, /if \(guardado && Date\.now\(\) - guardado\.em < TOP_VALE_MS\) return guardado\.pedido;/);
});
await caso('sem conta lida não se guarda nada, e uma leitura falhada não fica', () => {
  assert.match(plays, /if \(!conta\) return lerTopArtists\(limit\);/);
  assert.match(plays, /if \(!lista\.length && topEmMemoria\.get\(chave\)\?\.pedido === pedido\) topEmMemoria\.delete\(chave\);/);
});
await caso('o pedido em si é o de sempre', () => {
  assert.match(plays, /async function lerTopArtists\(limit: number\): Promise<TopArtist\[\]> \{\n\s+try \{\n\s+const \{ data, error \} = await supabase\.rpc\('get_top_artists', \{ limit_val: limit \}\);/);
});

console.log('\nas playlists e os álbuns');
await caso('só a chave de agora: a antiga era sempre um pedido sem resposta', () => {
  const yt = ler('src/api/youtube.ts');
  assert.doesNotMatch(yt, /cacheGet<[^>]+>\(`playlist:v2:/);
  assert.match(yt, /const cached = await cacheGet<YtPlaylistImport>\(key, PLAYLIST_TTL, \{ memoria: true \}\);/);
});

console.log('\nas preferências da conta');
await caso('os favoritos só se releem quando o aviso diz que mudaram', () => {
  const fav = ler('src/state/artistasFavoritos.ts');
  assert.match(fav, /const novas = aviso\?\.new\?\.prefs;/);
  assert.match(fav, /if \(iguais\) return;\n\s+\}\n\s+reler\(true\);/, 'sem a linha no aviso, relê como antes');
  assert.match(fav, /const iguais = aqui\.estado === 'saved'/, 'com uma edição por enviar, relê sempre');
});
await caso('um envio de cada vez: bloquear o iPhone já não manda dois', () => {
  const p = ler('src/lib/prefsSync.ts');
  assert.match(p, /aEnviar \?\?= enviarAgora\(\)\.finally\(\(\) => \{ aEnviar = null; \}\);/);
  assert.match(p, /if \(retrato === ultimoEnviado \|\| retrato === '\{\}'\) return;/, 'e continua a não mandar o que não mudou');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

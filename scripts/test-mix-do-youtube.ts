// Importar um Mix do YouTube (lib/mixDoYouTube.ts, 28/9), contra uma resposta
// real do `next` do InnerTube guardada em scripts/fixtures/youtube-mix-next.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eMix, lerMixDaResposta, MIX_ATE, novasDaVolta } from '../src/lib/mixDoYouTube.ts';

const resposta = JSON.parse(readFileSync(new URL('./fixtures/youtube-mix-next.json', import.meta.url), 'utf8'));

assert.equal(eMix('RDdQw4w9WgXcQ'), true, 'o Mix de um vídeo');
assert.equal(eMix('RDMM'), true, 'o My Mix');
assert.equal(eMix('RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs'), true, 'as listas do YouTube Music');
assert.equal(eMix('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'), false, 'uma playlist a sério vai pela API de sempre');
assert.equal(eMix('RD'), false);
assert.equal(eMix('RD"><script>'), false, 'só a forma de um id');
assert.equal(eMix(null), false);

const mix = lerMixDaResposta(resposta);
assert.ok(mix, 'a resposta real traz um Mix');
assert.match(mix!.titulo, /^Mix - Rick Astley/);
assert.equal(mix!.itens.length, 4, 'as quatro músicas; a entrada do automix fica de fora');
assert.deepEqual(mix!.itens[0], {
  videoId: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
  channel: 'Rick Astley',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
});
assert.ok(mix!.itens.every((i) => i.channel && !i.thumbnail!.includes('?')), 'artista em todas, e miniaturas sem parâmetros assinados');

const repetida = structuredClone(resposta);
const lista = repetida.contents.twoColumnWatchNextResults.playlist.playlist.contents;
lista.push(structuredClone(lista[0]));
assert.equal(lerMixDaResposta(repetida)!.itens.length, 4, 'a mesma música duas vezes entra uma');

assert.equal(lerMixDaResposta({}), null, 'uma resposta sem Mix não inventa nada');
assert.equal(lerMixDaResposta(null), null);

// As voltas seguintes (29/9): só entram as que ainda não estão na lista.
const primeiras = mix!.itens.slice(0, 2);
assert.deepEqual(novasDaVolta(primeiras, resposta).map((i) => i.videoId), mix!.itens.slice(2).map((i) => i.videoId));
assert.deepEqual(novasDaVolta(mix!.itens, resposta), [], 'uma volta sem nada novo é o sinal para parar');
assert.deepEqual(novasDaVolta(primeiras, {}), [], 'uma volta que não se leu não inventa nada');
assert.ok(MIX_ATE.musicas >= 50 && MIX_ATE.musicas <= 200 && MIX_ATE.pedidos <= 8, 'um Mix não acaba: há teto');
const api = readFileSync(new URL('../src/api/youtubeMix.ts', import.meta.url), 'utf8');
assert.match(api, /novasDaVolta\(itens, await pedirVolta\(idDaLista, itens\[itens\.length - 1\]!\.videoId\)\)/,
  'a volta seguinte pede-se a partir da última música');
assert.match(readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8'),
  /if \(videoId && !\/\^\[\\w-\]\{11\}\$\/\.test\(videoId\)\) throw/, 'no PC, só um id de vídeo passa');

console.log('Mix do YouTube: passou.');

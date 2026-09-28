// Importar um Mix do YouTube (lib/mixDoYouTube.ts, 28/9), contra uma resposta
// real do `next` do InnerTube guardada em scripts/fixtures/youtube-mix-next.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eMix, lerMixDaResposta } from '../src/lib/mixDoYouTube.ts';

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

console.log('Mix do YouTube: passou.');

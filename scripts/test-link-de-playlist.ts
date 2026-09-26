// Uma playlist trazida por link (lib/linkDePlaylist.ts). O embed de exemplo é
// um recorte da página real do Spotify de 26/9 (scripts/fixtures).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerEmbedDoSpotify, lerLink } from '../src/lib/linkDePlaylist.ts';

let falhas = 0;
const caso = (nome: string, fn: () => void) => {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
};

const ID = '37i9dQZF1DXcBWIGoYBM5M';
caso('links do Spotify, como a app e a web os copiam', () => {
  for (const l of [
    `https://open.spotify.com/playlist/${ID}`,
    `https://open.spotify.com/playlist/${ID}?si=abc123`,
    `https://open.spotify.com/intl-pt/playlist/${ID}?si=x`,
    `https://open.spotify.com/embed/playlist/${ID}`,
    `spotify:playlist:${ID}`,
    `  ${ID}  `.replace(ID, `https://open.spotify.com/playlist/${ID}`),
  ]) assert.deepEqual(lerLink(l), { tipo: 'spotify', id: ID }, l);
});
caso('links do YouTube e do YouTube Music', () => {
  assert.deepEqual(lerLink('https://www.youtube.com/playlist?list=PLabcdefghij123'), { tipo: 'youtube', id: 'PLabcdefghij123' });
  assert.deepEqual(lerLink('https://music.youtube.com/playlist?list=PLabcdefghij123&si=x'), { tipo: 'youtube', id: 'PLabcdefghij123' });
  assert.deepEqual(lerLink('https://youtube.com/watch?v=abc&list=PLabcdefghij123'), { tipo: 'youtube', id: 'PLabcdefghij123' });
});
caso('o resto não é playlist', () => {
  assert.equal(lerLink(''), null);
  assert.equal(lerLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), null);
  assert.equal(lerLink('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC'), null);
  assert.equal(lerLink('olá'), null);
  assert.equal(lerLink('https://example.com/?list=PLabcdefghij123'), null);
});

const html = readFileSync(new URL('./fixtures/spotify-embed.html', import.meta.url), 'utf8');
caso('o embed dá o nome, a capa e as faixas', () => {
  const p = lerEmbedDoSpotify(html)!;
  assert.equal(p.nome, 'Today’s Top Hits');
  assert.match(p.capa ?? '', /^https:\/\/i\.scdn\.co\//);
  assert.equal(p.faixas.length, 3, 'a sem título e o episódio ficam de fora');
  assert.deepEqual(p.faixas[0], { title: 'Nicole Kidman', artist: 'ADÉLA', album: null, durationMs: 181270, uri: 'spotify:track:70cHKK8bHAfJrOGVnfRG9J' });
  assert.equal(p.faixas[2].artist, 'KAROL G, Judeline, rusowsky');
});
caso('uma página que mudou ou uma playlist privada não se finge lida', () => {
  assert.equal(lerEmbedDoSpotify('<html>nada</html>'), null);
  assert.equal(lerEmbedDoSpotify('<script id="__NEXT_DATA__">{partido</script>'), null);
  assert.equal(lerEmbedDoSpotify('<script id="__NEXT_DATA__">{"props":{"pageProps":{"state":{"data":{"entity":{"name":"x"}}}}}}</script>'), null);
});

console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  Link de playlist: todos os casos passaram.');
process.exit(falhas ? 1 : 0);

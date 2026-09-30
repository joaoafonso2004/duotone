// A importação de uma playlist do YouTube lê até 5000 vídeos (28/9): eram 200,
// e o resto ficava de fora sem aviso. As duas leituras usam o mesmo teto, e a
// cache mudou de chave para uma playlist lida com o teto antigo não vir cortada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yt = readFileSync(new URL('../src/api/youtube.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

assert.match(yt, /const PAGINAS_DE_PLAYLIST = 100;/, 'o teto são 100 páginas de 50');
// Uma leitura só (29/9): o link passa pelo id, com a mesma cache e as mesmas regras.
assert.equal((yt.match(/for \(let page = 0; page < PAGINAS_DE_PLAYLIST; page\+\+\)/g) ?? []).length, 1,
  'uma leitura só, e com o teto');
assert.match(yt, /export async function fetchYouTubePlaylist\([\s\S]{0,300}return fetchYouTubePlaylistById\(id\);/,
  'o link usa a leitura do id');
// Uma página sem vídeos novos acaba a leitura: há listas que a API devolve às voltas.
assert.match(yt, /if \(!pageToken \|\| !novos\) break;/);
assert.ok(!/page < 4;/.test(yt), 'voltou o teto das 200');
assert.ok(!yt.includes('`playlist:v1:'), 'a cache antiga (cortada nas 200) voltaria a servir');

// Um Mix (`RD...`) não é uma playlist para a API (404): vai para o leitor do
// InnerTube (28/9, lib/mixDoYouTube.ts). As editoriais (`RDCLAK5uy_`) leem-se
// pelo YouTube Music, com chave de cache própria (29/9).
assert.equal((yt.match(/if \(eMix\(id\)\) \{/g) ?? []).length, 1, 'a leitura reconhece um Mix');
assert.match(yt, /const editorial = id\.startsWith\('RDCLAK5uy_'\);/);
// Todas pelo YouTube Music primeiro (30/9, grátis); a Data API só quando ele
// falha ou não chega ao fim de uma lista de pessoas.
assert.match(yt, /const key = `playlist:ytm:v1:\$\{id\}`;/);
assert.match(yt, /const lida = await lerPlaylistPeloYtMusic\(id\);\n\s+if \(lida\?\.itens\.length && \(lida\.completa \|\| editorial\)\) \{/);

console.log('Importar playlist do YouTube: passou.');

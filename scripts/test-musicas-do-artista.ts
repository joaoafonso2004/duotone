/**
 * A página de um artista com uma lista só, "Songs" (src/lib/musicasDoArtista.ts,
 * 20/10): as tuas primeiro e marcadas, depois as outras dele, e o cabeçalho sem
 * "0 songs". E o álbum da biblioteca sem "Album · 0 songs".
 *
 * Correr: node --experimental-strip-types scripts/test-musicas-do-artista.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metaDoAlbum, metaDoArtista, musicasDoArtista } from '../src/lib/musicasDoArtista.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const t = (id: string) => ({ source: 'youtube', sourceId: id });

console.log('\nas regras');
caso('as tuas primeiro, pela ordem delas, e depois as dele', () => {
  const lista = musicasDoArtista([t('b'), t('a')], [t('z'), t('y')]);
  assert.deepEqual(lista.map((x) => x.sourceId), ['b', 'a', 'z', 'y']);
});
caso('uma que é tua e também está nas dele aparece uma vez, no sítio das tuas', () => {
  const lista = musicasDoArtista([t('a')], [t('z'), t('a'), t('a')]);
  assert.deepEqual(lista.map((x) => x.sourceId), ['a', 'z']);
});
caso('o cabeçalho só diz quantas são tuas, e só quando se sabe e são', () => {
  assert.equal(metaDoArtista(0, false), null, 'nada de "0 songs"');
  assert.equal(metaDoArtista(5, true), null, 'ainda a ler a biblioteca');
  assert.equal(metaDoArtista(1, false), '1 song in your library');
  assert.equal(metaDoArtista(12, false), '12 songs in your library');
});
caso('o álbum diz "Album" até haver músicas, e o singular conta', () => {
  assert.equal(metaDoAlbum(0, false), 'Album');
  assert.equal(metaDoAlbum(7, true), 'Album');
  assert.equal(metaDoAlbum(1, false), 'Album · 1 song');
  assert.equal(metaDoAlbum(9, false), 'Album · 9 songs');
});

console.log('\nligado nas duas páginas');
const iphone = ler('src/screens/LibraryGroupScreen.tsx');
const pc = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
caso('dois separadores, "Songs" e "Albums", nos dois lados', () => {
  assert.match(iphone, /\['songs', 'Songs'\], \['albums', 'Albums'\]/);
  assert.match(pc, /\['songs', 'Songs', 'musical-notes-outline'\],\n\s+\['albums', 'Albums', 'albums-outline'\]/);
  for (const [nome, s] of [['iPhone', iphone], ['PC', pc]] as const) {
    assert.doesNotMatch(s, /'In your library', 'heart|\['library', 'In your library'\]|More songs'|More tracks'/, `${nome}: separador antigo`);
  }
});
caso('a lista é a das tuas mais as dele, e as dele só quando a fonte certa responde', () => {
  assert.match(iphone, /musicasDoArtista\(tracksDaAba, aCarregarOutras \? \[\] : otherTracks\)/);
  assert.match(pc, /musicasDoArtista\(guardadasPorOrdem, aProcurarMusicas \? \[\] : outrasPorOrdem\)/);
  assert.match(iphone, /showSavedBadge=\{type === 'artist'\}/, 'iPhone: as tuas marcadas');
  assert.match(pc, /<TrackTable plain colunaDoArtista=\{false\} showSavedBadge tracks=\{musicas\}/, 'PC: as tuas marcadas');
});
caso('nenhum cabeçalho diz "0 songs" ou "0 saved tracks"', () => {
  assert.match(iphone, /meta=\{metaDoArtista\(tracks\.length, loading\)\}/);
  assert.match(iphone, /subtitle=\{type === 'album' \? metaDoAlbum\(tracks\.length, loading\) : undefined\}/);
  assert.match(pc, /metaDoArtista\(tracks\.length, data\.loading\)/);
  assert.doesNotMatch(pc, /saved \{tracks\.length === 1 \? 'track' : 'tracks'\}/);
  assert.doesNotMatch(iphone, /`Album · \$\{tracks\.length\} songs`/);
  assert.match(ler('src/components/CabecalhoDaPlaylist.tsx'), /\{meta === null \? null : <Text style=\{styles\.meta\}>/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

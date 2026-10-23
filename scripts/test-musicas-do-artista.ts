/**
 * A página de um artista com uma lista só, "Songs" (src/lib/musicasDoArtista.ts,
 * 20/10): as tuas primeiro e marcadas, depois as outras dele, e o cabeçalho sem
 * "0 songs". E o álbum da biblioteca sem "Album · 0 songs". Depois a variante A
 * de docs/artista-maquete.html: uma página por secções, com os fãs, as músicas
 * à vista e "See all songs", a discografia partida e os "Fans also like".
 *
 * Correr: node --experimental-strip-types scripts/test-musicas-do-artista.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  discografia, fasDoArtista, legendaDoDisco, metaDoAlbum, metaDoArtista, musicasAVista, musicasDoArtista,
  MUSICAS_A_VISTA, parecidosAVista,
} from '../src/lib/musicasDoArtista.ts';

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
caso('os fãs leem-se curtos, e juntam-se às tuas por baixo do nome', () => {
  assert.equal(fasDoArtista(5_100_000), '5.1M fans');
  assert.equal(fasDoArtista(2_000_000), '2M fans');
  assert.equal(fasDoArtista(820_400), '820K fans');
  assert.equal(fasDoArtista(1_540), '1.5K fans');
  assert.equal(fasDoArtista(940), '940 fans');
  for (const nada of [0, -3, null, undefined, NaN]) assert.equal(fasDoArtista(nada), null, String(nada));
  assert.equal(metaDoArtista(3, false, 5_100_000), '5.1M fans · 3 songs in your library');
  assert.equal(metaDoArtista(0, false, 5_100_000), '5.1M fans', 'sem "0 songs" mesmo com fãs');
  assert.equal(metaDoArtista(3, true, 940), '940 fans', 'a ler a biblioteca: só os fãs');
});
caso('cinco à vista, e todas depois de "See all songs"', () => {
  const lista = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(MUSICAS_A_VISTA, 5);
  assert.deepEqual(musicasAVista(lista, false), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(musicasAVista(lista, true), lista);
  assert.deepEqual(musicasAVista(lista, false, 10), lista, 'o PC mostra dez');
  assert.notEqual(musicasAVista(lista, true), lista, 'uma cópia, não a mesma lista');
});
caso('a discografia: álbuns de um lado, singles e EPs do outro, cada um pela ordem', () => {
  const d = (id: string, tipo: string, ano: string | null = null) => ({ id, tipo, ano });
  const { albuns, singles } = discografia([d('a', 'Album', '2024'), d('s', 'Single', '2023'), d('e', ' EP '), d('b', ''), d('m', 'Mixtape')]);
  assert.deepEqual(albuns.map((x) => x.id), ['a', 'b', 'm'], 'o que não diz Single nem EP conta como álbum');
  assert.deepEqual(singles.map((x) => x.id), ['s', 'e']);
  assert.equal(legendaDoDisco(d('a', 'Album', '2024')), '2024 · Album');
  assert.equal(legendaDoDisco(d('s', 'Single')), 'Single', 'sem ano, só o tipo');
  assert.equal(legendaDoDisco(d('b', '  ', '2020')), '2020 · Album', 'sem tipo, "Album"');
});
caso('"Fans also like": sem o próprio, sem repetidos nem vazios, e no máximo seis', () => {
  const chave = (n: string) => n.trim().toLowerCase();
  const nomes = ['Isak', 'Bon Iver', 'bon iver', '', 'Sufjan', 'A', 'B', 'C', 'D', 'E'].map((nome) => ({ nome }));
  assert.deepEqual(parecidosAVista(nomes, 'ISAK', chave), ['Bon Iver', 'Sufjan', 'A', 'B', 'C', 'D']);
  assert.deepEqual(parecidosAVista(nomes, 'Isak', chave, 2), ['Bon Iver', 'Sufjan']);
  assert.deepEqual(parecidosAVista([], 'Isak', chave), []);
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
caso('uma página por secções, sem separadores, nos dois lados', () => {
  assert.match(iphone, /<CabecalhoDaSeccao titulo="Songs" direita=\{ordemDasMusicas\} \/>/);
  assert.match(iphone, /<DiscosDoArtista titulo="Albums" discos=\{discos\.albuns\}/);
  assert.match(iphone, /<DiscosDoArtista titulo="Singles & EPs" discos=\{discos\.singles\}/);
  assert.match(iphone, /<ParecidosDoArtista nomes=\{vizinhanca\.parecidos\}/);
  assert.match(pc, /<Text style=\{artistStyles\.tituloDaSeccao\}>Songs<\/Text>/);
  assert.match(pc, /<ShelfDeLancamentos titulo="Albums" itens=\{discos\.albuns\.map\(emCapa\)\}/);
  assert.match(pc, /<ShelfDeLancamentos titulo="Singles & EPs" itens=\{discos\.singles\.map\(emCapa\)\}/);
  assert.match(pc, />Fans also like<\/Text>/);
  for (const [nome, s] of [['iPhone', iphone], ['PC', pc]] as const) {
    assert.doesNotMatch(s, /'In your library', 'heart|\['library', 'In your library'\]|More songs'|More tracks'/, `${nome}: separador antigo`);
    assert.doesNotMatch(s, /\['songs', 'Songs'|\['albums', 'Albums'|setSeparador|setActiveTab/, `${nome}: os separadores Songs/Albums`);
  }
});
caso('cinco à vista no iPhone e dez no PC, com "See all songs", e o Play toca a página toda', () => {
  assert.match(iphone, /const rows = type === 'artist' \? musicasAVista\(musicas, todas\) : musicas;/);
  assert.match(iphone, /`See all \$\{musicas\.length\} songs`/);
  assert.match(pc, /tracks=\{musicasAVista\(musicas, todas, MUSICAS_A_VISTA_NO_PC\)\}/);
  assert.match(pc, /const MUSICAS_A_VISTA_NO_PC = 10;/);
  assert.match(pc, /`See all \$\{musicas\.length\} songs`/);
  assert.match(pc, /props\.tocarMusica\(t, musicas, undefined, \{ tipo: 'artista', nome: name \}\)/, 'PC: uma linha toca a página toda');
});
caso('os fãs e os parecidos pela vizinhança confirmada, e os parecidos abrem a página deles', () => {
  const hook = ler('src/hooks/useVizinhancaDoArtista.ts');
  assert.match(hook, /vizinhancaConfirmada\(nome, provas\)/, 'com as tuas como prova, e não só pelo nome');
  assert.match(hook, /if \(!pronta \|\| !nome\) return;/, 'espera pela biblioteca');
  assert.match(iphone, /useVizinhancaDoArtista\(name, tracks, type === 'artist' && !loading\)/);
  assert.match(pc, /useVizinhancaDoArtista\(name, tracks, !data\.loading\)/);
  assert.match(iphone, /navigation\.push\('LibraryGroup', \{ type: 'artist', name: n, capa: f \}\)/, 'com a foto que se tocou');
  assert.match(pc, /irPara\(\{ tipo: 'artista', nome: n \}\)/);
});
caso('a lista é a das tuas mais as dele, e as dele só quando a fonte certa responde', () => {
  assert.match(iphone, /musicasDoArtista\(tracksDaAba, aCarregarOutras \? \[\] : otherTracks\)/);
  assert.match(pc, /musicasDoArtista\(guardadasPorOrdem, aProcurarMusicas \? \[\] : outrasPorOrdem\)/);
  assert.match(iphone, /showSavedBadge=\{type === 'artist'\}/, 'iPhone: as tuas marcadas');
  assert.match(pc, /<TrackTable plain colunaDoArtista=\{false\} showSavedBadge tracks=\{musicasAVista\(/, 'PC: as tuas marcadas');
});
caso('nenhum cabeçalho diz "0 songs" ou "0 saved tracks"', () => {
  assert.match(iphone, /meta=\{metaDoArtista\(tracks\.length, loading, vizinhanca\.fas\)\}/);
  assert.match(iphone, /subtitle=\{type === 'album' \? metaDoAlbum\(tracks\.length, loading\) : undefined\}/);
  assert.match(pc, /metaDoArtista\(tracks\.length, data\.loading, vizinhanca\.fas\)/);
  assert.doesNotMatch(pc, /saved \{tracks\.length === 1 \? 'track' : 'tracks'\}/);
  assert.doesNotMatch(iphone, /`Album · \$\{tracks\.length\} songs`/);
  assert.match(ler('src/components/CabecalhoDaPlaylist.tsx'), /\{meta === null \? null : <Text style=\{styles\.meta\}>/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

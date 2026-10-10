// As músicas de um artista por "Most played" ou "Newest" (10/10).
// Correr: node --experimental-strip-types scripts/test-ordem-do-artista.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  detalheDaLinha, infoDasMusicas, infoDe, lerReproducoes, ordenarMusicasDoArtista, textoDasReproducoes,
} from '../src/lib/ordemDoArtista.ts';
import { chaveDoTitulo, lerAlbunsDoCanal, lerMusicasDoCanal } from '../src/lib/albunsDoArtista.ts';

// As reproduções, como o YouTube Music as escreve.
assert.equal(lerReproducoes('2.4B plays'), 2_400_000_000);
assert.equal(lerReproducoes('472M plays'), 472_000_000);
assert.equal(lerReproducoes('57K plays'), 57_000);
assert.equal(lerReproducoes('1,234 plays'), 1234);
assert.equal(lerReproducoes('950 views'), 950);
assert.equal(lerReproducoes('Album'), null);
assert.equal(lerReproducoes(null), null);
assert.equal(textoDasReproducoes(2_400_000_000), '2.4B plays');
assert.equal(textoDasReproducoes(472_000_000), '472M plays');
assert.equal(textoDasReproducoes(5_000_000_000), '5B plays');
assert.equal(textoDasReproducoes(57_000), '57K plays');
assert.equal(textoDasReproducoes(1), '1 play');
assert.equal(textoDasReproducoes(null), null);

// Uma resposta real do canal (a página do Isak): as reproduções e o álbum de cada uma.
const pagina = JSON.parse(readFileSync(new URL('./fixtures/ytmusic-artista-isak.json', import.meta.url), 'utf8'));
const { topo } = lerMusicasDoCanal(pagina);
assert.ok(topo.length > 0);
assert.ok(topo.every((c) => lerReproducoes(c.reproducoes) !== null), 'cada música do topo traz as reproduções');
assert.ok(topo.some((c) => c.album), 'e o álbum');
const lidos = lerAlbunsDoCanal(pagina);
const info = infoDasMusicas(topo.map((c) => ({ ...c, reproducoes: lerReproducoes(c.reproducoes) })), lidos, chaveDoTitulo);
assert.equal(Object.keys(info.porVideo).length, topo.length);

// O ano vem do álbum (ou do single com o mesmo nome).
const sinteticas = infoDasMusicas([
  { videoId: 'aaaaaaaaaaa', titulo: 'Chandelier', reproducoes: 3_900_000_000, album: '1000 Forms Of Fear (Deluxe Version)' },
  { videoId: 'bbbbbbbbbbb', titulo: 'Unstoppable', reproducoes: 2_400_000_000, album: 'This Is Acting' },
  { videoId: 'ccccccccccc', titulo: 'Hass Hass', reproducoes: 472_000_000, album: 'Hass Hass' },
  { videoId: 'ddddddddddd', titulo: 'Cheap Thrills', reproducoes: 5_000_000_000, album: 'Algo que não está no canal' },
  { videoId: 'eeeeeeeeeee', titulo: 'Rara', reproducoes: null, album: null },
], [
  { titulo: '1000 Forms Of Fear', ano: '2014' },
  { titulo: 'This Is Acting', ano: '2016' },
  { titulo: 'Hass Hass', ano: '2023' },
], chaveDoTitulo);
assert.equal(sinteticas.porVideo.aaaaaaaaaaa.ano, 2014, 'sem o "(Deluxe Version)"');
assert.equal(sinteticas.porVideo.ccccccccccc.ano, 2023, 'o single');
assert.equal(sinteticas.porVideo.ddddddddddd.ano, null, 'álbum que não se conhece');
// Uma reedição com o mesmo nome não muda o ano: a "Deluxe Version" de 2016, e
// não a "10th Anniversary Edition" de 2026 (o caso real da Sia).
const reedicao = infoDasMusicas(
  [{ videoId: 'fffffffffff', titulo: 'The Greatest', reproducoes: 1, album: 'This Is Acting (Deluxe Version)' }],
  [{ titulo: 'This Is Acting (10th Anniversary Edition)', ano: '2026' }, { titulo: 'This Is Acting', ano: '2016' }],
  chaveDoTitulo);
assert.equal(reedicao.porVideo.fffffffffff.ano, 2016);
const exata = infoDasMusicas(
  [{ videoId: 'ggggggggggg', titulo: 'X', reproducoes: 1, album: 'This Is Acting (10th Anniversary Edition)' }],
  [{ titulo: 'This Is Acting (10th Anniversary Edition)', ano: '2026' }, { titulo: 'This Is Acting', ano: '2016' }],
  chaveDoTitulo);
assert.equal(exata.porVideo.ggggggggggg.ano, 2026, 'o nome exato ganha');

// Ordenar: pelas reproduções, e pelo ano; o que não se sabe vai para o fim, pela ordem em que estava.
type F = { sourceId: string; titulo: string };
const f = (sourceId: string, titulo: string): F => ({ sourceId, titulo });
const lista = [f('eeeeeeeeeee', 'Rara'), f('bbbbbbbbbbb', 'Unstoppable'), f('aaaaaaaaaaa', 'Chandelier'), f('ccccccccccc', 'Hass Hass'), f('ddddddddddd', 'Cheap Thrills')];
const de = (t: F) => infoDe(sinteticas, t.sourceId, t.titulo, chaveDoTitulo);
assert.deepEqual(ordenarMusicasDoArtista(lista, 'ouvidas', de).map((t) => t.titulo),
  ['Cheap Thrills', 'Chandelier', 'Unstoppable', 'Hass Hass', 'Rara']);
assert.deepEqual(ordenarMusicasDoArtista(lista, 'recentes', de).map((t) => t.titulo),
  ['Hass Hass', 'Unstoppable', 'Chandelier', 'Rara', 'Cheap Thrills'], 'sem ano, ficam no fim pela ordem de antes');
// Uma música da biblioteca noutro upload encontra-se pelo título.
assert.equal(infoDe(sinteticas, 'outroUpload1', 'Chandelier (Official Video)', chaveDoTitulo)?.reproducoes, 3_900_000_000);
// O que a linha diz.
assert.equal(detalheDaLinha('ouvidas', de(lista[2])), '3.9B plays');
assert.equal(detalheDaLinha('recentes', de(lista[2])), '2014');
assert.equal(detalheDaLinha('recentes', de(lista[0])), null);
// Sem informação nenhuma (a página ainda a chegar): a ordem fica.
assert.deepEqual(ordenarMusicasDoArtista(lista, 'ouvidas', () => null), lista);

// Ligado nas duas páginas de artista, com o botão das duas ordens.
for (const ficheiro of ['../src/screens/LibraryGroupScreen.tsx', '../src/desktop/paginas/BibliotecaPages.web.tsx']) {
  const fonte = readFileSync(new URL(ficheiro, import.meta.url), 'utf8');
  assert.match(fonte, /\[\['ouvidas', 'Most played'\], \['recentes', 'Newest'\]\]/, `${ficheiro}: o botão`);
  assert.match(fonte, /setOrdemDoArtista\(o\)/, `${ficheiro}: a escolha fica guardada`);
  assert.match(fonte, /ordenarMusicasDoArtista\(/);
}
console.log('Ordem das músicas do artista: reproduções, ano, desconhecidas no fim e o botão nas duas páginas.');

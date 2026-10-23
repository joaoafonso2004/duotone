// As músicas de um artista por "Most played" ou "Newest" (10/10).
// Correr: node --experimental-strip-types scripts/test-ordem-do-artista.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  detalheDaLinha, infoDaPesquisa, infoDasMusicas, infoDe, lerIdade, lerReproducoes, modosComDados, ordenarMusicasDoArtista,
  textoDasReproducoes,
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

// Um artista sem página musical (15/10): as músicas vêm da pesquisa pelo nome, e
// era aí que "Most played" e "Newest" davam a mesma lista. Uma resposta real do
// InnerTube para "Santuarius Records Rap music" (o caso do João).
assert.equal(lerIdade('12 years ago'), 12 * 31_557_600);
assert.equal(lerIdade('Streamed 3 weeks ago'), 3 * 604_800);
assert.equal(lerIdade('1 day ago'), 86_400);
assert.equal(lerIdade('Premiered Oct 3, 2020'), null, 'uma data que não é relativa não se adivinha');
assert.equal(lerIdade(null), null);
assert.equal(textoDasReproducoes(7915, 'views'), '7.9K views');
assert.equal(textoDasReproducoes(1, 'views'), '1 view');
const resposta = JSON.parse(readFileSync(new URL('./fixtures/pesquisa-santuarius-records-rap.json', import.meta.url), 'utf8'));
const renderers: any[] = resposta.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents
  .map((c: any) => c.videoRenderer);
const doCanal = renderers.map((v) => ({
  videoId: v.videoId as string,
  titulo: v.title.runs[0].text as string,
  visualizacoes: v.viewCountText?.simpleText ?? null,
  publicado: v.publishedTimeText?.simpleText ?? null,
}));
assert.ok(doCanal.length >= 10 && doCanal.every((c) => lerReproducoes(c.visualizacoes) != null && lerIdade(c.publicado) != null),
  'cada vídeo da pesquisa traz as visualizações e há quanto tempo saiu');
const AGORA = Date.UTC(2026, 9, 15);
const infoDaBusca = infoDaPesquisa(doCanal, chaveDoTitulo, AGORA);
const deBusca = (c: { videoId: string; titulo: string }) => infoDe(infoDaBusca, c.videoId, c.titulo, chaveDoTitulo);
const maisVistas = ordenarMusicasDoArtista(doCanal, 'ouvidas', deBusca);
const maisNovas = ordenarMusicasDoArtista(doCanal, 'recentes', deBusca);
assert.notDeepEqual(maisVistas.map((c) => c.videoId), maisNovas.map((c) => c.videoId), 'os dois botões já não dão a mesma lista');
const vistas = maisVistas.map((c) => lerReproducoes(c.visualizacoes)!);
assert.deepEqual(vistas, [...vistas].sort((a, b) => b - a), 'Most played: das mais vistas para as menos');
const idades = maisNovas.map((c) => lerIdade(c.publicado)!);
assert.deepEqual(idades, [...idades].sort((a, b) => a - b), 'Newest: das mais novas para as mais antigas');
assert.equal(detalheDaLinha('ouvidas', deBusca(maisVistas[0])), textoDasReproducoes(lerReproducoes(maisVistas[0].visualizacoes), 'views'),
  'diz "views", que é o que são');
assert.equal(detalheDaLinha('recentes', deBusca(maisNovas[0])), maisNovas[0].publicado, 'diz "11 years ago" e não inventa um ano');
// As que empatam na idade ("12 years ago") ficam pela ordem da pesquisa.
const dozeAnos = doCanal.filter((c) => c.publicado === '12 years ago').map((c) => c.videoId);
assert.deepEqual(maisNovas.filter((c) => c.publicado === '12 years ago').map((c) => c.videoId), dozeAnos);
// Os botões só aparecem quando mudam alguma coisa.
assert.deepEqual(modosComDados(doCanal, deBusca), ['ouvidas', 'recentes']);
assert.deepEqual(modosComDados(lista, () => null), [], 'sem nada que ordenar, nenhum');
assert.deepEqual(modosComDados(lista, de), ['ouvidas', 'recentes']);
assert.deepEqual(modosComDados([lista[3]], (t) => ({ reproducoes: 5, ano: null })), ['ouvidas']);

// Ligado nas duas páginas de artista, com o botão das duas ordens. No iPhone
// o botão vive na folha com a lista inteira (23/10, MusicasDoArtistaSheet).
for (const [pagina, botao] of [
  ['../src/screens/LibraryGroupScreen.tsx', '../src/components/MusicasDoArtistaSheet.tsx'],
  ['../src/desktop/paginas/BibliotecaPages.web.tsx', '../src/desktop/paginas/BibliotecaPages.web.tsx'],
]) {
  const fonte = readFileSync(new URL(pagina, import.meta.url), 'utf8');
  assert.match(readFileSync(new URL(botao, import.meta.url), 'utf8'), /\[\['ouvidas', 'Most played'\], \['recentes', 'Newest'\]\]/, `${botao}: o botão`);
  assert.match(fonte, /setOrdemDoArtista\(o\)/, `${pagina}: a escolha fica guardada`);
  assert.match(fonte, /ordenarMusicasDoArtista\(/);
}
console.log('Ordem das músicas do artista: reproduções, ano, desconhecidas no fim e o botão nas duas páginas.');

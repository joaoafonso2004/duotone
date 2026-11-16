/**
 * Os álbuns na biblioteca (15/11, variante B: a pasta com as capas a flutuar):
 * as contas puras (lib/albunsGuardados.ts), o menu de um disco
 * (lib/menuDoLancamento.ts) e a ligação nas duas plataformas, lida como texto.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-albuns-guardados.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  CAMADAS_DA_PASTA, capasDaPasta, daLinha, eAlbumDoYouTubeMusic, legendaDoAlbum, ordenarAlbuns, paraALinha, paraGuardar,
} from '../src/lib/albunsGuardados.ts';
import { menuDoLancamento } from '../src/lib/menuDoLancamento.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

caso('um disco passa a álbum guardado, limpo e com limites', () => {
  const a = paraGuardar({ id: 'OLAK5uy_x', title: '  GNX ', artworkUrl: 'https://capa', tipo: 'Album', ano: '2024' }, ' Kendrick Lamar ', 1000);
  assert.deepEqual(a, { id: 'OLAK5uy_x', titulo: 'GNX', artista: 'Kendrick Lamar', ano: '2024', tipo: 'Album', capa: 'https://capa', guardadoEm: 1000 });
  const vazio = paraGuardar({ id: 'y', title: '', artworkUrl: null }, null);
  assert.equal(vazio.titulo, 'Album');
  assert.equal(vazio.artista, null);
  assert.equal(paraGuardar({ id: 'z', title: 'x'.repeat(400), artworkUrl: null }, null).titulo.length, 300);
});

caso('a linha da tabela vai e volta igual', () => {
  const a = paraGuardar({ id: 'OLAK5uy_x', title: 'GNX', artworkUrl: null, tipo: 'Album', ano: '2024' }, 'Kendrick Lamar', Date.parse('2026-11-15T10:00:00Z'));
  assert.deepEqual(daLinha(paraALinha(a)), a);
  assert.equal(daLinha({ album_id: '', title: 'x' }), null, 'sem id não serve');
  assert.equal(daLinha({ album_id: 'x', title: '' }), null, 'sem título não serve');
});

caso('os mais recentes primeiro, cada um uma vez', () => {
  const a = (id: string, em: number) => paraGuardar({ id, title: id, artworkUrl: `capa-${id}` }, null, em);
  const lista = ordenarAlbuns([a('velho', 1), a('novo', 3), a('meio', 2), a('novo', 0)]);
  assert.deepEqual(lista.map((x) => x.id), ['novo', 'meio', 'velho']);
});

caso('a pasta: as três capas mais recentes, desenhadas de trás para a frente', () => {
  const a = (id: string, em: number) => paraGuardar({ id, title: id, artworkUrl: `capa-${id}` }, null, em);
  const capas = (l: ReturnType<typeof capasDaPasta>) => l.map((c) => (c.vazia ? 'vazia' : c.capa));
  assert.deepEqual(capas(capasDaPasta([a('1', 1), a('2', 2), a('3', 3), a('4', 4)])), ['capa-2', 'capa-3', 'capa-4']);
  // 16/11: sempre três camadas; com um álbum só, a capa fica à frente e os lugares de trás são cartões vazios.
  assert.deepEqual(capas(capasDaPasta([a('1', 1)])), ['vazia', 'vazia', 'capa-1']);
  assert.deepEqual(capas(capasDaPasta([a('1', 1), a('2', 2)])), ['vazia', 'capa-1', 'capa-2']);
  // As camadas da maquete escolhida: a de trás rodada para a esquerda e mais apagada, a da frente para a direita.
  assert.deepEqual(CAMADAS_DA_PASTA.map((c) => c.rodar), [-6, -1, 5]);
  assert.ok(CAMADAS_DA_PASTA[0].opacidade < CAMADAS_DA_PASTA[2].opacidade);
});

caso('a legenda e o que conta como álbum', () => {
  assert.equal(legendaDoAlbum({ artista: 'SZA', ano: '2022' }), 'SZA · 2022');
  assert.equal(legendaDoAlbum({ artista: null, ano: null }), 'Album');
  assert.equal(eAlbumDoYouTubeMusic('OLAK5uy_abc'), true);
  assert.equal(eAlbumDoYouTubeMusic('PLabc'), false);
  assert.equal(eAlbumDoYouTubeMusic(null), false);
});

caso('o menu de um disco: "Save album" ou "Remove from library", antes do "Save as playlist"', () => {
  const ids = (guardado?: boolean) => menuDoLancamento({ tipo: 'Album' }, { semRede: false, guardado }).map((l) => l.id);
  assert.ok(!ids().includes('guardar-album'), 'sem saber, não há a linha (uma playlist da pesquisa)');
  assert.deepEqual(ids(false).slice(4, 6), ['guardar-album', 'guardar']);
  const rotulo = (guardado: boolean) => menuDoLancamento({ tipo: 'Album' }, { semRede: false, guardado }).find((l) => l.id === 'guardar-album')?.rotulo;
  assert.equal(rotulo(false), 'Save album');
  assert.equal(rotulo(true), 'Remove from library');
  const semRede = menuDoLancamento({ tipo: 'Album' }, { semRede: true, guardado: false }).find((l) => l.id === 'guardar-album');
  assert.ok(semRede?.motivo, 'sem rede fica à vista, a dizer porquê');
});

caso('iPhone: a pasta à cabeça da grelha, o ecrã dos álbuns, o coração e o menu', () => {
  const playlists = ler('src/screens/PlaylistsScreen.tsx');
  assert.match(playlists, /data=\{albuns\.length \? \[PASTA_DOS_ALBUNS, \.\.\.playlists\] : playlists\}/);
  assert.match(playlists, /<PastaDosAlbuns albuns=\{albuns\} lado=\{cardSize\} onPress=\{\(\) => navigation\.navigate\('AlbunsGuardados'\)\} \/>/);
  assert.match(playlists, /const semNadaNaGrelha = playlists\.length === 0 && albuns\.length === 0;/, 'só com álbuns, a grelha aparece na mesma');
  const nav = ler('src/navigation/RootNavigator.tsx');
  assert.match(nav, /<Stack\.Screen name="AlbunsGuardados" component=\{AlbunsGuardadosScreen\} \/>/);
  const folha = ler('src/components/YtPlaylistRecommendationSheet.tsx');
  assert.match(folha, /const eAlbum = !isInternalPlaylist && \(!!album \|\| eAlbumDoYouTubeMusic\(playlistId\)\);/);
  assert.match(folha, /alternarAlbumGuardado\(/);
  const artista = ler('src/screens/LibraryGroupScreen.tsx');
  assert.match(artista, /guardado: albunsGuardados\.has\(discoComMenu\.id\)/);
  assert.match(artista, /album=\{albumAberto\}/);
});

caso('PC: a pasta, a rota, o coração no diálogo e o menu', () => {
  const playlists = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(playlists, /\{comPasta \? <PastaDosAlbuns albuns=\{albuns\} lado=\{ladoDoCartao\} onPress=\{\(\) => navigate\(\{ name: 'albuns' \}\)\} \/> : null\}/);
  assert.match(ler('src/desktop/rotas.ts'), /\| \{ name: 'albuns' \}/);
  assert.match(ler('src/navigation/RootNavigator.web.tsx'), /case 'albuns': page = <AlbunsGuardadosPage back=\{back\} \{\.\.\.common\} \/>/);
  const biblioteca = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  assert.match(biblioteca, /\{eAlbumAberto \? <Button secondary marcado=\{albumGuardado\}/);
  assert.match(biblioteca, /guardado: eAlbumDoYouTubeMusic\(menu\.d\.id\) \? guardados\.has\(menu\.d\.id\) : undefined/);
  assert.match(ler('src/lib/voltarPara.ts'), /albuns: 'Albums'/);
});

caso('a pasta é um par de plataforma com a mesma extensão', () => {
  assert.ok(existsSync('src/components/PastaDosAlbuns.tsx') && existsSync('src/components/PastaDosAlbuns.web.tsx'));
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-albuns-guardados: tudo certo');

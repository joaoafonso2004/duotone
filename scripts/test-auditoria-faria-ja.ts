/**
 * O grupo "Faria já" da auditoria de produto de 16/10
 * (docs/AUDITORIA-PRODUTO-IOS-WINDOWS-2026-10-16.md): 5, 6, 7, 9 e 29. A 20
 * (o "Timeless") está no test-artist-name.ts.
 *
 * As contas das playlists sem rede são puras (lib/playlistsSemRede.ts); o
 * resto lê os ficheiros, para as regras que vivem nos ecrãs.
 *
 * Correr: node --experimental-strip-types scripts/test-auditoria-faria-ja.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legendaSemRede, naCopiaSemRede, tocaveisSemRede } from '../src/lib/playlistsSemRede.ts';
import { nomeDaRota } from '../src/lib/voltarPara.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
/** O corpo de uma função, do nome até à próxima declaração ao mesmo nível. */
const corpo = (texto: string, inicio: string, fim: string): string => {
  const i = texto.indexOf(inicio);
  assert.ok(i >= 0, `não encontrei: ${inicio}`);
  const j = texto.indexOf(fim, i + inicio.length);
  return texto.slice(i, j < 0 ? undefined : j);
};

console.log('\n29: as playlists sem rede (iPhone)');
caso('conta quantas de cada playlist estão no iPhone', () => {
  const mapa = naCopiaSemRede(new Map([
    ['a', [{ id: 1 }, { id: 2 }, { id: 3 }]],
    ['b', [{ id: 4 }]],
  ]), (f) => f.id !== 2 && f.id !== 4);
  assert.deepEqual(mapa.get('a'), { total: 3, aqui: 2 });
  assert.deepEqual(mapa.get('b'), { total: 1, aqui: 0 });
});
caso('a legenda de cada cartão', () => {
  assert.equal(legendaSemRede({ total: 14, aqui: 6 }), '6 of 14 on this iPhone');
  assert.equal(legendaSemRede({ total: 3, aqui: 3 }), '3 songs · all on this iPhone');
  assert.equal(legendaSemRede({ total: 1, aqui: 1 }), '1 song · all on this iPhone');
  assert.equal(legendaSemRede({ total: 5, aqui: 0 }), '5 songs · none on this iPhone');
  // A de um amigo (colaborativa) não está na cópia das próprias.
  assert.equal(legendaSemRede(undefined), 'Needs internet');
});
caso('o Play sem rede toca só o que está no iPhone, pela ordem', () => {
  const faixas = ['x', 'y', 'z', 'w'];
  assert.deepEqual(tocaveisSemRede(faixas, true, (f) => f !== 'y'), ['x', 'z', 'w']);
  assert.deepEqual(tocaveisSemRede(faixas, false, () => false), faixas);
});
caso('as Playlists e cada playlist já não estão atrás do "You\'re offline"', () => {
  const nav = ler('src/navigation/RootNavigator.tsx');
  assert.doesNotMatch(nav, /withInternet\(\s*PlaylistDetailScreen/);
  assert.doesNotMatch(nav, /withInternet\(\s*PlaylistsScreen/);
  assert.match(nav, /name="PlaylistDetail" component=\{PlaylistDetailScreen\}/);
  assert.match(nav, /pilhaDoSeparador\('Playlists', PlaylistsScreen\)/);
});
caso('a playlist abre pela cópia sem rede, e não se edita', () => {
  const ecra = ler('src/screens/PlaylistDetailScreen.tsx');
  const load = corpo(ecra, 'const load = useCallback(', '}, [id, offline, userId]);');
  assert.match(load, /if\(offline\)\{[\s\S]*faixasDaPlaylistSemRede\(userId,id\)/);
  assert.match(ecra, /const canEdit=podeMexerNasFaixas\(papel\)&&!offline;/);
  // A linha que não está no iPhone fica, apagada, e não toca.
  assert.match(ecra, /const fora = offline && !tocaSemRede\(item\);/);
  assert.match(ecra, /if \(offline && !tocaSemRede\(item\)\) \{[\s\S]{0,120}avisarInfo\('Not on this iPhone'/);
  assert.match(ecra, /tocarLista\(filaTocavel,/);
});
caso('a lista das playlists fica em disco e sem rede não vai à rede', () => {
  const store = ler('src/state/playlists.ts');
  assert.match(store, /AsyncStorage\.setItem\(CHAVE_DO_DISCO \+ conta/);
  assert.match(store, /if \(useConnectivity\.getState\(\)\.offline\) \{/);
});

console.log('\n5: "não consegui carregar" não é "0 songs"');
caso('o PC: a lista fica no refresh e a falha sem lista tem o seu estado', () => {
  const gancho = ler('src/desktop/paginas/comum.web.tsx');
  assert.match(gancho, /if \(lidaRef\.current\) setAReler\(true\);\s*else setLoading\(true\);/);
  assert.match(gancho, /semLista: !!error && !lida/);
  const paginas = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  const songs = corpo(paginas, 'export function SongsPage(', '\nexport function ');
  // 30/10: o total vive por baixo do título, e a barra só conta enquanto se pesquisa;
  // nos dois sítios uma lista que não se leu não diz "0 songs".
  assert.match(songs, /data\.semLista \|\| !query \? null : <Text style=\{styles\.songsResultCount\}>/);
  assert.match(songs, /const resumo = data\.loading \|\| data\.semLista \? undefined : resumoDaLista\(data\.tracks\);/);
  assert.match(songs, /data\.semLista \? <Empty icon="alert-circle-outline" title="Couldn't load your library"/);
  const artists = corpo(paginas, 'export function ArtistsPage(', '\nexport function ');
  assert.match(artists, /data\.semLista \? <Empty icon="alert-circle-outline"/);
});
caso('o iPhone: Liked Songs sem lista e com erro não diz "Nothing here yet"', () => {
  const ecra = ler('src/screens/SongsScreen.tsx');
  assert.match(ecra, /const semLista = !!loadError && tracks\.length === 0;/);
  assert.match(ecra, /\) : semLista \? \([\s\S]{0,200}title="Couldn't load your liked songs"/);
});

console.log('\n6: o menu do PC pelo papel real');
caso('o menu de uma faixa não assume que a playlist é tua', () => {
  const nav = ler('src/navigation/RootNavigator.web.tsx');
  assert.doesNotMatch(nav, /podeEditar: true/);
  assert.match(nav, /playlist: trackMenuPlaylist && trackMenuFila === null \? \{ podeEditar: trackMenuPlaylist\.podeEditar \} : null/);
  // E tira da playlist de onde o menu abriu, não da rota que está por baixo.
  assert.match(nav, /removeTrackFromPlaylist\(trackMenuPlaylist\.id, trackMenu\.id\)/);
  const pagina = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(pagina, /props\.more\(t, contexto, \{ playlist: \{ id, podeEditar: canEdit \} \}\)/);
});

console.log('\n7: a página inicial é a Home nos dois');
caso('a lateral e o "voltar" do PC dizem Home', () => {
  assert.equal(nomeDaRota({ name: 'search' }), 'Home');
  const rotas = ler('src/desktop/rotas.ts');
  assert.match(rotas, /\{ id: 'search', label: 'Home', icon: 'home-outline' \}/);
  assert.match(ler('src/desktop/paginas/BibliotecaPages.web.tsx'), /<Page title="Home"/);
});

console.log('\n9: o estado "guardada" chega com a música');
caso('o menu e o coração do PC leem o conjunto em memória', () => {
  const nav = ler('src/navigation/RootNavigator.web.tsx');
  const more = corpo(nav, 'const more = useCallback(', '}, []);');
  assert.doesNotMatch(more, /checkIsSaved/);
  assert.match(nav, /const isSaved = useSaved\(\(s\) => \(trackMenu \? s\.keys\.has\(savedKey\(trackMenu\)\) : false\)\);/);
  assert.match(nav, /const currentIsSaved = useSaved\(/);
  assert.match(nav, /guardada: guardadasLidas \? isSaved : null,/);
});
caso('o menu das músicas do chat também', () => {
  const acoes = ler('src/components/SocialTrackActions.tsx');
  assert.doesNotMatch(acoes, /checkIsSaved/);
  assert.match(acoes, /const guardada = track && lidas \? naLoja : null;/);
});

console.log(falhas ? `\n  ${falhas} caso(s) a falhar.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

/**
 * O "Jump back in" da Home (src/lib/recentes.ts) e a ligação: os ecrãs dizem
 * de onde vem a lista, e a Home mostra-os (3/10).
 *
 * Correr: node --experimental-strip-types scripts/test-recentes.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAXIMO_DE_RECENTES, capasDaFila, chaveDoRecente, comCapasDaPlaylist, lerRecentes, podeVoltar, recentesParaMostrar, registarRecente,
  type Recente,
} from '../src/lib/recentes.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const r = (tipo: Recente['tipo'], nome: string, id?: string, capas: string[] = ['a']) =>
  ({ tipo, nome, id, capas, quando: 1 });

caso('só os sítios a que se pode voltar', () => {
  assert.ok(podeVoltar({ tipo: 'playlist', nome: 'Rap PT', id: 'p1' }));
  assert.ok(podeVoltar({ tipo: 'guardadas', nome: 'Liked Songs' }));
  assert.ok(podeVoltar({ tipo: 'artista', nome: 'Isak' }));
  assert.ok(!podeVoltar({ tipo: 'pesquisa', nome: 'isak' }), 'uma pesquisa não é um sítio');
  assert.ok(!podeVoltar({ tipo: 'playlist', nome: 'Sem id' }), 'uma playlist sem id não abre');
  assert.ok(!podeVoltar({ tipo: 'artista', nome: '  ' }));
  assert.ok(!podeVoltar(null));
});
caso('entra à frente e não repete', () => {
  let l: Recente[] = [];
  l = registarRecente(l, r('playlist', 'A', '1'));
  l = registarRecente(l, r('artista', 'Isak'));
  l = registarRecente(l, r('playlist', 'A renomeada', '1'));
  assert.deepEqual(l.map((x) => x.nome), ['A renomeada', 'Isak']);
});
caso('um artista é o mesmo com outra caixa', () => {
  assert.equal(chaveDoRecente({ tipo: 'artista', nome: 'Isak' }), chaveDoRecente({ tipo: 'artista', nome: ' isak ' }));
});
caso('sem capas novas, ficam as de antes', () => {
  let l = registarRecente([], r('playlist', 'A', '1', ['x', 'y']));
  l = registarRecente(l, r('playlist', 'A', '1', []));
  assert.deepEqual(l[0].capas, ['x', 'y']);
});
caso('no máximo doze', () => {
  let l: Recente[] = [];
  for (let i = 0; i < 20; i++) l = registarRecente(l, r('playlist', `P${i}`, String(i)));
  assert.equal(l.length, MAXIMO_DE_RECENTES);
  assert.equal(l[0].nome, 'P19');
});
caso('as capas da fila, sem repetir, até quatro', () => {
  assert.deepEqual(capasDaFila([{ artworkUrl: 'a' }, { artworkUrl: 'a' }, { artworkUrl: null }, { artworkUrl: 'b' },
    { artworkUrl: 'c' }, { artworkUrl: 'd' }, { artworkUrl: 'e' }]), ['a', 'b', 'c', 'd']);
});
caso('na Home, os recentes primeiro e os atalhos a encher', () => {
  const recentes = registarRecente([], r('artista', 'Isak'));
  const extras = [registarRecente([], r('guardadas', 'Liked Songs'))[0], registarRecente([], r('artista', 'Isak'))[0],
    registarRecente([], r('mistura', 'Rap PT', 'm1'))[0]];
  assert.deepEqual(recentesParaMostrar(recentes, extras).map((x) => x.nome), ['Isak', 'Liked Songs', 'Rap PT']);
});
caso('lido do disco: só o que tem a forma certa', () => {
  const bom = registarRecente([], r('playlist', 'A', '1'));
  assert.equal(lerRecentes(JSON.stringify([...bom, { chave: 'x', tipo: 'pesquisa', nome: 'q', capas: [] }, 7])).length, 1);
  assert.deepEqual(lerRecentes('nada'), []);
  assert.deepEqual(lerRecentes(null), []);
});

console.log('\nligado');
caso('os ecrãs dizem de onde vem a lista', () => {
  assert.match(readFileSync('src/screens/SongsScreen.tsx', 'utf8'), /tipo: 'guardadas'/);
  assert.match(readFileSync('src/screens/PlaylistDetailScreen.tsx', 'utf8'), /tipo: 'playlist'/);
  assert.match(readFileSync('src/screens/PrateleiraScreen.tsx', 'utf8'), /origemDaPrateleira/);
  assert.match(readFileSync('src/screens/LibraryGroupScreen.tsx', 'utf8'), /tipo: type === 'artist' \? 'artista' : 'album'/);
  assert.match(readFileSync('src/components/CartaoDaMisturaDoDia.tsx', 'utf8'), /id: 'doDia'/);
});
caso('a Home mostra o Jump back in e chama-se Home', () => {
  const p = readFileSync('src/screens/SearchScreen.tsx', 'utf8');
  assert.match(p, /Jump back in/);
  assert.match(p, /recentesParaMostrar\(/);
  assert.match(p, /title="Home"/);
  assert.match(readFileSync('src/navigation/BarraDeSeparadores.tsx', 'utf8'), /Search: 'Home'/);
  assert.match(readFileSync('App.tsx', 'utf8'), /instalarRecentes\(\)/);
});

caso('uma playlist recente mostra as capas da playlist, com a escolhida (28/11)', () => {
  const lista = [
    { id: 'p1', artworks: ['https://capa-escolhida'] },
    { id: 'p2', artworks: ['m1', 'm2', 'm3', 'm4', 'm5'] },
    { id: 'p3', artworks: [] },
  ];
  const fila = { chave: 'playlist:p1', tipo: 'playlist' as const, nome: 'Mix', id: 'p1', capas: ['f3', 'f1', 'f4', 'f2'], quando: 1 };
  assert.deepEqual(comCapasDaPlaylist(fila, lista).capas, ['https://capa-escolhida'], 'a capa escolhida, e não as da fila');
  assert.deepEqual(comCapasDaPlaylist({ ...fila, id: 'p2' }, lista).capas, ['m1', 'm2', 'm3', 'm4'], 'o mosaico da grelha, até quatro');
  assert.deepEqual(comCapasDaPlaylist({ ...fila, id: 'p3' }, lista).capas, fila.capas, 'sem capas na lista: as do recente');
  assert.deepEqual(comCapasDaPlaylist({ ...fila, id: 'de-um-amigo' }, lista).capas, fila.capas, 'fora da lista: como veio');
  const mistura = { ...fila, tipo: 'mistura' as const };
  assert.equal(comCapasDaPlaylist(mistura, lista), mistura, 'só as playlists');
  // As duas plataformas: a Home do iPhone (que também faz voar estas capas) e a do PC.
  const home = readFileSync('src/screens/SearchScreen.tsx', 'utf8').replace(/\r\n/g, '\n');
  assert.match(home, /\]\)\.map\(\(r\) => comCapasDaPlaylist\(r, playlists\)\), \[recentes, atalhos, playlists\]\);/);
  assert.match(home, /capas: r\.tipo === 'artista' \? r\.capas\.slice\(0, 1\) : r\.capas\.length >= 4/, 'o voo usa as mesmas capas do atalho');
  const pc = readFileSync('src/desktop/VoltarAOuvir.web.tsx', 'utf8').replace(/\r\n/g, '\n');
  assert.match(pc, /lista\.map\(\(r\) => \(\{ r: comCapasDaPlaylist\(r, playlists\), destino: destinoDoRecente\(r\) \}\)\)/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

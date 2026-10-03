/**
 * O "Jump back in" da Home (src/lib/recentes.ts) e a ligação: os ecrãs dizem
 * de onde vem a lista, e a Home mostra-os (3/10).
 *
 * Correr: node --experimental-strip-types scripts/test-recentes.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAXIMO_DE_RECENTES, capasDaFila, chaveDoRecente, lerRecentes, podeVoltar, recentesParaMostrar, registarRecente,
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

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

/**
 * Que músicas ficam prontas antes de chegar a vez delas -- src/lib/adiantarFaixas.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-adiantar-faixas.ts
 */
import assert from 'node:assert/strict';
import {
  ADIANTAR_EM_DADOS_MOVEIS, ADIANTAR_EM_WIFI, faixasParaAdiantar, quantasAdiantar,
} from '../src/lib/adiantarFaixas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const yt = (id: string) => ({ source: 'youtube', sourceId: id });
const ids = (l: { sourceId: string }[]) => l.map((t) => t.sourceId);

console.log('\nquantas');

caso('três em Wi-Fi, menos em dados móveis', () => {
  assert.equal(quantasAdiantar(false), ADIANTAR_EM_WIFI);
  assert.equal(quantasAdiantar(true), ADIANTAR_EM_DADOS_MOVEIS);
  assert.ok(ADIANTAR_EM_DADOS_MOVEIS < ADIANTAR_EM_WIFI, 'dados móveis não pode adiantar mais do que Wi-Fi');
  assert.ok(ADIANTAR_EM_DADOS_MOVEIS >= 1, 'a seguinte tem de estar sempre pronta: o crossfade depende dela');
});

console.log('\nquais');

caso('a primeira é a próxima, e as outras seguem a ordem da fila', () => {
  const lista = faixasParaAdiantar(yt('b'), [yt('b'), yt('c'), yt('d'), yt('e')], 'a', 3);
  assert.deepEqual(ids(lista), ['b', 'c', 'd']);
});

caso('a que está a tocar e as repetidas não contam', () => {
  const lista = faixasParaAdiantar(yt('b'), [yt('a'), yt('b'), yt('c'), yt('c'), yt('d')], 'a', 3);
  assert.deepEqual(ids(lista), ['b', 'c', 'd']);
});

caso('só YouTube: o resto não descarrega', () => {
  const spotify = { source: 'spotify', sourceId: 'x' };
  const lista = faixasParaAdiantar(yt('b'), [spotify, yt('c')], 'a', 3);
  assert.deepEqual(ids(lista), ['b', 'c']);
});

caso('sem próxima não se adivinha nada (repeat one, shuffle sem percurso)', () => {
  assert.deepEqual(faixasParaAdiantar(null, [yt('c'), yt('d')], 'a', 3), []);
});

caso('uma fila de uma faixa só não adianta a própria', () => {
  assert.deepEqual(faixasParaAdiantar(yt('a'), [], 'a', 3), []);
});

caso('nunca passa do número pedido', () => {
  assert.equal(faixasParaAdiantar(yt('b'), [yt('c'), yt('d'), yt('e')], 'a', 2).length, 2);
  assert.deepEqual(faixasParaAdiantar(yt('b'), [yt('c')], 'a', 0), []);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

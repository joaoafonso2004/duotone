/**
 * A mistura de duas pessoas -- src/lib/misturaDosDois.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-mistura-dos-dois.ts
 */
import assert from 'node:assert/strict';
import {
  MINIMO_DOS_DOIS, MUSICAS_DOS_DOIS, haMisturaDosDois, misturaDosDois,
} from '../src/lib/misturaDosDois.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const f = (id: string, count: number) => ({ id, count });
const chave = (t: { id: string }) => t.id;
const ids = (l: { id: string }[]) => l.map((t) => t.id);

console.log('\na ordem');

caso('primeiro as que os dois ouvem, pela soma das escutas', () => {
  const minhas = [f('a', 1), f('comum-pouco', 1), f('comum-muito', 9)];
  const dele = [f('comum-pouco', 1), f('comum-muito', 9), f('b', 1)];
  assert.deepEqual(ids(misturaDosDois(minhas, dele, chave)).slice(0, 2), ['comum-muito', 'comum-pouco']);
});

caso('depois uma de cada lado, à vez, cada um pelas suas mais ouvidas', () => {
  const minhas = [f('m2', 2), f('m1', 5)];
  const dele = [f('d1', 7), f('d2', 3)];
  assert.deepEqual(ids(misturaDosDois(minhas, dele, chave)), ['m1', 'd1', 'm2', 'd2']);
});

caso('quando um lado acaba, o outro continua', () => {
  const minhas = [f('m1', 1)];
  const dele = [f('d1', 3), f('d2', 2), f('d3', 1)];
  assert.deepEqual(ids(misturaDosDois(minhas, dele, chave)), ['m1', 'd1', 'd2', 'd3']);
});

console.log('\nsem repetidas nem excessos');

caso('uma faixa comum aparece uma vez só, e as repetidas de um lado também', () => {
  const minhas = [f('c', 3), f('c', 3), f('m', 1)];
  const dele = [f('c', 2), f('d', 1)];
  assert.deepEqual(ids(misturaDosDois(minhas, dele, chave)), ['c', 'm', 'd']);
});

caso('nunca passa do limite', () => {
  const muitas = (p: string) => Array.from({ length: 60 }, (_, i) => f(`${p}${i}`, 60 - i));
  assert.equal(misturaDosDois(muitas('m'), muitas('d'), chave).length, MUSICAS_DOS_DOIS);
  assert.equal(misturaDosDois(muitas('m'), muitas('d'), chave, 5).length, 5);
});

console.log('\nquando vale um botão');

caso('os dois têm de ter ouvido, e a mistura tem de ter o mínimo', () => {
  const seis = Array.from({ length: MINIMO_DOS_DOIS }, (_, i) => f(`x${i}`, 1));
  assert.equal(haMisturaDosDois(seis, 3, 3), true);
  assert.equal(haMisturaDosDois(seis, 6, 0), false, 'só um dos lados não é uma mistura dos dois');
  assert.equal(haMisturaDosDois(seis.slice(1), 3, 3), false);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

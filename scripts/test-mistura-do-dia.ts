/**
 * A Daily mix -- src/lib/misturaDoDia.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-mistura-do-dia.ts
 */
import assert from 'node:assert/strict';
import {
  GUARDAR_EM_WIFI, MUSICAS_DA_MISTURA, diaDe, faixasParaGuardar, misturaGuardada,
} from '../src/lib/misturaDoDia.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const yt = (id: string) => ({ source: 'youtube', sourceId: id });
const wifi = { offline: false, dadosMoveis: false };

console.log('\no dia');

caso('muda uma vez por dia e é o mesmo durante o dia inteiro', () => {
  const dia = 86_400_000;
  assert.equal(diaDe(5 * dia), 5);
  assert.equal(diaDe(5 * dia + dia - 1), 5);
  assert.equal(diaDe(6 * dia), 6);
});

console.log('\na mistura guardada');

caso('só serve se for deste dia e tiver faixas', () => {
  assert.deepEqual(misturaGuardada({ dia: 7, faixas: [yt('a')] }, 7), [yt('a')]);
  assert.equal(misturaGuardada({ dia: 6, faixas: [yt('a')] }, 7), null, 'a de ontem não serve');
  assert.equal(misturaGuardada({ dia: 7, faixas: [] }, 7), null, 'vazia não se fixa o dia inteiro');
  assert.equal(misturaGuardada(null, 7), null);
  assert.equal(misturaGuardada({ dia: 7, faixas: 'x' }, 7), null);
});

console.log('\no que descarregar em segundo plano');

caso('as primeiras da lista, do YouTube, que ainda não estão em disco', () => {
  const lista = [yt('a'), { source: 'spotify', sourceId: 's' }, yt('b'), yt('c')];
  assert.deepEqual(faixasParaGuardar(lista, (id) => id === 'b', wifi).map((f) => f.sourceId), ['a', 'c']);
});

caso('só as primeiras `GUARDAR_EM_WIFI`, que são as que tocam primeiro', () => {
  const lista = Array.from({ length: MUSICAS_DA_MISTURA }, (_, i) => yt(`t${i}`));
  const escolhidas = faixasParaGuardar(lista, () => false, wifi);
  assert.equal(escolhidas.length, GUARDAR_EM_WIFI);
  assert.equal(escolhidas[0].sourceId, 't0');
  assert.ok(GUARDAR_EM_WIFI < MUSICAS_DA_MISTURA, 'não se descarrega a mistura inteira por conta');
});

caso('nada sem rede, nada em dados móveis', () => {
  assert.deepEqual(faixasParaGuardar([yt('a')], () => false, { offline: true, dadosMoveis: false }), []);
  assert.deepEqual(faixasParaGuardar([yt('a')], () => false, { offline: false, dadosMoveis: true }), []);
});

caso('uma faixa repetida na lista não se descarrega duas vezes', () => {
  assert.deepEqual(faixasParaGuardar([yt('a'), yt('a')], () => false, wifi).length, 1);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

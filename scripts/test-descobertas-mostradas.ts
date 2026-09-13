/**
 * O que o "Discover new" já mostrou -- src/lib/descobertasMostradas.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-descobertas-mostradas.ts
 */
import assert from 'node:assert/strict';
import {
  CHAVES_POR_SEMANA, SEMANAS_SEM_REPETIR, TENTATIVAS_SEM_REPETIR,
  aEvitar, chegam, lerHistorico, registarSemana,
} from '../src/lib/descobertasMostradas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\no que evitar');

caso('as semanas anteriores dentro da janela contam; a atual e as velhas não', () => {
  const h = [
    { semana: 100, chaves: ['atual'] },
    { semana: 99, chaves: ['passada'] },
    { semana: 96, chaves: ['ha-quatro'] },
    { semana: 95, chaves: ['ha-cinco'] },
  ];
  assert.deepEqual([...aEvitar(h, 100, 4)].sort(), ['ha-quatro', 'passada']);
  assert.deepEqual([...aEvitar(h, 100, 1)], ['passada']);
  assert.deepEqual([...aEvitar(h, 100, 0)], []);
});

console.log('\nregistar a semana');

caso('a lista da mesma semana é substituída, não somada', () => {
  let h = registarSemana([], 10, ['a', 'b']);
  h = registarSemana(h, 10, ['c']);
  assert.deepEqual(h, [{ semana: 10, chaves: ['c'] }]);
});

caso('o que sai da janela é esquecido, e a mais recente fica à frente', () => {
  const velho = [{ semana: 1, chaves: ['x'] }, { semana: 8, chaves: ['y'] }];
  const h = registarSemana(velho, 10, ['z']);
  assert.deepEqual(h.map((s) => s.semana), [10, 8]);
  assert.ok(10 - SEMANAS_SEM_REPETIR <= 8);
});

caso('sem repetidas nem vazias, e com teto por semana', () => {
  const muitas = Array.from({ length: CHAVES_POR_SEMANA + 20 }, (_, i) => `k${i}`);
  assert.deepEqual(registarSemana([], 1, ['a', 'a', '', 'b'])[0].chaves, ['a', 'b']);
  assert.equal(registarSemana([], 1, muitas)[0].chaves.length, CHAVES_POR_SEMANA);
});

console.log('\napertar e alargar');

caso('começa pela janela inteira e acaba sem excluir nada', () => {
  assert.equal(TENTATIVAS_SEM_REPETIR[0], SEMANAS_SEM_REPETIR);
  assert.equal(TENTATIVAS_SEM_REPETIR.at(-1), 0);
  for (let i = 1; i < TENTATIVAS_SEM_REPETIR.length; i++) {
    assert.ok(TENTATIVAS_SEM_REPETIR[i] < TENTATIVAS_SEM_REPETIR[i - 1], 'tem de ir alargando');
  }
});

caso('metade do pedido já é uma prateleira', () => {
  assert.equal(chegam(15, 30), true);
  assert.equal(chegam(14, 30), false);
  assert.equal(chegam(0, 0), true);
});

console.log('\nler da cache');

caso('lixo na cache não rebenta e não entra', () => {
  assert.deepEqual(lerHistorico(null), []);
  assert.deepEqual(lerHistorico({ semana: 1 }), []);
  assert.deepEqual(
    lerHistorico([{ semana: 3, chaves: ['a', 7, ''] }, { semana: 'x', chaves: [] }, null]),
    [{ semana: 3, chaves: ['a'] }],
  );
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

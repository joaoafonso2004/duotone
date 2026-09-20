/**
 * O que o "Discover" já mostrou -- src/lib/descobertasMostradas.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-descobertas-mostradas.ts
 */
import assert from 'node:assert/strict';
import {
  CHAVES_POR_DIA, DIAS_SEM_REPETIR, TENTATIVAS_SEM_REPETIR,
  aEvitar, chegam, lerHistorico, registarDia,
} from '../src/lib/descobertasMostradas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\no que evitar');

caso('os dias anteriores dentro da janela contam; o atual e os velhos não', () => {
  const h = [
    { dia: 100, chaves: ['hoje'] },
    { dia: 99, chaves: ['ontem'] },
    { dia: 72, chaves: ['ha-28'] },
    { dia: 71, chaves: ['ha-29'] },
  ];
  assert.deepEqual([...aEvitar(h, 100, DIAS_SEM_REPETIR)].sort(), ['ha-28', 'ontem']);
  assert.deepEqual([...aEvitar(h, 100, 1)], ['ontem']);
  assert.deepEqual([...aEvitar(h, 100, 0)], []);
});

console.log('\nregistar o dia');

caso('a lista do mesmo dia é substituída, não somada', () => {
  let h = registarDia([], 10, ['a', 'b']);
  h = registarDia(h, 10, ['c']);
  assert.deepEqual(h, [{ dia: 10, chaves: ['c'] }]);
});

caso('o dia de ontem fica -- é ele que impede a lista de se repetir amanhã', () => {
  let h = registarDia([], 10, ['a']);
  h = registarDia(h, 11, ['b']);
  assert.deepEqual(h.map((d) => d.dia), [11, 10]);
  assert.deepEqual([...aEvitar(h, 11, DIAS_SEM_REPETIR)], ['a']);
});

caso('o que sai da janela é esquecido, e o mais recente fica à frente', () => {
  const velho = [{ dia: 1, chaves: ['x'] }, { dia: 80, chaves: ['y'] }];
  const h = registarDia(velho, 100, ['z']);
  assert.deepEqual(h.map((d) => d.dia), [100, 80]);
  assert.ok(100 - DIAS_SEM_REPETIR <= 80);
});

caso('sem repetidas nem vazias, e com teto por dia', () => {
  const muitas = Array.from({ length: CHAVES_POR_DIA + 20 }, (_, i) => `k${i}`);
  assert.deepEqual(registarDia([], 1, ['a', 'a', '', 'b'])[0].chaves, ['a', 'b']);
  assert.equal(registarDia([], 1, muitas)[0].chaves.length, CHAVES_POR_DIA);
});

console.log('\napertar e alargar');

caso('começa pela janela inteira e acaba sem excluir nada', () => {
  assert.equal(TENTATIVAS_SEM_REPETIR[0], DIAS_SEM_REPETIR);
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
  assert.deepEqual(lerHistorico({ dia: 1 }), []);
  assert.deepEqual(
    lerHistorico([{ dia: 3, chaves: ['a', 7, ''] }, { dia: 'x', chaves: [] }, null]),
    [{ dia: 3, chaves: ['a'] }],
  );
});

caso('a memória por semanas da versão anterior é ignorada, não rebenta', () => {
  assert.deepEqual(lerHistorico([{ semana: 100, chaves: ['a'] }]), []);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

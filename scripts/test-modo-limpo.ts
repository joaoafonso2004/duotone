/**
 * O modo limpo do PC -- src/lib/modoLimpo.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-modo-limpo.ts
 */
import assert from 'node:assert/strict';
import {
  ALTURA_RESERVADA, CAPA_MAXIMA, CAPA_MINIMA, INACTIVIDADE_MS, estaQuieto, posicaoDoClique,
  progressoDaFaixa, tamanhoDaCapa,
} from '../src/lib/modoLimpo.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\na capa ocupa o ecrã sem o encher');
caso('num 1080p sobra sempre altura para a barra e o logo', () => {
  const lado = tamanhoDaCapa(1920, 1080);
  assert.ok(lado <= 1080 - ALTURA_RESERVADA, `${lado} não deixa ar`);
  assert.ok(lado >= 500, `${lado} é pequena de mais para um monitor destes`);
});
caso('numa janela baixa manda a altura, não a largura', () => {
  assert.equal(tamanhoDaCapa(2560, 720), 720 - ALTURA_RESERVADA);
});
caso('a coluna e o logo cabem os dois: nome, barra e controlos levam 118 px', () => {
  // 118 = identidade (48) + barra (16) + controlos (54). O resto da reserva é
  // o lugar do logo, que é absoluto e não entra na coluna.
  for (const altura of [600, 720, 900, 1080, 1440]) {
    const coluna = tamanhoDaCapa(1600, altura) + 118;
    assert.ok(coluna <= altura - 60, `a ${altura} px a coluna (${coluna}) come o logo`);
  }
});
caso('num ultrawide manda a altura na mesma, e nunca passa do teto', () => {
  assert.equal(tamanhoDaCapa(3440, 1440), CAPA_MAXIMA);
});
caso('numa janela minúscula fica no mínimo, e nunca negativa', () => {
  assert.equal(tamanhoDaCapa(320, 240), CAPA_MINIMA);
  assert.ok(tamanhoDaCapa(100, 100) > 0);
});
caso('é sempre um número inteiro de pixéis', () => {
  assert.equal(tamanhoDaCapa(1337, 911) % 1, 0);
});

console.log('\na interface some-se quando o rato pára');
caso('antes do tempo continua à vista; depois desaparece', () => {
  assert.ok(!estaQuieto(1000, 1000 + INACTIVIDADE_MS - 1));
  assert.ok(estaQuieto(1000, 1000 + INACTIVIDADE_MS));
});
caso('o atraso é meio-termo: nem meio segundo nem dez', () => {
  assert.ok(INACTIVIDADE_MS >= 1500 && INACTIVIDADE_MS <= 5000);
});

console.log('\na barra');
caso('a fração tocada fica entre 0 e 1', () => {
  assert.equal(progressoDaFaixa(30_000, 120_000), 0.25);
  assert.equal(progressoDaFaixa(200_000, 120_000), 1, 'uma posição para lá do fim não estica a barra');
  assert.equal(progressoDaFaixa(-5, 120_000), 0);
});
caso('sem duração não há barra nenhuma (e não dá NaN)', () => {
  assert.equal(progressoDaFaixa(30_000, 0), 0);
  assert.equal(progressoDaFaixa(30_000, Number.NaN), 0);
  assert.equal(progressoDaFaixa(Number.NaN, 120_000), 0);
});
caso('carregar na barra dá o sítio, e fora dela dá as pontas', () => {
  assert.equal(posicaoDoClique(500, 100, 800), 0.5);
  assert.equal(posicaoDoClique(50, 100, 800), 0, 'antes do início');
  assert.equal(posicaoDoClique(5000, 100, 800), 1, 'depois do fim');
  assert.equal(posicaoDoClique(500, 100, 0), 0, 'uma barra sem largura não parte nada');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

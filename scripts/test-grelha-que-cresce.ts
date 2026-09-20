/**
 * A grelha que cresce -- src/lib/grelhaQueCresce.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-grelha-que-cresce.ts
 */
import assert from 'node:assert/strict';
import {
  LOTE, MARGEM_DO_FIM, PRIMEIRO_LOTE, crescer, faltaMostrar, pertoDoFim, quantosMostrar,
} from '../src/lib/grelhaQueCresce.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\nabrir a página não depende do tamanho da biblioteca');
caso('com setecentos artistas montam-se os do primeiro lote', () => {
  assert.equal(quantosMostrar(0, 700), PRIMEIRO_LOTE);
});
caso('com menos do que um lote monta-se tudo', () => {
  assert.equal(quantosMostrar(0, 12), 12);
  assert.equal(quantosMostrar(0, 0), 0);
});
caso('o primeiro lote chega para encher um ecrã grande', () => {
  // A 1920x1080 cabem nove capas por linha e cerca de quatro linhas: 36.
  assert.ok(PRIMEIRO_LOTE >= 36, `${PRIMEIRO_LOTE} não enche um 1080p`);
});

console.log('\ncrescer nunca passa do que existe');
caso('um lote de cada vez', () => {
  assert.equal(crescer(PRIMEIRO_LOTE, 700), PRIMEIRO_LOTE + LOTE);
});
caso('o último lote fica pelo total, e daí não sai', () => {
  assert.equal(crescer(690, 700), 700);
  assert.equal(crescer(700, 700), 700);
});
caso('uma lista que encolheu (uma pesquisa) não mostra mais do que tem', () => {
  assert.equal(quantosMostrar(600, 3), 3);
  assert.equal(faltaMostrar(600, 3), false);
});
caso('enquanto falta, diz que falta', () => {
  assert.equal(faltaMostrar(0, 700), true);
  assert.equal(faltaMostrar(700, 700), false);
  assert.equal(faltaMostrar(0, 10), false);
});

console.log('\npedir mais antes de se ver o fim');
caso('a meio da grelha não se pede nada', () => {
  assert.equal(pertoDoFim(0, 800, 6000), false);
});
caso('a uma margem do fim, pede-se', () => {
  assert.equal(pertoDoFim(6000 - 800 - MARGEM_DO_FIM, 800, 6000), true);
});
caso('no fim, pede-se', () => {
  assert.equal(pertoDoFim(5200, 800, 6000), true);
});
caso('sem medidas ainda, não se pede nada', () => {
  // Isto é o que impedia a página de pedir lote atrás de lote ao montar,
  // antes de o ScrollView ter dito de que tamanho é.
  assert.equal(pertoDoFim(0, 0, 0), false);
  assert.equal(pertoDoFim(0, 800, 0), false);
  assert.equal(pertoDoFim(0, 0, 6000), false);
});
caso('uma grelha mais curta do que a janela está sempre no fim', () => {
  assert.equal(pertoDoFim(0, 800, 400), true);
});

console.log(falhas === 0 ? '\nTudo bem.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

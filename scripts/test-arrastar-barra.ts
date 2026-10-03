/**
 * Arrastar a barra de progresso (src/lib/arrastarBarra.ts) e a ligação no
 * ProgressBar (3/10, variante B).
 *
 * Correr: node --experimental-strip-types scripts/test-arrastar-barra.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RITMOS, bateuNaPonta, comecarArrasto, eToque, fracaoNoArrasto, mudarDeRitmo, ritmoDoArrasto,
} from '../src/lib/arrastarBarra.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const L = 334;

caso('agarrar não mexe na música: sem movimento, fica onde estava', () => {
  const a = comecarArrasto(0.3);
  assert.equal(fracaoNoArrasto(a, 0, L), 0.3);
});
caso('o movimento conta a partir de onde se agarrou (relativo)', () => {
  const a = comecarArrasto(0.3);
  assert.ok(perto(fracaoNoArrasto(a, L / 10, L), 0.4));
  assert.ok(perto(fracaoNoArrasto(a, -L / 10, L), 0.2));
});
caso('descer abranda: meia, um quarto, fino', () => {
  assert.equal(ritmoDoArrasto(0), 0);
  assert.equal(ritmoDoArrasto(49), 0);
  assert.equal(ritmoDoArrasto(50), 1);
  assert.equal(ritmoDoArrasto(110), 2);
  assert.equal(ritmoDoArrasto(400), 3);
  assert.equal(ritmoDoArrasto(-200), 0, 'subir não abranda');
  assert.deepEqual(RITMOS.map((r) => r.fator), [1, 0.5, 0.25, 0.1]);
});
caso('mudar de ritmo não salta, e o movimento seguinte anda ao ritmo novo', () => {
  let a = comecarArrasto(0.3);
  const antes = fracaoNoArrasto(a, 100, L);
  a = mudarDeRitmo(a, 100, L, 3);
  assert.ok(perto(fracaoNoArrasto(a, 100, L), antes), 'no instante da mudança fica onde estava');
  assert.ok(perto(fracaoNoArrasto(a, 200, L) - antes, (100 * 0.1) / L), 'depois, um décimo');
  // E voltar ao normal também não salta.
  const meio = fracaoNoArrasto(a, 200, L);
  a = mudarDeRitmo(a, 200, L, 0);
  assert.ok(perto(fracaoNoArrasto(a, 200, L), meio));
});
caso('nunca sai de 0..1', () => {
  const a = comecarArrasto(0.9);
  assert.equal(fracaoNoArrasto(a, 10 * L, L), 1);
  assert.equal(fracaoNoArrasto(a, -10 * L, L), 0);
});
caso('um toque é curto e quase parado', () => {
  assert.ok(eToque(2, 3, 120));
  assert.ok(!eToque(20, 0, 120), 'mexeu');
  assert.ok(!eToque(1, 1, 600), 'demorou');
});
caso('vibra ao chegar a uma ponta, só ao chegar', () => {
  assert.ok(bateuNaPonta(0.01, 0));
  assert.ok(bateuNaPonta(0.98, 1));
  assert.ok(!bateuNaPonta(0, 0), 'já lá estava');
  assert.ok(!bateuNaPonta(0.4, 0.5));
});

console.log('\nligado');
caso('a barra usa o Gesture Handler com o dedo no motor nativo, e já não o PanResponder', () => {
  const b = readFileSync('src/components/ProgressBar.tsx', 'utf8');
  // Dois gestos simultâneos: o nativo desenha o dedo, o de fora faz as contas.
  assert.equal((b.match(/<PanGestureHandler/g) ?? []).length, 2);
  assert.match(b, /simultaneousHandlers=\{refDeDentro\}/);
  assert.match(b, /translationX: dedoX \} \}\], \{ useNativeDriver: true \}/);
  assert.match(b, /eToque\(/, 'um toque salta para o ponto');
  assert.doesNotMatch(b, /PanResponder/);
  assert.doesNotMatch(b, /setDragFraction/, 'nada de setState a cada movimento');
  assert.match(b, /mudarDeRitmo\(/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

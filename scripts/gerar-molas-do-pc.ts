/**
 * Imprime o bloco das molas do PC (S1 da auditoria de 31/10), para ver as
 * curvas e as durações. A conta vive no `src/lib/molasEmCss.ts`, que a app
 * corre no arranque: este script só a mostra.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/gerar-molas-do-pc.ts
 */
import { cssDasMolas, curvasDoPc } from '../src/lib/molasEmCss.ts';

for (const [nome, c] of Object.entries(curvasDoPc())) {
  console.log(`/* ${nome}: ${c.ms} ms · pico ${(c.pico * 100).toFixed(1)} % */`);
}
console.log(cssDasMolas().replace(/; /g, ';\n  '));

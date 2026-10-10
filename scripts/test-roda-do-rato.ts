// A roda do rato no volume e na barra de progresso do PC (10/10).
// Correr: node --experimental-strip-types scripts/test-roda-do-rato.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarRoda, proporcaoComARoda, volumeComARoda, PX_POR_DENTE } from '../src/lib/rodaDoRato.ts';

// Um dente do rato é um passo; para cima (deltaY negativo) é mais.
let roda = criarRoda();
assert.equal(roda(-PX_POR_DENTE), 1);
assert.equal(roda(PX_POR_DENTE), -1);
assert.equal(roda(-3 * PX_POR_DENTE), 3, 'três dentes de uma vez');
assert.equal(roda(0), 0);
assert.equal(roda(Number.NaN), 0);

// Um touchpad: muitos eventos pequenos somam-se, um passo por dente inteiro.
roda = criarRoda();
const passos = Array.from({ length: 25 }, () => roda(-12)).reduce((a, b) => a + b, 0);
assert.equal(passos, 3, '300 px em 25 bocados são três passos, não 25');
// E mudar de sentido não gasta o que sobrava do outro.
roda = criarRoda();
assert.equal(roda(-90), 0);
assert.equal(roda(30), 0, 'o resto para cima não anula a descida');
assert.equal(roda(80), -1);
// Linhas (deltaMode 1): três linhas ~ um dente.
assert.equal(criarRoda()(-3, 1), 0);
assert.equal(criarRoda()(-4, 1), 1);

assert.equal(volumeComARoda(50, 2), 60);
assert.equal(volumeComARoda(98, 3), 100, 'não passa de 100');
assert.equal(volumeComARoda(2, -1), 0, 'nem de 0');
assert.equal(proporcaoComARoda(0.5, 1, 100_000), 0.55, '5 s numa música de 100 s');
assert.equal(proporcaoComARoda(0.99, 3, 100_000), 1);
assert.equal(proporcaoComARoda(0.4, 1, 0), 0.4, 'sem duração não anda');

// Ligado na barra do leitor do PC: o volume e a barra de progresso.
const casca = readFileSync(new URL('../src/desktop/casca.web.tsx', import.meta.url), 'utf8');
assert.match(casca, /onWheel=\{rodarVolume\}/, 'a roda no volume');
assert.match(casca, /onWheel=\{rodar\}/, 'a roda na barra de progresso');
const ui = readFileSync(new URL('../src/desktop/ui.web.tsx', import.meta.url), 'utf8');
assert.match(ui, /PROCURAR_DEPOIS_MS/, 'a barra procura uma vez, quando a roda pára');
console.log('Roda do rato: dentes, touchpad, limites e ligação passaram.');

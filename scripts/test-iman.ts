/**
 * O Íman (C5, 1/11): arrastar uma música no PC. A placa levanta-se, o destino
 * mais próximo acende à medida que ela se aproxima, e ao largar é puxada para lá.
 *
 * Correr: node --experimental-strip-types scripts/test-iman.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { distanciaAoRetangulo, pertoDoIman, RAIO_DO_IMAN_PX } from '../src/lib/arrastar.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const motor = ler('src/desktop/Arrastar.web.tsx');
const casca = ler('src/desktop/casca.web.tsx');

console.log('\nas contas');
caso('a distância a um retângulo: zero lá dentro, a reta mais curta cá fora', () => {
  const r = { left: 100, top: 100, right: 200, bottom: 150 };
  assert.equal(distanciaAoRetangulo(150, 120, r), 0);
  assert.equal(distanciaAoRetangulo(100, 100, r), 0, 'na borda ainda é em cima');
  assert.equal(distanciaAoRetangulo(90, 120, r), 10);
  assert.equal(distanciaAoRetangulo(150, 170, r), 20);
  assert.equal(distanciaAoRetangulo(97, 96, r), 5, 'pela diagonal, ao canto');
});
caso('acende de 0 a 1 ao longo do raio, e nunca passa desses limites', () => {
  assert.equal(RAIO_DO_IMAN_PX, 240);
  assert.equal(pertoDoIman(0), 1);
  assert.equal(pertoDoIman(120), 0.5);
  assert.equal(pertoDoIman(240), 0);
  assert.equal(pertoDoIman(900), 0);
});
caso('com menos movimento não há aproximação: só acende por cima', () => {
  assert.equal(pertoDoIman(0, true), 1);
  assert.equal(pertoDoIman(1, true), 0);
  assert.equal(pertoDoIman(100, true), 0);
});

console.log('\no motor');
caso('só o mais próximo tem a --perto, no máximo uma vez por fotograma, e só durante o arrasto', () => {
  assert.match(motor, /if \(g\.fotograma !== null\) return;\n\s*g\.fotograma = requestAnimationFrame\(/);
  assert.match(motor, /if \(g\.maisPerto && g\.maisPerto !== melhor\) g\.maisPerto\.style\.removeProperty\('--perto'\);/);
  assert.match(motor, /melhor\?\.style\.setProperty\('--perto', String\(pertoDoIman\(menor, menosMovimento\(\)\)\)\);/);
  assert.match(motor, /r\.alvo\.insercao \|\| !r\.alvo\.aceita\(g\.ativo\)\) continue;/, 'uma lista não acende: tem a linha de inserção');
});
caso('ao acabar nada fica aceso, e a linha de onde saiu volta ao normal', () => {
  const limpar = motor.slice(motor.indexOf('function limparVisuais'), motor.indexOf('function terminar'));
  assert.match(limpar, /removeAttribute\?\.\('data-a-arrastar'\)/);
  assert.match(limpar, /cancelAnimationFrame\(gesto\.fotograma\)/);
  assert.match(limpar, /maisPerto\?\.style\.removeProperty\('--perto'\)/);
});
caso('ao largar num destino a placa é puxada e ele acende o anel; numa lista, não', () => {
  assert.match(motor, /if \(!debaixo\.alvo\.insercao\) \{\n\s*if \(voo\) voarAPlaca\(voo\.copia, voo\.de, debaixo\.no, false, \(\) => acender\(debaixo\.no\)\);\n\s*else acender\(debaixo\.no\);/);
  assert.match(motor, /const c = curvasDoPc\(\)\.soltar;/, 'com a mola SOLTAR');
});
caso('largada onde não faz nada, a placa volta à linha (se ela ainda lá estiver)', () => {
  assert.match(motor, /else if \(voo && linha\?\.isConnected\) \{\n\s*voarAPlaca\(voo\.copia, voo\.de, linha, true\);/);
});
caso('o voo é uma cópia sem a marca, e sai do documento no fim', () => {
  assert.match(motor, /copia\.removeAttribute\('data-dt'\);/, 'senão a entrada da placa repetia-se');
  assert.match(motor, /const fim = \(\) => \{ if \(feito\) return; feito = true; copia\.remove\(\); depois\?\.\(\); \};/);
  assert.match(motor, /setTimeout\(fim, duracao \+ 100\);/, 'com a janela escondida não há finish');
  assert.match(motor, /const voo = menosMovimento\(\) \? null : copiaDaPlaca\(\);/, 'com menos movimento não voa');
});

console.log('\no CSS');
caso('o destino acende com a --perto, a placa levanta-se e a linha apaga-se', () => {
  assert.match(casca, /\[data-largar="pode"\]\{ box-shadow: inset 0 0 0 1px rgba\(233,234,238,calc\(\.14 \+ \.31 \* var\(--perto, 0\)\)\)/);
  assert.match(casca, /\[data-dt~="placa"\]\{ animation: dt-placa var\(--dt-premir-ms\) var\(--dt-premir\) both; \}/);
  assert.match(casca, /\[data-a-arrastar\]\{ opacity: \.35; \}/);
  assert.match(motor, /\{\.\.\.marcar\('placa'\)\}/);
  assert.match(motor, /borderTopColor: 'rgba\(233,234,238,\.32\)'/, 'a aresta de luz');
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

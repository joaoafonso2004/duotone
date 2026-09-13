/**
 * O título do Now Playing que não cabe -- src/lib/tituloQueRola.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-titulo-que-rola.ts
 */
import assert from 'node:assert/strict';
import {
  DESVANECER_A_DIREITA, INTERVALO_DA_VOLTA, PONTOS_POR_SEGUNDO,
  mascaraDoTitulo, naoCabe, voltaDoTitulo,
} from '../src/lib/tituloQueRola.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\nquando é que não cabe');

caso('um título que cabe, ou que só passa por arredondamento, não desvanece', () => {
  assert.equal(naoCabe(200, 250), false);
  assert.equal(naoCabe(250, 250), false);
  assert.equal(naoCabe(250.8, 250), false, 'meio ponto de medição não corta nada');
  assert.equal(naoCabe(252, 250), true);
});

caso('uma caixa ainda por medir nunca corta', () => {
  assert.equal(naoCabe(900, 0), false);
});

console.log('\na volta');

caso('anda o título inteiro mais o intervalo, e acaba onde começou', () => {
  const { distancia } = voltaDoTitulo(312);
  assert.equal(distancia, 312 + INTERVALO_DA_VOLTA);
});

caso('a velocidade é a mesma para um título curto e um comprido', () => {
  for (const largura of [260, 420, 900]) {
    const { distancia, duracaoMs } = voltaDoTitulo(largura);
    const velocidade = distancia / (duracaoMs / 1000);
    assert.ok(Math.abs(velocidade - PONTOS_POR_SEGUNDO) < 0.1, `${largura} pt anda a ${velocidade} pt/s`);
  }
});

caso('a velocidade lê-se: nem arrasta nem foge', () => {
  assert.ok(PONTOS_POR_SEGUNDO >= 25 && PONTOS_POR_SEGUNDO <= 60, `${PONTOS_POR_SEGUNDO} pt/s`);
});

console.log('\na máscara');

const ordenadas = (p: number[]) => p.every((v, i) => i === 0 || v >= p[i - 1]!);

caso('um título que cabe vê-se inteiro', () => {
  const m = mascaraDoTitulo(250, 'cabe');
  assert.ok(m.cores.every((c) => c === '#000'));
});

caso('parado, só desvanece à direita: a primeira letra fica inteira', () => {
  const m = mascaraDoTitulo(250, 'parado');
  assert.equal(m.cores[0], '#000');
  assert.equal(m.cores.at(-1), 'transparent');
  assert.ok(Math.abs(m.posicoes[1]! - (1 - DESVANECER_A_DIREITA / 250)) < 1e-9);
  assert.ok(ordenadas(m.posicoes));
});

caso('a andar, desvanece dos dois lados', () => {
  const m = mascaraDoTitulo(250, 'a-andar');
  assert.equal(m.cores[0], 'transparent');
  assert.equal(m.cores.at(-1), 'transparent');
  assert.ok(ordenadas(m.posicoes));
});

caso('numa caixa estreita as posições continuam por ordem', () => {
  for (const estado of ['parado', 'a-andar'] as const) {
    const m = mascaraDoTitulo(30, estado);
    assert.ok(ordenadas(m.posicoes), `${estado}: ${m.posicoes.join(', ')}`);
    assert.equal(m.cores.length, m.posicoes.length);
  }
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

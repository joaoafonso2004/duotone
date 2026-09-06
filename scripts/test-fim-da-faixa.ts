// Onde é que a música acaba mesmo.
import assert from 'node:assert/strict';
import { fimMusicalDaFaixa, limiarDeSilencio } from '../src/lib/fimDaFaixa.ts';

const BLOCO = 0.4;
/** Uma cauda de 30 s a começar aos 180 s, com os níveis dados. */
const cauda = (blocos: number[], loudnessDb: number | null = -9) => ({
  blocos, segundosPorBloco: BLOCO, inicioSegundos: 180, loudnessDb, duracaoSegundos: 210,
});
const repetir = (n: number, v: number) => Array.from({ length: n }, () => v);

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('Fim da faixa:');

verificar('o limiar é relativo à loudness quando ela existe', () => {
  assert.equal(limiarDeSilencio(-9), -29);
  // Numa faixa baixinha o portão relativo cairia abaixo do chão: fica o chão.
  assert.equal(limiarDeSilencio(-50), -55);
  assert.equal(limiarDeSilencio(null), -55);
});

verificar('encontra o fim antes de uma cauda de silêncio', () => {
  // 50 blocos de música (20 s) e 25 de silêncio (10 s).
  const r = fimMusicalDaFaixa(cauda([...repetir(50, -12), ...repetir(25, -80)]));
  assert.equal(r, 180 + 50 * BLOCO, `deu ${r}`);
});

verificar('um fade GRAVADO conta como fim, e é o que o limiar absoluto perdia', () => {
  // Desce de -12 para -45 dBFS: nunca chega perto de -55, mas passa o portão
  // relativo (-29) a meio do fade.
  const fade = [40, 35, 30, 25, 20, 15, 12, 9, 6, 3].map((_, i) => -12 - i * 4);
  const r = fimMusicalDaFaixa(cauda([...repetir(40, -12), ...fade]));
  assert.notEqual(r, null, 'não viu o fade');
  assert.ok(r! < 180 + 50 * BLOCO, 'o fim ficou depois do fade começar');
});

verificar('uma faixa que acaba a tocar não é cortada', () => {
  assert.equal(fimMusicalDaFaixa(cauda(repetir(75, -12))), null);
});

verificar('um intervalo curto no meio não conta como fim', () => {
  // Um bloco calado a meio, música até ao fim.
  const b = repetir(75, -12); b[30] = -80;
  assert.equal(fimMusicalDaFaixa(cauda(b)), null);
});

verificar('menos de um segundo de cauda não vale a pena', () => {
  // Dois blocos vazios = 0,8 s. Abaixo do mínimo.
  assert.equal(fimMusicalDaFaixa({ ...cauda([...repetir(73, -12), -80, -80]), duracaoSegundos: 210 }), null);
});

verificar('cauda toda vazia não se adivinha', () => {
  assert.equal(fimMusicalDaFaixa(cauda(repetir(75, -90))), null);
});

verificar('sem blocos não há decisão', () => {
  assert.equal(fimMusicalDaFaixa(cauda([])), null);
});

verificar('valores impossíveis contam como vazio e não rebentam', () => {
  const r = fimMusicalDaFaixa(cauda([...repetir(50, -12), ...repetir(25, -Infinity)]));
  assert.equal(r, 180 + 50 * BLOCO);
});

verificar('sem loudness usa só o chão absoluto', () => {
  // -40 dBFS passa o chão (-55) mas falharia um portão relativo a -29.
  assert.equal(fimMusicalDaFaixa(cauda([...repetir(50, -12), ...repetir(25, -40)], null)), null);
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nFim da faixa: todos os casos passaram.');

/**
 * O acerto de andamento do AutoMix fica até ao fim da faixa (31/10).
 *
 * O relaxe da 5.4.7 voltava à velocidade da faixa em 2 a 5 passos, e cada
 * passo era uma escrita de velocidade num AVPlayer a tocar: um corte. O João
 * ouviu a música seguinte "cortar 4 ou 5 vezes e depois continuar normal".
 * Agora não se escreve nada na faixa que se ouve. A conta é pura
 * (`lib/velocidadeDoMotor.ts`); a ligação ao leitor lê-se como TEXTO, como no
 * `test-automix.ts`.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-acerto-que-fica.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACERTO_MINIMO, acertoEmVigor, acertoQueFica, velocidadeQueSeOuve,
} from '../src/lib/velocidadeDoMotor.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const LEITOR = ler('src/components/YouTubePlayerView.tsx');
const entre = (de: string, ate: string) => {
  const i = LEITOR.indexOf(de);
  assert.ok(i >= 0, `não encontrei ${de}`);
  const j = LEITOR.indexOf(ate, i + de.length);
  assert.ok(j > i, `não encontrei ${ate} depois de ${de}`);
  return LEITOR.slice(i, j);
};

console.log('\no acerto que fica');
caso('entrou a 0,9607 com a dela a 1: fica a 0,9607', () => {
  assert.deepEqual(acertoQueFica('a', 0.9607, 1), { sourceId: 'a', taxa: 0.9607, dela: 1 });
});
caso('a subir sobre uma velocidade da faixa (0,972 com a dela a 0,95)', () => {
  assert.deepEqual(acertoQueFica('b', 0.972, 0.95), { sourceId: 'b', taxa: 0.972, dela: 0.95 });
});
caso(`até ${ACERTO_MINIMO * 100} % não há acerto que se ouça: fica a dela, como sempre`, () => {
  assert.equal(acertoQueFica('a', 0.998, 1), null);
  assert.equal(acertoQueFica('a', 1, 1), null);
  assert.equal(acertoQueFica('a', 1.003, 1), null);
});
caso('números que não são velocidades não dão acerto', () => {
  assert.equal(acertoQueFica('a', NaN, 1), null);
  assert.equal(acertoQueFica('a', 1, Infinity), null);
  assert.equal(acertoQueFica('a', 0, 1), null);
  assert.equal(acertoQueFica('a', -1, 1), null);
});

console.log('\nquando vale');
const acerto = acertoQueFica('a', 0.9607, 1)!;
caso('a mesma faixa, o mesmo pedido e o motor à acertada (em Float)', () => {
  assert.ok(acertoEmVigor(acerto, 'a', 1, 0.9607));
  assert.ok(acertoEmVigor(acerto, 'a', 1, 0.96069997549057));
});
caso('outra faixa, outro pedido de velocidade ou nenhum acerto: não vale', () => {
  assert.ok(!acertoEmVigor(acerto, 'b', 1, 0.9607));
  assert.ok(!acertoEmVigor(acerto, 'a', 1.1, 0.9607));
  assert.ok(!acertoEmVigor(null, 'a', 1, 0.9607));
});
caso('o motor já voltou à dela (um play depois de uma pausa escreve-a): não vale', () => {
  assert.ok(!acertoEmVigor(acerto, 'a', 1, 1));
  assert.ok(!acertoEmVigor(acerto, 'a', 1, NaN));
});
caso('a velocidade que se ouve é a acertada só enquanto vale', () => {
  assert.equal(velocidadeQueSeOuve(acerto, 'a', 1, 0.9607), 0.9607);
  assert.equal(velocidadeQueSeOuve(acerto, 'a', 1, 1), 1);
  assert.equal(velocidadeQueSeOuve(acerto, 'b', 0.95, 0.95), 0.95);
  assert.equal(velocidadeQueSeOuve(null, 'a', 1.2, 1.2), 1.2);
});

console.log('\na ligação ao leitor');
caso('a que entra fica à velocidade acertada, sem escrever nada', () => {
  const troca = entre('const acerto = acertoQueFica(track.sourceId, entra.playbackRate, alvo);', '} else {');
  assert.match(troca, /acertoRef\.current = acerto;/);
  assert.match(troca, /if \(!entra\.playing\) entra\.play\(\);/);
  assert.ok(!/tocarNaVelocidade|atualizarVelocidadeDoMotor|aplicarVelocidadeNativa|playbackRate\s*=[^=]/.test(troca), 'nenhuma escrita de velocidade');
});
caso('sem acerto (o crossfade de sempre, a Jam, seguir um amigo) é o caminho de antes', () => {
  assert.match(LEITOR, /if \(acerto && !useOuvirJuntos\.getState\(\)\.sessao && !ritmoDeQuemSigo\(\)\) \{/);
  assert.match(LEITOR, /\} else \{\n\s+acertoRef\.current = null;\n\s+tocarNaVelocidade\(entra,alvo,aplicarVelocidadeNativa\);/);
});
caso('o efeito que aplica a velocidade da loja respeita o acerto, e outro pedido acaba-o', () => {
  assert.match(LEITOR, /if \(acertoEmVigor\(acerto, track\.sourceId, playbackRate, player\.playbackRate\)\) \{\n[^\n]*\n\s+return;\n\s+\}\n\s+acertoRef\.current = null;/);
});
caso('nenhum relógio de passos: a única mudança de velocidade a meio de uma faixa é a do efeito', () => {
  assert.ok(!/darPassoDoRelaxe|planoDoRelaxe|acabarRelaxe/.test(LEITOR), 'o relaxe saiu');
  assert.equal(LEITOR.match(/atualizarVelocidadeDoMotor\(/g)?.length, 1, 'só o efeito da loja');
});
caso('uma passagem nova não escreve na que sai: acaba à velocidade em que está', () => {
  const comeco = entre('const comecarPassagem = (seguinte: Track) => {', 'tocarNaVelocidade(motorEmEspera');
  assert.ok(!/atualizarVelocidadeDoMotor|aplicarVelocidadeNativa\(player|player\.playbackRate\s*=[^=]/.test(comeco), 'nada na que sai');
});
caso('a passagem seguinte compara os andamentos à velocidade que se ouve', () => {
  assert.match(LEITOR, /const taxaSai = velocidadeQueToca\(\);/);
  assert.match(LEITOR, /rateSai: taxaSai, rateEntra: taxaEntra,/);
  assert.match(LEITOR, /dobra: \{ semitons: plano\.semitons, taxa: velocidadeQueToca\(\), passos: 0 \}/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

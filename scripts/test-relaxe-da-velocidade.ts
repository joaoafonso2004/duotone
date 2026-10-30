/**
 * A velocidade a voltar aos poucos depois de uma passagem do AutoMix (30/10).
 *
 * O relatório de 30/10 mostra, no fim das passagens "na batida", a faixa que
 * agora se ouve a saltar de velocidade ("expo-video changed its rate 0.96 -> 1",
 * "0.972 -> 0.95"): o acerto de andamento (até 4 %, 0,7 de semitom no
 * `.varispeed`) era largado de uma vez. A conta é pura (`lib/velocidadeDoMotor.ts`);
 * a ligação ao leitor lê-se como TEXTO, como no `test-automix.ts`.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-relaxe-da-velocidade.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  passosDevidos, planoDoRelaxe, RELAXE_DURACAO_S, RELAXE_PASSOS_MAXIMOS, velocidadeDoPasso,
} from '../src/lib/velocidadeDoMotor.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const LEITOR = ler('src/components/YouTubePlayerView.tsx');

console.log('\no plano do relaxe');
caso('0,961 para 1: quatro passos de cerca de 1 %', () => {
  const p = planoDoRelaxe(0.961, 1)!;
  assert.equal(p.passos, 4);
  assert.equal(p.duracaoS, RELAXE_DURACAO_S);
  assert.deepEqual([1, 2, 3, 4].map((k) => velocidadeDoPasso(p, k)), [0.97, 0.98, 0.99, 1]);
});
caso('0,972 para 0,95 (a descer): três passos, e o último é exatamente o destino', () => {
  const p = planoDoRelaxe(0.972, 0.95)!;
  assert.equal(p.passos, 3);
  const taxas = [1, 2, 3].map((k) => velocidadeDoPasso(p, k));
  assert.equal(taxas[2], 0.95);
  assert.ok(taxas[0] <= 0.972 && taxas[0] >= taxas[1] && taxas[1] >= taxas[2], `desce sem voltar atrás: ${taxas}`);
});
caso('menos de 0,4 % não vale a pena: muda-se de uma vez, como sempre', () => {
  assert.equal(planoDoRelaxe(0.998, 1), null);
  assert.equal(planoDoRelaxe(1, 1), null);
  assert.equal(planoDoRelaxe(1.003, 1), null);
});
caso('poucos passos (2 a 5): cada mudança de velocidade num AVPlayer pode dar um corte curto', () => {
  assert.equal(planoDoRelaxe(1, 1.006)!.passos, 2, 'mínimo dois');
  assert.equal(planoDoRelaxe(0.8, 1)!.passos, RELAXE_PASSOS_MAXIMOS, 'e no máximo cinco');
});
caso('números que não são velocidades não dão plano', () => {
  assert.equal(planoDoRelaxe(NaN, 1), null);
  assert.equal(planoDoRelaxe(1, Infinity), null);
  assert.equal(planoDoRelaxe(0, 1), null);
  assert.equal(planoDoRelaxe(-1, 1), null);
});
caso('nenhum passo ultrapassa o destino, em nenhum par de velocidades de uma lista real', () => {
  for (const de of [0.9, 0.93, 0.961, 0.972, 1.004, 1.039, 1.1]) {
    for (const para of [0.9, 0.95, 1, 1.05, 1.1]) {
      const p = planoDoRelaxe(de, para);
      if (!p) continue;
      let antes = de;
      for (let k = 1; k <= p.passos; k++) {
        const t = velocidadeDoPasso(p, k);
        const sobe = para > de;
        assert.ok(sobe ? t >= antes - 1e-9 && t <= para + 1e-9 : t <= antes + 1e-9 && t >= para - 1e-9, `${de}->${para} passo ${k}: ${t}`);
        antes = t;
      }
      assert.equal(antes, velocidadeDoPasso(p, p.passos));
      assert.equal(velocidadeDoPasso(p, p.passos), Math.round(para * 100) / 100);
    }
  }
});

console.log('\no relógio dos passos');
caso('um passo de cada vez, a intervalos iguais, até aos 10 s', () => {
  const p = planoDoRelaxe(0.961, 1)!;
  assert.equal(passosDevidos(p, 0), 0);
  assert.equal(passosDevidos(p, 2.49), 0);
  assert.equal(passosDevidos(p, 2.5), 1);
  assert.equal(passosDevidos(p, 9.99), 3);
  assert.equal(passosDevidos(p, 10), 4);
  assert.equal(passosDevidos(p, 600), 4, 'nunca mais do que os passos todos');
});
caso('um relógio que anda para trás (um seek) ou que não é número não dá passos', () => {
  const p = planoDoRelaxe(0.961, 1)!;
  assert.equal(passosDevidos(p, -3), 0);
  assert.equal(passosDevidos(p, NaN), 0);
});

console.log('\na ligação ao leitor');
caso('a que entra fica à velocidade acertada, sem escrever nada, e volta pelo relaxe', () => {
  assert.match(LEITOR, /const relaxe = planoDoRelaxe\(entra\.playbackRate, arredondarRate\(alvo\)\);/);
  assert.match(LEITOR, /relaxeRef\.current = \{ sourceId: track\.sourceId, plano: relaxe, dados: 0, desdeS: null \};\n\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+if \(!entra\.playing\) entra\.play\(\);/);
});
caso('sem acerto (o crossfade de sempre, o Jam, seguir um amigo) é o caminho de antes', () => {
  assert.match(LEITOR, /if \(relaxe && !useOuvirJuntos\.getState\(\)\.sessao && !ritmoDeQuemSigo\(\)\) \{/);
  assert.match(LEITOR, /\} else \{\n\s+relaxeRef\.current = null;\n\s+tocarNaVelocidade\(entra,alvo,aplicarVelocidadeNativa\);/);
});
caso('o efeito que aplica a velocidade da loja respeita o relaxe, e outro pedido cancela-o', () => {
  assert.match(LEITOR, /relaxe\.sourceId === track\.sourceId && relaxe\.plano\.para === arredondarRate\(playbackRate\)/);
  assert.match(LEITOR, /\(no jump after the mix\)`\);\n\s+return;\n\s+\}\n\s+relaxeRef\.current = null;/);
});
caso('os passos andam no `timeUpdate` (com o ecrã bloqueado os temporizadores param) e cada um é uma mudança normal', () => {
  assert.match(LEITOR, /darPassoDoRelaxe\(currentTime\);/);
  assert.match(LEITOR, /atualizarVelocidadeDoMotor\(player, taxa, aplicarVelocidadeNativa\);/);
  assert.ok(!/const darPassoDoRelaxe[\s\S]{0,1500}setTimeout/.test(LEITOR.slice(LEITOR.indexOf('const darPassoDoRelaxe'), LEITOR.indexOf('const acabarRelaxe'))), 'nada de temporizadores');
});
caso('outra faixa ou outra velocidade da loja acaba o relaxe sem aplicar nada', () => {
  assert.match(LEITOR, /if \(r\.sourceId !== track\.sourceId \|\| arredondarRate\(usePlayer\.getState\(\)\.playbackRate\) !== r\.plano\.para\) \{\n\s+relaxeRef\.current = null;\n\s+return;/);
});
caso('uma passagem nova a meio acaba o relaxe de vez, antes de começar', () => {
  assert.match(LEITOR, /const comecarPassagem = \(seguinte: Track\) => \{\n\s+const st = usePlayer\.getState\(\);\n\s+acabarRelaxe\(\);/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

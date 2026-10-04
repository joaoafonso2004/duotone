/**
 * O fade-in de 1 s só onde serve -- src/lib/fadeDeEntrada.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-fade-de-entrada.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duracaoDoFade, entraSemFade, FADE_DE_ARRANQUE_MS, FADE_DE_RETOMA_MS, JANELA_DO_FIM_NATURAL_MS } from '../src/lib/fadeDeEntrada.ts';

const agora = 1_000_000;
const fim = { de: 'a', em: agora - 800 };

assert.equal(entraSemFade(fim, 'b', agora, null), true, 'a anterior acabou sozinha: a seguinte entra inteira');
assert.equal(entraSemFade(fim, 'b', agora, 0), true, 'a partir do início, também');
assert.equal(entraSemFade(null, 'b', agora, null), false, 'escolhida à mão (toque, skip): fica o fade');
assert.equal(entraSemFade(fim, 'a', agora, null), false, 'a mesma faixa outra vez não é passagem');
assert.equal(entraSemFade(fim, 'b', agora, 90_000), false, 'a retomar a meio: fica o fade');
assert.equal(entraSemFade({ de: 'a', em: agora - JANELA_DO_FIM_NATURAL_MS - 1 }, 'b', agora, null), false,
  'um fim antigo não decide por uma música escolhida muito depois');
assert.equal(entraSemFade({ de: 'a', em: agora - JANELA_DO_FIM_NATURAL_MS + 1 }, 'b', agora, null), true,
  'dá tempo para descarregar a seguinte');
assert.equal(entraSemFade({ de: 'a', em: agora + 5000 }, 'b', agora, null), false, 'um relógio que andou para trás não conta');

// O motor marca o fim natural nos DOIS sítios onde a faixa acaba sozinha, e
// consome-o no arranque.
const motor = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8');
assert.equal(motor.match(/fimNaturalRef\.current = \{ de: track\.sourceId/g)?.length, 2,
  'fim do motor (playToEnd) e fim silencioso');
assert.match(motor, /entraSemFade\(fimNaturalRef\.current/, 'o arranque pergunta à regra');
assert.match(motor, /fimNaturalRef\.current = null;/, 'e consome o fim, para não decidir pela seguinte');

console.log('Fade de entrada: passou.');

// Quanto dura o fade quando fica (4/10): curto numa música escolhida à mão,
// o segundo inteiro a retomar a meio.
assert.equal(duracaoDoFade(null), FADE_DE_ARRANQUE_MS, 'um skip entra em 250 ms');
assert.equal(duracaoDoFade(0), FADE_DE_ARRANQUE_MS);
assert.equal(duracaoDoFade(1500), FADE_DE_ARRANQUE_MS, 'até 1,5 s ainda é o início');
assert.equal(duracaoDoFade(90_000), FADE_DE_RETOMA_MS, 'a meio da música, o segundo inteiro');
assert.ok(FADE_DE_ARRANQUE_MS <= 300, 'mais do que isto e o skip volta a parecer lento');
{
  const leitor = (await import('node:fs')).readFileSync('src/components/YouTubePlayerView.tsx', 'utf8');
  assert.match(leitor, /fadeIn\(duracaoDoFade\(resumeMs\)\)/, 'o arranque usa a duração curta');
}
console.log('fade de entrada: a duração passou.');


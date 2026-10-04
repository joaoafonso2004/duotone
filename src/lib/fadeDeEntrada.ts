/**
 * Se a faixa que arranca entra com o fade-in de 1 s ou já no volume dela (27/9).
 *
 * O fade-in corria em TODAS as faixas que arrancavam a tocar. Quando a
 * anterior acabou sozinha e não houve crossfade (a seguinte não estava
 * descarregada, jam, repeat, Opus por provar, crossfade a 0), isso fazia o
 * primeiro segundo da música entrar abafado, a somar ao silêncio da troca --
 * num álbum ao vivo ou numa mix ouvia-se a costura.
 *
 * O fade continua onde serve: quando a pessoa escolhe uma música (um toque, um
 * skip) e quando a faixa retoma a meio, que é onde entrar de repente soa a
 * corte.
 *
 * Sem imports: testado em Node puro (scripts/test-fade-de-entrada.ts).
 */

/** A anterior acabou sozinha (fim do motor ou fim silencioso). */
export interface FimNatural {
  /** A faixa que acabou. */
  de: string;
  /** Quando, no relógio deste aparelho. */
  em: number;
}

/**
 * Até quanto tempo depois do fim a faixa seguinte ainda é "a seguinte". Cobre
 * o download da seguinte quando ela não estava adiantada, e não deixa um fim
 * antigo decidir por uma música escolhida muito depois.
 */
export const JANELA_DO_FIM_NATURAL_MS = 30_000;

/** Acima disto a faixa retoma a meio (o mesmo limite do `beginPlayback`). */
const RETOMA_A_MEIO_MS = 1500;

/**
 * Quanto dura o fade quando ele fica (4/10). Era sempre 1 s, linear: os
 * primeiros 300 ms de uma música escolhida à mão saíam abaixo de um terço do
 * volume, e um skip parecia demorar -- o som estava lá, mas não se ouvia.
 * Escolhida à mão, a partir do início, entra em 250 ms (o bastante para não
 * estalar); a retomar a meio fica o segundo inteiro, onde entrar de repente
 * soa a corte.
 */
export const FADE_DE_ARRANQUE_MS = 250;
export const FADE_DE_RETOMA_MS = 1000;

export function duracaoDoFade(retomaEmMs: number | null): number {
  return retomaEmMs != null && retomaEmMs > RETOMA_A_MEIO_MS ? FADE_DE_RETOMA_MS : FADE_DE_ARRANQUE_MS;
}

export function entraSemFade(
  fim: FimNatural | null,
  faixa: string,
  agora: number,
  retomaEmMs: number | null,
): boolean {
  if (!fim) return false;
  // A mesma faixa outra vez (repeat da fila com uma música só) não é passagem.
  if (fim.de === faixa) return false;
  if (agora - fim.em > JANELA_DO_FIM_NATURAL_MS || agora < fim.em) return false;
  // A meio da música entrar de repente soa a corte: aí o fade fica.
  if (retomaEmMs != null && retomaEmMs > RETOMA_A_MEIO_MS) return false;
  return true;
}

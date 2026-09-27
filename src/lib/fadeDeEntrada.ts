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

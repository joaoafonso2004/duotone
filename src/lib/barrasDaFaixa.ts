/**
 * As barrinhas na capa da música que toca (3/10, variante A de
 * `docs/base-e-barrinhas.html`). Três barras a mexer; em pausa encolhem até
 * serem três pontos -- reticências -- e voltam a crescer ao tocar (João, 3/10).
 * Sem imports: as contas vivem aqui, o desenho no `components/BarrasDaFaixa.tsx`.
 *
 * Cada barra é uma CÁPSULA feita de três peças: um ponto em cima, um em baixo
 * e um retângulo no meio. A tocar, os pontos afastam-se e o meio estica; em
 * pausa, os pontos juntam-se e o meio desaparece, e o que fica é um círculo.
 * Esticar uma barra só com `scaleY` achatava as pontas redondas, e o ponto
 * final não era redondo.
 */

/** O diâmetro de um ponto (e a largura de uma barra). */
export const LARGURA = 4;
export const ALTURA_MAXIMA = 20;
export const ALTURA_MINIMA = 6;
/** Da barra ao ponto e de volta. */
export const PASSAGEM_MS = 260;

/** Cada barra com o seu ritmo, para nunca andarem juntas. */
export const BARRAS = [
  { duracaoMs: 820, desfase: 0 },
  { duracaoMs: 1060, desfase: 0.38 },
  { duracaoMs: 920, desfase: 0.22 },
] as const;

/** Com "Reduzir movimento": paradas a alturas diferentes (fases da onda). */
export const FASES_PARADAS = [0.35, 0.5, 0.15] as const;

/** A altura da barra `i` na fase `t` (0..1), uma volta inteira por fase. */
export function alturaNaFase(i: number, t: number): number {
  const d = BARRAS[i]?.desfase ?? 0;
  return ALTURA_MINIMA + (ALTURA_MAXIMA - ALTURA_MINIMA) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t + d)));
}

/**
 * A onda da barra `i` em amostras, para o motor nativo (que só interpola por
 * troços): quanto a barra passa do ponto (altura - LARGURA). Acaba onde começa,
 * e por isso a volta seguinte do `Animated.loop` não dá salto.
 */
export function amostrasDaOnda(i: number, n = 16) {
  const inputRange = Array.from({ length: n + 1 }, (_, k) => k / n);
  return { inputRange, outputRange: inputRange.map((t) => alturaNaFase(i, t) - LARGURA) };
}

/** As três peças de uma cápsula com `extra` = altura - LARGURA. */
export function pecasDaCapsula(extra: number) {
  return {
    /** Os pontos sobem e descem metade do extra, cada um para o seu lado. */
    afastamento: extra / 2,
    /** O meio tem ALTURA_MAXIMA - LARGURA de altura, e escala até ao extra. */
    escalaDoMeio: extra / (ALTURA_MAXIMA - LARGURA),
  };
}

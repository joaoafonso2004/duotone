/**
 * O ecrã ambiente (25/11, pedido do João): com a música a tocar e ninguém a mexer
 * na app, a janela do PC passa sozinha ao modo limpo em ecrã inteiro e fica a
 * tocar; ao passar o rato por cima, volta ao normal.
 *
 * Aqui só as decisões, sem DOM (`scripts/test-ecra-ambiente.ts`). Quem mede a
 * janela é a casca (`desktop/src/ambiente.rs`); quem entra e sai é o
 * `desktop/ModoLimpo.web.tsx`.
 */

export const AMBIENTE = {
  /** Quanto tempo sem tocar na app (e, com ela à frente, no computador) antes de entrar. */
  esperaS: 60,
  /** De quanto em quanto se pergunta à casca, e só depois da espera: IPC local, sem rede. */
  verACadaMs: 5000,
  /** O modo limpo a aparecer por cima da app, ainda na janela, antes de crescer. */
  apagarMs: 520,
  /** O conteúdo apaga-se à volta da mudança de tamanho, para não se ver a saltar. */
  mudarMs: 160,
  /** Logo depois de crescer o Chromium manda um `mousemove` sem o rato mexer. */
  gracaMs: 900,
  /** Quanto o rato tem de andar para contar como "passou por cima". */
  distanciaPx: 10,
} as const;

/** O que a casca diz da janela (`ambiente_ler`). */
export type EstadoDaJanela = {
  visivel: boolean;
  minimizada: boolean;
  /** A janela da frente é desta app (a principal ou o mini leitor). */
  emPrimeiroPlano: boolean;
  /** A janela da frente é de outro programa e está noutro monitor. */
  outroMonitor: boolean;
  /** Outra janela por cima desta tapa-lhe um bom bocado. */
  tapada: boolean;
  /** Sem rato nem teclado no computador inteiro. */
  segundosSemUso: number;
};

export type EstadoDaApp = {
  aTocar: boolean;
  /** Desde o último rato, tecla ou roda dentro da app. */
  segundosSemMexer: number;
  modoLimpoAberto: boolean;
  /** Um diálogo, um menu ou uma caixa de texto com o foco: alguém está a meio de algo. */
  ocupada: boolean;
};

/**
 * Entra só em dois casos:
 * - a app está noutro monitor e quem trabalha está no outro, e nada a tapa;
 * - a app é a janela da frente e o computador está parado (é o caso de um monitor só).
 *
 * Nunca quando a app está atrás de outra janela no mesmo monitor: aí taparia
 * aquilo que a pessoa está a ver.
 */
export function podeEntrar(j: EstadoDaJanela | null, a: EstadoDaApp): boolean {
  if (!a.aTocar || a.modoLimpoAberto || a.ocupada) return false;
  if (a.segundosSemMexer < AMBIENTE.esperaS) return false;
  if (!j || !j.visivel || j.minimizada || j.tapada) return false;
  if (j.emPrimeiroPlano) return j.segundosSemUso >= AMBIENTE.esperaS;
  return j.outroMonitor;
}

/** Vale a pena perguntar à casca? Só depois da espera e com o resto a dar. */
export function valePerguntar(a: EstadoDaApp): boolean {
  return a.aTocar && !a.modoLimpoAberto && !a.ocupada && a.segundosSemMexer >= AMBIENTE.esperaS;
}

export type Ponto = { x: number; y: number };

/**
 * O rato passou por cima? Depois da graça e a andar mais do que a distância
 * desde onde estava quando a graça acabou: a janela a crescer debaixo de um rato
 * parado não o tira de lá.
 */
export function passouPorCima(desde: Ponto | null, agora: Ponto): boolean {
  if (!desde) return false;
  return Math.hypot(agora.x - desde.x, agora.y - desde.y) >= AMBIENTE.distanciaPx;
}

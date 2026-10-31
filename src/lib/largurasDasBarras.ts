/**
 * As larguras das duas barras do PC (31/10, o João: "o Spotify tem 2 barras ajustáveis
 * lateralmente, nós não"): a lateral da esquerda e o painel da fila e da letra à direita.
 * Puro, para o teste a correr em Node; quem arrasta e quem guarda vivem em
 * `desktop/SeparadorDeLargura.web.tsx` e `desktop/estadoDasBarras.web.ts`.
 *
 * - **A lateral** vai de 200 a 420 px e, puxada para menos de metade do caminho até à
 *   régua (136 px), recolhe-se numa **régua de 72 px** só com ícones, como a do Spotify.
 * - **O painel** vai de 280 a 560 px.
 * - **A página nunca fica com menos de 520 px**: o limite de cada barra desce com a janela.
 */

export type Limites = {
  minima: number;
  maxima: number;
  /** A largura da régua, se a barra se recolhe (só a lateral). */
  recolhida?: number;
};

export const LATERAL = { padrao: 232, minima: 200, maxima: 420, recolhida: 72 } as const;
export const PAINEL = { padrao: 340, minima: 280, maxima: 560 } as const;
/** O que a página guarda para si, com as duas barras abertas. */
export const PAGINA_MINIMA = 520;
/** Abaixo disto a janela é estreita: o painel passa a ficar por cima da página (PainelDoLeitor). */
export const JANELA_ESTREITA = 1100;

/** Os passos do teclado no separador: as setas e, com Shift, três vezes mais. */
export const PASSO = 16;
export const PASSO_GRANDE = 48;

export function limitesDaLateral(janela: number): Limites {
  const maxima = Math.max(LATERAL.minima, Math.min(LATERAL.maxima, Math.floor(janela * 0.35)));
  return { minima: LATERAL.minima, maxima, recolhida: LATERAL.recolhida };
}

/**
 * Os limites do painel dada a janela e a lateral que está a ocupar. Com a janela estreita o
 * painel fica por cima da página e pode crescer mais.
 */
export function limitesDoPainel(janela: number, lateral: number): Limites {
  const reserva = janela < JANELA_ESTREITA ? 120 : PAGINA_MINIMA;
  const maxima = Math.max(PAINEL.minima, Math.min(PAINEL.maxima, Math.floor(janela - lateral - reserva)));
  return { minima: PAINEL.minima, maxima };
}

/** A largura que se pediu, trazida para dentro dos limites; com régua, abaixo de metade do caminho recolhe. */
export function ajustar(pedida: number, l: Limites): number {
  if (!Number.isFinite(pedida)) return l.recolhida ?? l.minima;
  if (l.recolhida != null && pedida < (l.recolhida + l.minima) / 2) return l.recolhida;
  return Math.max(l.minima, Math.min(l.maxima, Math.round(pedida)));
}

/**
 * O que o teclado faz no separador: a largura nova, ou `null` se a tecla não é dele. `sinal` é o
 * lado de onde a barra cresce: +1 para a lateral (a seta para a direita alarga), -1 para o painel
 * (a seta para a esquerda alarga). Da régua, o primeiro passo para fora vai à largura mínima.
 */
export function teclar(atual: number, tecla: string, shift: boolean, sinal: 1 | -1, l: Limites): number | null {
  if (tecla === 'Home') return l.recolhida ?? l.minima;
  if (tecla === 'End') return l.maxima;
  if (tecla !== 'ArrowLeft' && tecla !== 'ArrowRight') return null;
  const passo = (shift ? PASSO_GRANDE : PASSO) * (tecla === 'ArrowRight' ? 1 : -1) * sinal;
  if (l.recolhida != null && atual <= l.recolhida) return passo > 0 ? l.minima : l.recolhida;
  if (l.recolhida != null && passo < 0 && atual + passo < l.minima) return l.recolhida;
  return ajustar(atual + passo, l);
}

/** A lateral está recolhida na régua de ícones? */
export function lateralRecolhida(largura: number): boolean {
  return largura <= LATERAL.recolhida;
}

/** O que está guardado no aparelho: só números a sério (o resto volta ao de origem). */
export function lerLarguras(guardado: unknown): { lateral: number; painel: number } {
  const g = (guardado ?? {}) as { lateral?: unknown; painel?: unknown };
  const numero = (v: unknown, de: number) => (typeof v === 'number' && Number.isFinite(v) ? v : de);
  return {
    lateral: numero(g.lateral, LATERAL.padrao),
    painel: numero(g.painel, PAINEL.padrao),
  };
}

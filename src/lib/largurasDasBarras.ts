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
export function teclar(atual: number, tecla: string, shift: boolean, sinal: 1 | -1, l: Limites,
  passos: { passo: number; grande: number } = { passo: PASSO, grande: PASSO_GRANDE }): number | null {
  if (tecla === 'Home') return l.recolhida ?? l.minima;
  if (tecla === 'End') return l.maxima;
  if (tecla !== 'ArrowLeft' && tecla !== 'ArrowRight') return null;
  const passo = (shift ? passos.grande : passos.passo) * (tecla === 'ArrowRight' ? 1 : -1) * sinal;
  if (l.recolhida != null && atual <= l.recolhida) return passo > 0 ? l.minima : l.recolhida;
  if (l.recolhida != null && passo < 0 && atual + passo < l.minima) return l.recolhida;
  return ajustar(atual + passo, l);
}

/**
 * O painel do amigo no Social (22/11, a B4 de `.claude/planos/PLANO-SOCIAL-B4.md`): a música
 * dele, o Listen along e as próximas dele, à direita da conversa. Mais fino do que o painel da
 * fila ("B4 mas mais fina a barra, ou então ajustável"): começa nos 220 e vai de 180 a 360, com
 * passos mais finos no teclado (10, e 40 com Shift).
 */
export const PAINEL_DO_AMIGO = { padrao: 220, minima: 180, maxima: 360, passo: 10, passoGrande: 40 } as const;
/** Abaixo disto (a largura do Social) não há lugar para a lista, a conversa e o painel: não aparece. */
export const SOCIAL_COM_PAINEL = 1000;

export function limitesDoPainelDoAmigo(): Limites {
  return { minima: PAINEL_DO_AMIGO.minima, maxima: PAINEL_DO_AMIGO.maxima };
}

/** O guardado do painel do amigo: só um número a sério, já nos limites; o resto volta ao de origem. */
export function lerPainelDoAmigo(guardado: unknown): number {
  const g = (guardado ?? {}) as { amigo?: unknown };
  return typeof g.amigo === 'number' && Number.isFinite(g.amigo) ? ajustar(g.amigo, limitesDoPainelDoAmigo()) : PAINEL_DO_AMIGO.padrao;
}

/** O teclado na pega do painel do amigo (cresce para a esquerda, como o da fila). */
export function teclarPainelDoAmigo(atual: number, tecla: string, shift: boolean): number | null {
  return teclar(atual, tecla, shift, -1, limitesDoPainelDoAmigo(), { passo: PAINEL_DO_AMIGO.passo, grande: PAINEL_DO_AMIGO.passoGrande });
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

/**
 * A altura dos amigos na lateral (20/11, o João: "quando tenho muitos amigos online o pinned quase
 * que desaparece"). É uma FRAÇÃO da zona por baixo da conta, a que os amigos e os atalhos dividem:
 * os amigos crescem até lá e daí para a frente rolam por dentro, e os atalhos ficam com o resto.
 * Fração e não pixéis porque a janela muda muito de altura (maximizada ou não) e a divisão deve
 * acompanhá-la. A pega entre os dois (`desktop/SeparadorDosAmigos.web.tsx`) muda-a; os amigos
 * guardam sempre o título e um amigo à vista, e os atalhos o título e duas linhas.
 */
export const AMIGOS = { padrao: 0.45, minimaPx: 96, atalhosPx: 120 } as const;

/** A fração que dá `pedidaPx` de amigos numa zona de `zonaPx`, dentro dos limites. */
export function fracaoDosAmigos(pedidaPx: number, zonaPx: number): number {
  if (!Number.isFinite(zonaPx) || zonaPx <= 0 || !Number.isFinite(pedidaPx)) return AMIGOS.padrao;
  const maxima = Math.max(AMIGOS.minimaPx, zonaPx - AMIGOS.atalhosPx);
  const px = Math.max(AMIGOS.minimaPx, Math.min(maxima, pedidaPx));
  return Math.round(Math.min(1, px / zonaPx) * 1000) / 1000;
}

/**
 * A altura pedida ao mexer a pega `delta` px (positivo: para baixo). Parte da `borda` -- onde a pega
 * está de facto -- e não do limite guardado: com poucos amigos a borda fica acima dele, e subir a
 * pega encolhe logo a lista. Descer com a lista toda à vista não baixa o limite que já havia
 * (`limitePx`): só o sobe, quando se passa dele.
 */
export function alturaDosAmigos(borda: number, limitePx: number, delta: number): number {
  const pedida = borda + delta;
  return delta > 0 ? Math.max(limitePx, pedida) : pedida;
}

/** As setas para cima e para baixo na pega (16 px, com Shift 48); Home e End vão aos extremos. */
export function teclarAmigos(borda: number, limitePx: number, tecla: string, shift: boolean, zonaPx: number): number | null {
  if (tecla === 'Home') return fracaoDosAmigos(0, zonaPx);
  if (tecla === 'End') return fracaoDosAmigos(zonaPx, zonaPx);
  if (tecla !== 'ArrowUp' && tecla !== 'ArrowDown') return null;
  const passo = (shift ? PASSO_GRANDE : PASSO) * (tecla === 'ArrowDown' ? 1 : -1);
  return fracaoDosAmigos(alturaDosAmigos(borda, limitePx, passo), zonaPx);
}

/** A fração guardada: só um número entre 0 e 1; o resto volta à de origem. */
export function lerFracaoDosAmigos(guardado: unknown): number {
  return typeof guardado === 'number' && Number.isFinite(guardado) && guardado > 0 && guardado <= 1 ? guardado : AMIGOS.padrao;
}

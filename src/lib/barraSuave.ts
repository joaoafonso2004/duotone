/**
 * A barra de progresso do leitor anda sem saltos (27/9).
 *
 * A posição chega do motor uma vez por segundo, e a barra saltava de segundo
 * em segundo. Agora cada posição que chega lança uma animação NATIVA, linear,
 * até onde a música vai estar daqui a um passo; a seguinte corrige a partir de
 * onde a barra está. Um salto a sério (seek, faixa nova, pausa) vai direto.
 *
 * Sem imports: testado em Node puro (scripts/test-barra-suave.ts).
 */

/** Quanto tempo à frente se aponta: o ritmo a que a posição chega com a app à frente. */
export const PASSO_MS = 1000;
/** Uma diferença maior do que isto (em tempo de música) é um salto, não um desvio. */
export const SALTO_MS = 1500;

export interface Trajeto {
  de: number;
  para: number;
  inicio: number;
  duracao: number;
}

/** Onde a barra está agora, pelo trajeto em curso (fração 0..1). */
export function ondeVai(t: Trajeto | null, agora: number): number | null {
  if (!t) return null;
  if (t.duracao <= 0 || agora >= t.inicio + t.duracao) return t.para;
  if (agora <= t.inicio) return t.de;
  return t.de + (t.para - t.de) * ((agora - t.inicio) / t.duracao);
}

export interface Chegada {
  /** O trajeto anterior (ou null na primeira). */
  anterior: Trajeto | null;
  agora: number;
  posicaoMs: number;
  duracaoMs: number;
  aTocar: boolean;
  /** Velocidade de reprodução: a 0,8x a música anda 0,8 s por segundo. */
  ritmo: number;
}

/** O trajeto seguinte, e se a barra tem de saltar antes de o começar. */
export function proximoTrajeto(c: Chegada): { trajeto: Trajeto; saltar: boolean } {
  const fracao = c.duracaoMs > 0 ? Math.min(1, Math.max(0, c.posicaoMs / c.duracaoMs)) : 0;
  const esperado = ondeVai(c.anterior, c.agora);
  const limiar = c.duracaoMs > 0 ? SALTO_MS / c.duracaoMs : 0;
  const saltar = !c.aTocar || esperado == null || Math.abs(fracao - esperado) > limiar;
  const de = saltar ? fracao : esperado;
  if (!c.aTocar || c.duracaoMs <= 0) {
    return { trajeto: { de: fracao, para: fracao, inicio: c.agora, duracao: 0 }, saltar: true };
  }
  const ritmo = Number.isFinite(c.ritmo) && c.ritmo > 0 ? c.ritmo : 1;
  const para = Math.min(1, fracao + (PASSO_MS * ritmo) / c.duracaoMs);
  return { trajeto: { de, para, inicio: c.agora, duracao: PASSO_MS }, saltar };
}

/** Pequenos desvios não alteram o ritmo. O hook limita os seeks a dois por faixa. */
export const TOLERANCIA_MS = 600;

export type EstadoDaSessao = {
  /** Instante, no relógio do servidor, em que a faixa começou do zero. */
  comecouEmServidor: number | null;
  /** Onde ficou parada, quando está em pausa. */
  pausadaEmMs: number | null;
  aTocar: boolean;
  /** Para não pedir uma posição para lá do fim. 0 = desconhecida. */
  duracaoMs: number;
};

/**
 * Onde a sessão está agora, para quem pergunta com o relógio do servidor.
 *
 * `null` quando não há informação suficiente -- e aí não se corrige nada. Um
 * palpite aqui vira um seek para o sítio errado.
 */
export function posicaoDaSessao(
  s: EstadoDaSessao,
  agoraNoServidor: number
): number | null {
  if (!s.aTocar) {
    return s.pausadaEmMs != null && Number.isFinite(s.pausadaEmMs)
      ? Math.max(0, s.pausadaEmMs)
      : null;
  }
  if (s.comecouEmServidor == null || !Number.isFinite(s.comecouEmServidor)) return null;
  const bruta = agoraNoServidor - s.comecouEmServidor;
  if (!Number.isFinite(bruta)) return null;
  const positiva = Math.max(0, bruta);
  return s.duracaoMs > 0 ? Math.min(positiva, s.duracaoMs) : positiva;
}

export type Correcao =
  | { tipo: 'nada' }
  | { tipo: 'saltar'; paraMs: number };

/**
 * O que fazer, dado onde estamos e onde a sessão está.
 *
 * `desvio` positivo quer dizer que vamos À FRENTE e é preciso abrandar.
 */
export function correccaoNecessaria(entrada: {
  posicaoLocalMs: number;
  posicaoDaSessaoMs: number | null;
  aTocar: boolean;
  /** Falso enquanto o ficheiro ainda não está cá: não há nada a corrigir. */
  pronta: boolean;
}): Correcao {
  const { posicaoLocalMs, posicaoDaSessaoMs, aTocar, pronta } = entrada;
  if (!pronta || !aTocar || posicaoDaSessaoMs == null) return { tipo: 'nada' };
  if (!Number.isFinite(posicaoLocalMs) || !Number.isFinite(posicaoDaSessaoMs)) {
    return { tipo: 'nada' };
  }

  if (Math.abs(posicaoLocalMs - posicaoDaSessaoMs) <= TOLERANCIA_MS) return { tipo: 'nada' };
  return { tipo: 'saltar', paraMs: Math.max(0, posicaoDaSessaoMs) };
}

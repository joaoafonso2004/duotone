/**
 * A pose da capa flutuante do Now Playing do iPhone.
 *
 * Os números vivem aqui, fora do componente, para que a animação possa ser
 * afinada sem espalhar ângulos e tempos pelo JSX -- e para conseguirmos
 * verificar que a flutuação continua subtil.
 */

export type EstiloDaCapaIOS = 'floating' | 'simple';

export const CAPA_FLUTUANTE = {
  /** Distância para cada lado do centro: seis pontos no percurso inteiro. */
  amplitude: 3,
  /** Uma subida e uma descida completas, sem pausa nas extremidades. */
  cicloMs: 4600,
  /** A perspetiva e a inclinação da referência: presente, mas não teatral. */
  perspective: 950,
  rotateX: 7,
  rotateY: -11,
  // A diagonal visível da referência: o topo desce cerca de oito graus da
  // esquerda para a direita. X/Y dão a fuga; Z dá a silhueta inclinada.
  rotateZ: 8,
  scale: 0.91,
  /** Várias lâminas de um ponto fazem uma aresta contínua num ecrã Retina. */
  camadas: 10,
  profundidade: 13,
} as const;

export function deslocamentoDaCamada(indice: number): { x: number; y: number } {
  const i = Math.max(1, Math.min(CAPA_FLUTUANTE.camadas, Math.round(indice)));
  const parte = i / CAPA_FLUTUANTE.camadas;
  return {
    x: -CAPA_FLUTUANTE.profundidade * 0.72 * parte,
    y: CAPA_FLUTUANTE.profundidade * parte,
  };
}

/**
 * Migração do antigo efeito do iPhone.
 *
 * Quem tinha o glitch desligado ou estático fica com a capa simples; quem o
 * tinha reativo recebe o novo efeito. Numa instalação nova mostramos a nova
 * capa, que é a escolha desta versão.
 */
export function interpretarEstiloDaCapa(
  atual: string | null,
  glitchAntigo: string | null,
): EstiloDaCapaIOS {
  if (atual === 'simple' || atual === 'floating') return atual;
  return glitchAntigo === 'static' || glitchAntigo === 'off' ? 'simple' : 'floating';
}

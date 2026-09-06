import { create } from 'zustand';

/**
 * De onde a capa deve voar quando uma faixa começa a tocar.
 *
 * Existe uma store em vez de props porque a origem é medida numa linha de uma
 * lista qualquer -- Songs, Pesquisa, playlist, artista -- e é lida no
 * PlayerRoot, que está noutro ramo da árvore. Passar isto de mão em mão
 * obrigava a tocar em todos os ecrãs para uma coisa que é do player.
 */
export interface RectanguloDaCapa {
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** A imagem que a LINHA estava a mostrar. Ver a nota no PlayerRoot. */
  uri: string | null;
  /** Quando foi medida, em ms. */
  em: number;
}

interface Estado {
  origem: RectanguloDaCapa | null;
}

export const useOrigemDaCapa = create<Estado>(() => ({ origem: null }));

/**
 * Uma medição só serve se for RECENTE e estiver no ecrã.
 *
 * A lista pode rolar entre o toque e a animação, e uma origem velha faz a capa
 * vir de um sítio onde já não está nada -- pior do que não animar de todo.
 */
const VALIDADE_MS = 250;

export function guardarOrigem(r: Omit<RectanguloDaCapa, 'em'>): void {
  if (!(r.largura > 0) || !(r.altura > 0)) return;
  useOrigemDaCapa.setState({ origem: { ...r, em: Date.now() } });
}

export function limparOrigem(): void {
  if (useOrigemDaCapa.getState().origem) useOrigemDaCapa.setState({ origem: null });
}

/** A origem, se ainda valer. Devolve null quando não vale — e aí o player
 *  entra como sempre entrou. */
export function origemValida(
  altura: number,
  agora = Date.now()
): RectanguloDaCapa | null {
  const { origem } = useOrigemDaCapa.getState();
  if (!origem) return null;
  if (agora - origem.em > VALIDADE_MS) return null;
  // Fora do ecrã: a linha rolou, ou o toque veio de um sítio que já não se vê.
  if (origem.y + origem.altura < 0 || origem.y > altura) return null;
  return origem;
}

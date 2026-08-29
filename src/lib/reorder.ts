/**
 * A matemática de arrastar para reordenar. Sem DOM, sem React.
 *
 * É aqui que estes arrastares partem: um índice fora por um, ou a pré-visualização
 * a discordar do que fica depois de largar. Separado para ter teste em Node
 * puro (`scripts/test-reorder.ts`) — sem imports de runtime, como o
 * `lib/radio.ts`.
 */

/**
 * Para onde a linha vai, a partir do quanto o dedo já a arrastou.
 *
 * `Math.round` e não `floor`: a linha só troca de lugar quando passa METADE da
 * linha vizinha, que é o que faz o gesto parecer que "engata" em vez de
 * escorregar.
 */
export function indiceAlvo(
  indicePartida: number,
  deslocamentoY: number,
  alturaLinha: number,
  total: number,
): number {
  if (!(alturaLinha > 0) || total <= 0) return indicePartida;
  const bruto = indicePartida + Math.round(deslocamentoY / alturaLinha);
  return Math.max(0, Math.min(total - 1, bruto));
}

/**
 * Quantas linhas é que ESTA linha desliza, enquanto outra está a ser arrastada
 * por cima dela. É isto que desenha a pré-visualização: o buraco abre-se no
 * destino e as vizinhas afastam-se, em vez de aparecer uma barra a dizer onde
 * vai cair.
 *
 * Devolve -1 (sobe uma linha), 0 (fica) ou +1 (desce uma linha).
 */
export function deslize(indice: number, de: number, para: number): number {
  if (de === para || indice === de) return 0;
  // A arrastada foi para baixo: quem estava entre as duas sobe uma linha.
  if (de < para) return indice > de && indice <= para ? -1 : 0;
  // Foi para cima: quem estava entre as duas desce uma linha.
  return indice >= para && indice < de ? 1 : 0;
}

/**
 * A lista como fica depois de largar. Não é usada para desenhar — a
 * pré-visualização é feita com `deslize`, que não recria arrays a cada
 * fotograma — mas é o que define a verdade, e o teste compara as duas para
 * garantir que aquilo que se vê é aquilo que acontece.
 */
export function reordenar<T>(lista: readonly T[], de: number, para: number): T[] {
  const saida = lista.slice();
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return saida;
  const [movido] = saida.splice(de, 1);
  saida.splice(para, 0, movido);
  return saida;
}

/**
 * Um arrasto mínimo não é um arrasto: é um clique com a mão a tremer. Sem este
 * limiar, tocar numa faixa para a ouvir acabava a reordenar a fila.
 */
export const LIMIAR_ARRASTO_PX = 4;

export function comecouAArrastar(deslocamentoY: number): boolean {
  return Math.abs(deslocamentoY) >= LIMIAR_ARRASTO_PX;
}

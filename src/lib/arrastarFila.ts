/**
 * As contas de arrastar uma linha numa lista de altura fixa.
 *
 * Vivem aqui, longe do React e do `Animated`, porque são o sítio onde este
 * género de coisa costuma correr mal: um arredondamento para o lado errado faz
 * a música cair uma posição ao lado do sítio onde o dedo a largou, e isso é um
 * bug que só se vê a olho e que ninguém consegue reproduzir de propósito.
 *
 * Sem imports nenhuns, de propósito -- `scripts/test-arrastar-fila.ts` corre
 * isto em Node puro.
 */

/**
 * Onde a linha vai ficar quando o dedo largar.
 *
 * `Math.round` e não `Math.floor`: o lugar troca-se a MEIO da linha, que é
 * onde o olho diz que trocou. Com `floor` era preciso arrastar uma linha
 * inteira para a mexer uma posição, e o gesto parecia preguiçoso.
 */
export function destinoDoArrasto(
  de: number, dy: number, altura: number, total: number
): number {
  if (!Number.isFinite(dy) || altura <= 0 || total <= 0) return de;
  const alvo = de + Math.round(dy / altura);
  return Math.min(total - 1, Math.max(0, alvo));
}

/**
 * A partir de que deslocamento a linha `j` cede o lugar a quem vem a caminho.
 *
 * SÓ para a animação: é daqui que sai o intervalo de entrada da interpolação.
 * Quem manda no resultado é o `destinoDoArrasto`, e o `desvioDaLinha` deriva
 * dele em vez de repetir a conta -- ver lá porquê.
 *
 * Os dois lados não são simétricos, e isso é de propósito. O `Math.round`
 * arredonda os meios para CIMA (`-0.5` dá zero, `+0.5` dá um), por isso o
 * limiar de descida é alcançável e o de subida é estritamente anterior. Um
 * sub-pixel de diferença que não se vê -- mas que, escrito com o sinal errado,
 * põe a lista a abrir um buraco onde a música não vai cair.
 */
export function limiarDaLinha(j: number, de: number, altura: number): number {
  return (j - de + (j > de ? -0.5 : 0.5)) * altura;
}

/**
 * Quanto é que a linha `j` se desvia, com a linha `de` a ser arrastada `dy`.
 *
 * Uma linha abaixo sobe, uma linha acima desce, e nunca mais do que uma
 * posição: quem está a ser arrastado ocupa um lugar só, por isso só um lugar
 * se abre.
 *
 * Repara que isto PERGUNTA ao `destinoDoArrasto` em vez de refazer a conta com
 * limiares próprios. A primeira versão refazia, e o teste de varrimento
 * apanhou-a: no `dy` de exactamente meia linha para cima, o arredondamento
 * dizia "fica onde está" e o limiar dizia "cede o lugar". A lista abria um
 * espaço e a música aterrava noutro sítio. Duas contas que TÊM de concordar
 * são melhor escritas como uma só.
 */
export function desvioDaLinha(
  j: number, de: number, dy: number, altura: number, total: number
): number {
  if (j === de || altura <= 0 || !Number.isFinite(dy)) return 0;
  const destino = destinoDoArrasto(de, dy, altura, total);
  if (j > de) return j <= destino ? -altura : 0;
  return j >= destino ? altura : 0;
}

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

/** Move `de` para `para`, devolvendo uma cópia. Fora dos limites, não mexe. */
export function movido<T>(lista: readonly T[], de: number, para: number): T[] {
  const saida = [...lista];
  if (de < 0 || de >= saida.length || para < 0 || para >= saida.length) return saida;
  const [item] = saida.splice(de, 1);
  saida.splice(para, 0, item);
  return saida;
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

/**
 * A faixa junto às bordas onde a lista começa a deslizar sozinha.
 *
 * Sem isto, arrastar só funciona dentro do que já está visível: numa fila de
 * cinquenta músicas dá para mover uma linha três lugares e mais nada, porque
 * o destino nunca chega ao ecrã. Levar uma música do fim para o início era
 * impossível, e o gesto parecia avariado quando na verdade estava preso.
 */
export const MARGEM_DE_DESLIZE = 64;

/** Quanto se desliza por passo, no máximo, com o dedo colado à borda. */
export const DESLIZE_MAXIMO_PX = 12;

/**
 * A que velocidade a lista desliza, com o dedo em `dedoY`.
 *
 * Cresce com a proximidade da borda em vez de ligar e desligar: uma
 * velocidade única faz a lista arrancar de repente assim que se entra na
 * faixa, e passa-se sempre do sítio. Assim aproxima-se devagar e só corre
 * quando o dedo está mesmo encostado.
 *
 * Negativo sobe, positivo desce. Zero é o caso normal -- o dedo está no meio
 * e não há nada a fazer.
 */
export function velocidadeDoDeslize(
  dedoY: number,
  topo: number,
  fundo: number,
  margem = MARGEM_DE_DESLIZE,
  maximo = DESLIZE_MAXIMO_PX,
): number {
  if (!Number.isFinite(dedoY) || fundo - topo < margem * 2) return 0;
  if (dedoY < topo + margem) {
    const perto = Math.min(1, (topo + margem - dedoY) / margem);
    return -Math.round(perto * maximo);
  }
  if (dedoY > fundo - margem) {
    const perto = Math.min(1, (dedoY - (fundo - margem)) / margem);
    return Math.round(perto * maximo);
  }
  return 0;
}

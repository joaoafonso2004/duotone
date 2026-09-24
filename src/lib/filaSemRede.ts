/**
 * A fila sem rede: andar para a frente ou para trás e parar só numa faixa que
 * se consegue tocar AGORA (entrega 1 do docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md).
 *
 * Sem rede, o `next()` caía numa faixa sem ficheiro no aparelho, e essa falha
 * é `sem-rede` -- que de propósito não salta nada (saltar percorria a fila toda
 * em segundos). Ficava parado. Aqui não se tira nada da fila: só se passa por
 * cima do que não está no telemóvel, e com rede o predicado diz sempre que sim
 * e tudo fica como era.
 *
 * Sem imports de runtime -- testado em scripts/test-fila-sem-rede.ts.
 */

/**
 * A partir de `inicio`, dá passos (`passo`) até uma faixa que se possa tocar.
 *
 * `passo` é o mesmo que a fila já usa (o `stepIndex` do shuffle, ou o índice
 * seguinte com ou sem repeat): devolve o índice depois de um dado índice, ou
 * `null` quando a fila acaba. Voltar ao `inicio` numa fila que dá a volta
 * (repeat) só vale se o próprio `inicio` se puder tocar -- é o repeat de uma
 * fila com uma só faixa em disco. Nunca mais passos do que faixas.
 */
export function saltarAteTocavel<T>(
  fila: readonly T[],
  inicio: number,
  passo: (indice: number) => number | null,
  podeTocar: (faixa: T) => boolean,
): number | null {
  let i = inicio;
  for (let n = 0; n < fila.length; n++) {
    const seguinte = passo(i);
    if (seguinte === null || seguinte < 0 || seguinte >= fila.length) return null;
    if (podeTocar(fila[seguinte])) return seguinte;
    if (seguinte === inicio) return null;
    i = seguinte;
  }
  return null;
}

/** O passo da fila sem shuffle, para a frente ou para trás, com ou sem repeat. */
export function passoLinear(tamanho: number, direcao: 1 | -1, repetir: boolean) {
  return (i: number): number | null => {
    const j = i + direcao;
    if (j >= 0 && j < tamanho) return j;
    if (!repetir || tamanho === 0) return null;
    return direcao === 1 ? 0 : tamanho - 1;
  };
}

/**
 * A primeira faixa que se pode tocar numa sessão restaurada sem rede, a partir
 * da atual e pela ordem da fila. `null` se a atual já serve, ou se nenhuma
 * serve (aí fica tudo como estava: a app diz que não há rede).
 */
export function primeiraTocavelAoRestaurar<T>(
  fila: readonly T[],
  atual: number,
  podeTocar: (faixa: T) => boolean,
): number | null {
  if (fila.length === 0) return null;
  const indice = atual >= 0 && atual < fila.length ? atual : 0;
  if (podeTocar(fila[indice])) return null;
  return saltarAteTocavel(fila, indice, passoLinear(fila.length, 1, true), podeTocar);
}

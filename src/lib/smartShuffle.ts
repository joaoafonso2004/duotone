/**
 * Shuffle inteligente: de vez em quando entra uma música que não está na fila.
 *
 * A ideia é a do Spotify e veio de um amigo do João: carregas uma vez no
 * shuffle e é o normal; carregas outra vez e passa a intercalar sugestões
 * relacionadas com o que estás a ouvir. Serve para descobrir coisas sem sair
 * da playlist.
 *
 * **O que este ficheiro decide, e o que não decide.** Decide QUANDO entra uma
 * sugestão e SE uma candidata serve. Não vai à rede nem sabe o que é uma
 * recomendação — isso é o `api/radio.ts`, que já existe para o rádio e devolve
 * exatamente o que aqui é preciso. Sem imports de runtime, testável em Node
 * puro (`scripts/test-smart-shuffle.ts`), como o resto da lógica.
 */

export type ModoDeShuffle = 'off' | 'normal' | 'inteligente';

/**
 * Uma sugestão a cada quatro faixas.
 *
 * Nem uma em cada duas — aí deixa de ser a tua playlist — nem uma em cada dez,
 * que não se nota. Quatro é aproximadamente o que o Spotify faz, e é pouco o
 * suficiente para uma sugestão má não estragar a sessão.
 */
export const A_CADA = 4;

/** O ciclo do botão: off → normal → inteligente → off. */
export function proximoModo(actual: ModoDeShuffle): ModoDeShuffle {
  if (actual === 'off') return 'normal';
  if (actual === 'normal') return 'inteligente';
  return 'off';
}

/** O modo a partir dos dois booleanos que a store guarda. */
export function modoDeShuffle(ligado: boolean, inteligente: boolean): ModoDeShuffle {
  if (!ligado) return 'off';
  return inteligente ? 'inteligente' : 'normal';
}

/**
 * Está na hora de sugerir?
 *
 * `desdeAUltima` conta as faixas normais tocadas desde a última sugestão. A
 * primeira sugestão não sai logo à primeira faixa de propósito: começar uma
 * sessão com uma música que não é tua dá a impressão de que a playlist está
 * errada.
 */
export function deveSugerir(
  modo: ModoDeShuffle,
  desdeAUltima: number,
  aCada: number = A_CADA,
): boolean {
  if (modo !== 'inteligente') return false;
  if (aCada < 1) return false;
  return desdeAUltima >= aCada;
}

/**
 * Onde entra a sugestão: logo a seguir à que está a tocar.
 *
 * Não no fim da fila — a graça é ouvi-la a seguir, não daqui a duas horas. E
 * entra MESMO na fila, para aparecer na lista e se poder saltar ou guardar
 * como qualquer outra.
 */
export function posicaoDaSugestao(tamanhoDaFila: number, indiceActual: number): number {
  if (tamanhoDaFila <= 0) return 0;
  const i = Math.max(0, Math.min(indiceActual, tamanhoDaFila - 1));
  return i + 1;
}

/**
 * A primeira candidata que serve, ou null.
 *
 * Uma sugestão que já está na fila não é sugestão nenhuma — e uma que já foi
 * sugerida antes nesta sessão repetida seria pior do que não sugerir nada.
 */
export function escolherSugestao<T>(
  candidatas: readonly T[],
  chave: (t: T) => string,
  naFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
): T | null {
  for (const c of candidatas) {
    const k = chave(c);
    if (!k) continue;
    if (naFila.has(k) || jaSugeridas.has(k)) continue;
    return c;
  }
  return null;
}

/** O rótulo do botão, para o leitor de ecrã e para o tooltip. */
export function rotuloDoModo(modo: ModoDeShuffle): string {
  if (modo === 'normal') return 'Shuffle';
  if (modo === 'inteligente') return 'Smart shuffle — mixes in new tracks';
  return 'Shuffle off';
}

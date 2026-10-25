/**
 * Arrastar uma música no PC (24/10, docs/arrastar-pc-maquete.html): as regras
 * que não dependem do ecrã. Onde entra a linha de inserção numa lista, para
 * onde vai a música ao reordenar, e o que aparece junto ao rato por cima de
 * cada destino.
 *
 * Os rótulos vivem aqui pela mesma razão dos menus (`lib/menuDaFaixa.ts`): um
 * sítio só para as palavras.
 *
 * Puro: `scripts/test-arrastar.ts`.
 */

/** Quantos píxeis o rato anda antes de um clique passar a arrasto. */
export const LIMIAR_DO_ARRASTO_PX = 5;

/**
 * O gesto já é um arrasto? Num carrossel (`soVertical`), arrastar para o lado
 * é deslizar o carrossel: a música só se pega puxando mais para cima ou para
 * baixo do que para o lado. Devolve `null` enquanto ainda pode ser um clique,
 * e `false` quando deixou de ser um arrasto (o carrossel fica com o gesto).
 */
export function eArrasto(dx: number, dy: number, soVertical = false): boolean | null {
  if (Math.hypot(dx, dy) < LIMIAR_DO_ARRASTO_PX) return null;
  if (soVertical && Math.abs(dx) > Math.abs(dy)) return false;
  return true;
}

/**
 * Antes de que linha entra a música, pelo meio de cada uma: por cima da metade
 * de cima de uma linha entra antes dela; abaixo da última, no fim.
 */
export function posicaoDeInsercao(linhas: readonly { top: number; bottom: number }[], y: number): number {
  for (let i = 0; i < linhas.length; i++) {
    const meio = (linhas[i].top + linhas[i].bottom) / 2;
    if (y < meio) return i;
  }
  return linhas.length;
}

/** Onde desenhar a linha de inserção, para a posição dada. */
export function topoDaInsercao(linhas: readonly { top: number; bottom: number }[], posicao: number): number | null {
  if (!linhas.length) return null;
  return posicao < linhas.length ? linhas[posicao].top : linhas[linhas.length - 1].bottom;
}

/**
 * Reordenar: a música na posição `de` largada antes da linha `antesDe`. Devolve
 * o índice novo dela, ou `null` quando fica onde estava (logo antes ou logo
 * depois de si própria).
 */
export function destinoDaOrdem(de: number, antesDe: number): number | null {
  if (antesDe === de || antesDe === de + 1) return null;
  return antesDe > de ? antesDe - 1 : antesDe;
}

/** A lista com a música da posição `de` movida para `para` (o índice novo). */
export function movidaPara<T>(lista: readonly T[], de: number, para: number): T[] {
  const copia = lista.slice();
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** O que aparece junto ao rato por cima de cada destino. */
export const ROTULOS_DO_ARRASTO = {
  gostadas: 'Add to Liked Songs',
  jaNasGostadas: 'Already in Liked Songs',
  playlist: (nome: string) => `Add to ${nome}`,
  jaNaPlaylist: (nome: string) => `Already in ${nome}`,
  amigo: (nome: string) => `Send to ${nome}`,
  aSeguir: 'Play next',
  depoisDe: (titulo: string) => `Play after ${titulo}`,
  sugerirAJam: 'Suggest to the Jam',
  mover: 'Move here',
} as const;

/** Por cima da fila: "Play next" no topo, "Play after …" entre linhas; numa Jam, sugere-se à sala. */
export function rotuloDaFila(posicao: number, tituloAntes: string | null, emJam: boolean): string {
  if (emJam) return ROTULOS_DO_ARRASTO.sugerirAJam;
  if (posicao === 0 || !tituloAntes) return ROTULOS_DO_ARRASTO.aSeguir;
  return ROTULOS_DO_ARRASTO.depoisDe(tituloAntes);
}

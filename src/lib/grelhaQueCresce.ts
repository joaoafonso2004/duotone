/**
 * Uma grelha que só monta o que se vê, e cresce quando se chega ao fim.
 *
 * Nasceu da página dos Artists (20/9): a biblioteca do João tem milhares de
 * faixas e algumas centenas de artistas, e a página montava-os TODOS de uma
 * vez -- cada cartão com uma capa remota de 200 px. Abrir o separador era
 * mandar buscar centenas de imagens e construir centenas de cartões no mesmo
 * fotograma, e a app inteira engasgava-se enquanto isso durava.
 *
 * Não é virtualização a sério (nada é desmontado ao sair do ecrã): é o
 * suficiente para o custo de ABRIR não depender do tamanho da biblioteca, e
 * não tem o preço da virtualização -- o Ctrl+F do browser continua a encontrar
 * o que está montado, e a posição do scroll não salta.
 *
 * Puro de propósito, e testado em `scripts/test-grelha-que-cresce.ts`.
 */

/** Quantos cartões se montam à primeira. Mais do que cabe num ecrã grande. */
export const PRIMEIRO_LOTE = 60;

/** Quantos se juntam de cada vez que se chega perto do fim. */
export const LOTE = 60;

/**
 * A que distância do fim se pede mais.
 *
 * Uma grelha de capas de 200 px anda depressa debaixo do dedo; pedir só ao
 * chegar ao fim dava um buraco branco. 600 px são cerca de duas linhas.
 */
export const MARGEM_DO_FIM = 600;

/** O próximo lote, sem nunca passar do total. */
export function crescer(mostrados: number, total: number): number {
  return Math.min(total, Math.max(mostrados, 0) + LOTE);
}

/** Quantos mostrar agora: o pedido, limitado ao que existe. */
export function quantosMostrar(mostrados: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(mostrados, Math.min(PRIMEIRO_LOTE, total)));
}

/**
 * Chegou perto do fim?
 *
 * `alturaDoConteudo` é a de tudo o que está montado; `alturaVisivel` a da
 * janela de scroll. Uma altura de conteúdo que ainda não foi medida (0) não
 * pede nada -- senão, ao montar, pedia-se lote atrás de lote sem ninguém ter
 * rolado.
 */
export function pertoDoFim(
  y: number, alturaVisivel: number, alturaDoConteudo: number, margem = MARGEM_DO_FIM,
): boolean {
  if (alturaDoConteudo <= 0 || alturaVisivel <= 0) return false;
  return y + alturaVisivel + margem >= alturaDoConteudo;
}

/**
 * Há mais para mostrar?
 *
 * Quem desenha usa isto para não pedir lotes quando já está tudo montado -- o
 * `crescer` satura, mas um `setState` por evento de scroll redesenhava a
 * página inteira a cada pixel.
 */
export function faltaMostrar(mostrados: number, total: number): boolean {
  return quantosMostrar(mostrados, total) < total;
}

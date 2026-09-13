/**
 * O título do Now Playing que não cabe: desvanece em vez de levar reticências,
 * e dá uma volta quando se lhe toca.
 *
 * O título está ao centro, entre o coração e as reticências, numa linha só. Com
 * reticências, um título comprido deixava de parecer centrado -- a caixa enchia
 * e acabava num `…` encostado à direita. O corte que desvanece mantém o bloco
 * simétrico (pedido do João a 13/9). Tocar faz o texto correr para a esquerda,
 * o início voltar a entrar pela direita e parar onde começou: o título fica
 * sempre em repouso no início, sem um regresso aos solavancos.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-titulo-que-rola.ts).
 */

/**
 * A velocidade da volta. Uma VELOCIDADE e não uma duração: um título mais
 * comprido demora mais, mas lê-se sempre ao mesmo ritmo.
 */
export const PONTOS_POR_SEGUNDO = 40;

/** O vazio entre o fim do título e o início que volta a entrar pela direita. */
export const INTERVALO_DA_VOLTA = 48;

/** Quanto desvanece à direita, parado ou a andar. */
export const DESVANECER_A_DIREITA = 36;

/**
 * Quanto desvanece à esquerda, e só enquanto anda. Parado, o título começa no
 * limite da caixa, e desvanecer ali comia-lhe a primeira letra.
 */
export const DESVANECER_A_ESQUERDA = 24;

/**
 * O texto é mais largo do que a caixa?
 *
 * Um ponto de folga: o arredondamento da medição não pode pôr a desvanecer um
 * título que cabe. E uma caixa por medir (0) nunca corta nada.
 */
export function naoCabe(larguraDoTexto: number, larguraDaCaixa: number): boolean {
  return larguraDaCaixa > 0 && larguraDoTexto > larguraDaCaixa + 1;
}

/** Quanto anda e quanto demora uma volta, em pontos e milissegundos. */
export function voltaDoTitulo(larguraDoTexto: number): { distancia: number; duracaoMs: number } {
  const distancia = larguraDoTexto + INTERVALO_DA_VOLTA;
  return { distancia, duracaoMs: Math.round((distancia / PONTOS_POR_SEGUNDO) * 1000) };
}

export type EstadoDoTitulo = 'cabe' | 'parado' | 'a-andar';

type Cores = [string, string, ...string[]];
type Posicoes = [number, number, ...number[]];

/**
 * A máscara, pronta para o gradiente: onde é opaca o texto vê-se, onde é
 * transparente desaparece. As larguras em pontos passam a fracções da caixa, e
 * nenhum lado passa de metade dela -- numa caixa estreita as posições têm de
 * continuar por ordem.
 */
export function mascaraDoTitulo(
  larguraDaCaixa: number,
  estado: EstadoDoTitulo,
): { cores: Cores; posicoes: Posicoes } {
  if (estado === 'cabe' || larguraDaCaixa <= 0) {
    return { cores: ['#000', '#000'], posicoes: [0, 1] };
  }
  const direita = Math.min(0.5, DESVANECER_A_DIREITA / larguraDaCaixa);
  if (estado === 'parado') {
    return { cores: ['#000', '#000', 'transparent'], posicoes: [0, 1 - direita, 1] };
  }
  const esquerda = Math.min(0.5, DESVANECER_A_ESQUERDA / larguraDaCaixa);
  return {
    cores: ['transparent', '#000', '#000', 'transparent'],
    posicoes: [0, esquerda, 1 - direita, 1],
  };
}

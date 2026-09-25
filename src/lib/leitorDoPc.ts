/**
 * As contas do Now Playing do PC (a "A+" escolhida pelo João a 25/9).
 *
 * Puro e sem imports, testado em scripts/test-leitor-do-pc.ts.
 */

/** Altura da linha de cima (← e "Playing from"). */
export const ALTURA_DO_TOPO = 56;
/**
 * O que vive por baixo da capa: os dois pontos, o título (até duas linhas), o
 * artista e os ícones. A capa nunca pode empurrar isto para fora da janela.
 */
export const ALTURA_POR_BAIXO_DA_CAPA = 190;
/** Margens à volta da grelha: laterais (x2) e em baixo. */
export const MARGEM_LATERAL = 40;
export const MARGEM_DE_BAIXO = 24;
/** Abaixo desta largura, capa e fila ficam uma por baixo da outra. */
export const LARGURA_PARA_DUAS_COLUNAS = 900;
export const CAPA_MINIMA = 256;
export const CAPA_MAXIMA = 560;

export type Disposicao = { duasColunas: boolean; lado: number };

/**
 * O lado da capa, pela janela: cresce até onde a ALTURA deixa (era 384 fixo, e
 * num ecrã grande sobrava metade da página) sem passar de 46% da largura, que é
 * o que deixa a fila respirar ao lado. Múltiplos de 8, para uma janela a ser
 * redimensionada não refazer a capa (e o WebGL do glitch) a cada píxel.
 */
export function disposicaoDoLeitor(largura: number, altura: number): Disposicao {
  const util = Math.max(0, largura - MARGEM_LATERAL * 2);
  if (largura < LARGURA_PARA_DUAS_COLUNAS) {
    return { duasColunas: false, lado: degrau(limitar(Math.min(360, util))) };
  }
  const pelaAltura = altura - ALTURA_DO_TOPO - MARGEM_DE_BAIXO - ALTURA_POR_BAIXO_DA_CAPA;
  const pelaLargura = util * 0.46;
  return { duasColunas: true, lado: degrau(limitar(Math.min(pelaAltura, pelaLargura))) };
}

const limitar = (v: number) => Math.max(CAPA_MINIMA, Math.min(CAPA_MAXIMA, Math.floor(v)));
const degrau = (v: number) => Math.floor(v / 8) * 8;

/**
 * A linha no fim da fila: o que acontece quando ela acabar. Hoje não se sabia
 * se a música parava. Num Jam a fila é partilhada e as regras são outras: não
 * se diz nada.
 */
export function fimDaFila(c: {
  emJam: boolean;
  repeatMode: 'off' | 'all' | 'one';
  autoplayRadio: boolean;
  vazia: boolean;
}): string | null {
  if (c.emJam) return null;
  if (c.repeatMode === 'one') return 'This track is on repeat';
  if (c.repeatMode === 'all') return 'Then the queue starts again';
  if (c.autoplayRadio) return "Then: radio based on what you're playing";
  return c.vazia ? 'Queue ends after this track' : 'Queue ends here';
}

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

/**
 * O grupo da Radio no fim da fila (30/10, passo 1 de `docs/PLANO-ELEVAR-PC.md`).
 *
 * O Radio põe as suas músicas em `doRadio` e a fila fica "o que escolheste, e
 * depois o que a Radio juntou". Devolve onde começa essa cauda: a posição da
 * primeira de uma sequência, até ao fim, só de músicas da Radio; -1 se a fila
 * não acaba em nenhuma (ou está vazia). Uma da Radio no meio do que escolheste
 * não abre grupo: o grupo é só o que vem seguido até ao fim.
 */
export function inicioDoGrupoDaRadio(chaves: readonly string[], doRadio: readonly string[]): number {
  if (!chaves.length || !doRadio.length) return -1;
  const radio = new Set(doRadio);
  let inicio = -1;
  for (let i = chaves.length - 1; i >= 0 && radio.has(chaves[i]); i--) inicio = i;
  return inicio;
}

/**
 * As animações da fila: as linhas saem em cascata (Clear) ou viram (a Radio a
 * trocar a fila) e a nova entra a virar. Só as primeiras `LINHAS_ANIMADAS` se
 * escalonam (uma fila de cem linhas não demora dois segundos a sair); as outras
 * saem com a última.
 */
export const LINHAS_ANIMADAS = 14;
export const PASSO_DA_SAIDA_MS = 26;
export const DURACAO_DA_SAIDA_MS = 460;
export const PASSO_DA_ENTRADA_MS = 55;

/** O atraso de uma linha, em ms, numa cascata de `passo` ms. */
export function atrasoDaLinha(i: number, passo: number): number {
  return Math.max(0, Math.min(i, LINHAS_ANIMADAS)) * passo;
}

/** Quanto esperar até a última linha ter saído, para só então mexer na fila. */
export function esperaDaSaida(linhas: number): number {
  return DURACAO_DA_SAIDA_MS + atrasoDaLinha(Math.max(0, linhas - 1), PASSO_DA_SAIDA_MS) + 60;
}

/**
 * O layout do Now Playing do PC (5/11, "Now Playing layout" nas Definições): o
 * Classic de sempre, ou o Cinema -- o fundo a encher a janela, a capa pequena e
 * o título enorme à esquerda, a coluna de Up next · Lyrics · About à direita e
 * as pílulas em baixo (a maquete `docs/now-playing-cinema-maquete.html`, a
 * partir de uma imagem que o João mandou). O Classic é o de origem.
 */
export type DisposicaoEscolhida = 'classico' | 'cinema';
/** O fundo do Now Playing (5/11): a capa desfocada de sempre, ou a foto do artista. */
export type FundoDoLeitor = 'capa' | 'artista';

export function lerDisposicaoEscolhida(v: unknown): DisposicaoEscolhida {
  return v === 'cinema' ? 'cinema' : 'classico';
}
export function lerFundoDoLeitor(v: unknown): FundoDoLeitor {
  return v === 'artista' ? 'artista' : 'capa';
}

/**
 * A foto que o fundo usa, ou `null` para a capa desfocada. Com "Artist photo"
 * e sem foto conhecida (um artista sem página no catálogo), fica a capa: o
 * fundo nunca fica vazio.
 */
export function fotoDoFundo(fundo: FundoDoLeitor, foto: string | null | undefined): string | null {
  return fundo === 'artista' && typeof foto === 'string' && foto.trim() ? foto : null;
}

/** O título do Cinema cresce com a largura da página, de 48 a 84 px. */
export const TITULO_DO_CINEMA = { minimo: 48, maximo: 84, fracao: 0.056 } as const;
export function tamanhoDoTituloDoCinema(largura: number): number {
  const t = (Number.isFinite(largura) ? largura : 0) * TITULO_DO_CINEMA.fracao;
  return Math.round(Math.max(TITULO_DO_CINEMA.minimo, Math.min(TITULO_DO_CINEMA.maximo, t)));
}

/** A capa pequena ao lado do título (o "logo" da imagem de referência). */
export const CAPA_DO_CINEMA = 132;

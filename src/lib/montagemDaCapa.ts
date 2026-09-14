/**
 * A capa 3D a montar-se ao ritmo do download, e quando é que ficou preso.
 *
 * Decidido com o João numa preview interativa (14/9, "A capa a montar-se").
 *
 * ## O download chega aos BOCADOS, não aos poucos
 *
 * O `youtubeCache` descarrega de 1 MB em 1 MB, por isso uma música normal são
 * três saltos de 33%. A caixa não finge percentagens: cada bocado avança uma
 * peça. O 1.º encaixa a aresta esquerda, o 2.º a de baixo, e a face com a arte
 * só pousa quando a faixa está pronta a tocar. Numa música longa os bocados do
 * meio aproximam a face aos poucos. Nada volta atrás -- a primeira versão
 * recomeçava a aproximação a cada bocado e as etapas pareciam repetir-se.
 *
 * Entre bocados, a peça seguinte continua a aproximar-se devagar, só até meio
 * do passo seguinte: diz que o download está vivo sem prometer quanto falta.
 *
 * ## Dois presos diferentes
 *
 * - `nao-comecou`: ainda nenhum download a correr para esta faixa (a resolver o
 *   stream, ou à espera de vez na fila) há `NAO_COMECOU_MS`. No ecrã, uma luz
 *   que dava a volta ao lugar da face pára e pulsa.
 * - `preso-a-meio`: há download, mas nenhum bocado há `PRESO_A_MEIO_MS`. A peça
 *   que se aproximava recua um pouco e respira.
 *
 * Nos dois aparece o botão que guarda o relatório (`relatorioDoArranque.ts`),
 * que é para chegar à causa de uma faixa que não arranca.
 *
 * Sem imports de runtime: testado em Node puro (`scripts/test-montagem-da-capa.ts`).
 */

export const NAO_COMECOU_MS = 8000;
export const PRESO_A_MEIO_MS = 6000;
/** Entre bocados, uma peça vai até esta fração do caminho para o passo seguinte. */
export const APROXIMAR_ATE = 0.5;

export type FaseDoArranque = 'em-disco' | 'a-preparar' | 'a-descarregar' | 'pronta';
export type Preso = 'nao-comecou' | 'preso-a-meio' | null;

/** O que a montagem precisa de saber do download da faixa (ver `EstadoDoDownload`). */
export type LeituraDoDownload = {
  fase: 'na-fila' | 'a-descarregar';
  bocados: number;
  total: number | null;
  bocadoBytes: number;
  inicioEm: number | null;
  ultimoBocadoEm: number | null;
} | null;

export function faseDoArranque(e: {
  emDiscoAoComecar: boolean;
  pronta: boolean;
  download: LeituraDoDownload;
}): FaseDoArranque {
  if (e.emDiscoAoComecar) return 'em-disco';
  if (e.pronta) return 'pronta';
  // Na fila ainda não é download: é o "não começou".
  if (e.download?.fase === 'a-descarregar') return 'a-descarregar';
  return 'a-preparar';
}

export function estadoPreso(e: {
  fase: FaseDoArranque;
  agora: number;
  pedidoEm: number;
  download: LeituraDoDownload;
}): Preso {
  if (e.fase === 'a-preparar') return e.agora - e.pedidoEm >= NAO_COMECOU_MS ? 'nao-comecou' : null;
  if (e.fase === 'a-descarregar') {
    const desde = e.download?.ultimoBocadoEm ?? e.download?.inicioEm ?? e.pedidoEm;
    return e.agora - desde >= PRESO_A_MEIO_MS ? 'preso-a-meio' : null;
  }
  return null;
}

/** Quantos bocados vai ter o ficheiro; 0 enquanto não se sabe o tamanho. */
export function bocadosPrevistos(d: LeituraDoDownload): number {
  if (!d || !d.total || d.bocadoBytes <= 0) return 0;
  return Math.max(1, Math.ceil(d.total / d.bocadoBytes));
}

export type AlvoDaPeca = {
  /** Já está no sítio. */
  encaixada: boolean;
  /** Onde o último bocado a pôs (0 longe, 1 no sítio). */
  passo: number;
  /** Até onde se pode aproximar à espera do bocado seguinte. */
  limite: number;
  /** Vê-se: está encaixada, ou é a próxima e há download a correr. */
  visivel: boolean;
};

/**
 * As três peças que se veem, pela ordem em que encaixam: a aresta esquerda, a
 * de baixo e a face. As laterais de cima e da direita (escondidas nesta pose)
 * seguem a sua par.
 */
export function alvosDasPecas(fase: FaseDoArranque, download: LeituraDoDownload): [AlvoDaPeca, AlvoDaPeca, AlvoDaPeca] {
  const montada = fase === 'em-disco' || fase === 'pronta';
  const bocados = download?.bocados ?? 0;
  const encaixadas = [montada || bocados >= 1, montada || bocados >= 2, montada];
  const total = bocadosPrevistos(download);
  const alvo = (i: number): AlvoDaPeca => {
    if (encaixadas[i]) return { encaixada: true, passo: 1, limite: 1, visivel: true };
    const proxima = encaixadas.slice(0, i).every(Boolean);
    if (!proxima || fase !== 'a-descarregar') return { encaixada: false, passo: 0, limite: 0, visivel: false };
    if (i < 2) return { encaixada: false, passo: 0, limite: 0.9 * APROXIMAR_ATE, visivel: true };
    // A face. Numa música de três bocados vai direta ao último; com mais, os
    // bocados do meio aproximam-na um passo cada, sem nunca a pousar.
    const troco = Math.max(1, total - 2);
    const feitos = Math.max(0, bocados - 2);
    const passo = total > 3 ? (0.75 * Math.min(feitos, troco)) / troco : 0;
    const seguinte = total > 3 && feitos + 1 < troco ? (0.75 * (feitos + 1)) / troco : 0.9;
    return { encaixada: false, passo, limite: passo + (Math.max(seguinte, passo) - passo) * APROXIMAR_ATE, visivel: true };
  };
  return [alvo(0), alvo(1), alvo(2)];
}

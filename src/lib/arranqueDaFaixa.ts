/**
 * O que se sabe do arranque da faixa atual: quando foi pedida e o que o
 * resolvedor anda a fazer.
 *
 * Vive fora do `YouTubePlayerView` para o relatório de preso o poder ler
 * (`relatorioDoArranque.ts`). O download tem o seu próprio registo, no
 * `youtubeCache` (`estadoDoDownload`); isto é a parte de antes dele.
 *
 * Sem imports de runtime.
 */

export type ArranqueDaFaixa = {
  videoId: string;
  pedidoEm: number;
  resolverInicioEm: number | null;
  resolverFimEm: number | null;
  cliente: string | null;
  erro: string | null;
};

let atual: ArranqueDaFaixa | null = null;

export function comecarArranque(videoId: string, agora = Date.now()): void {
  atual = { videoId, pedidoEm: agora, resolverInicioEm: null, resolverFimEm: null, cliente: null, erro: null };
}

/** Só mexe se for a faixa que está a arrancar: uma resolução velha não reescreve a nova. */
export function marcarResolver(
  videoId: string,
  marca: { inicio?: boolean; fim?: boolean; cliente?: string | null; erro?: string | null },
  agora = Date.now(),
): void {
  if (!atual || atual.videoId !== videoId) return;
  if (marca.inicio) atual.resolverInicioEm = agora;
  if (marca.fim) atual.resolverFimEm = agora;
  if (marca.cliente !== undefined) atual.cliente = marca.cliente;
  if (marca.erro !== undefined) atual.erro = marca.erro;
}

export function arranqueAtual(): ArranqueDaFaixa | null {
  return atual ? { ...atual } : null;
}

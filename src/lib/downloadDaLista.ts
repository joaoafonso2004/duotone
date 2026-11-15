/**
 * Descarregar uma playlist inteira de uma vez (15/11, pedido no post do
 * Reddit: "como escolho as 403 músicas da playlist para as descarregar todas?").
 * Até aqui descarregava-se música a música, pelo menu de cada uma.
 *
 * Aqui só as contas e as frases: o que conta como feito, o que falta, o que a
 * linha de progresso diz. Quem descarrega é o `lib/loteDeDownloads.ts`, uma de
 * cada vez, pelo mesmo caminho do "Download" de uma música
 * (`lib/descarregarFaixa.ts`): cada uma fica um download PEDIDO, protegido da
 * limpeza e com a sua cópia na lista de Downloads.
 *
 * Sem imports: `scripts/test-download-da-lista.ts`.
 */

/** A `SituacaoDoDownload` de `lib/downloadsExplicitos.ts`, sem a importar. */
export type SituacaoDaFaixa = 'nenhum' | 'a-descarregar' | 'descarregada' | 'em-falta';

/** O que a lista tem descarregado, para o menu e para a linha de progresso. */
export type DownloadDaLista = 'nenhum' | 'parcial' | 'completo';

export type ContaDaLista = { total: number; descarregadas: number };

/** Porque é que o lote está parado: sem rede, ou à espera do Wi-Fi. */
export type Espera = 'rede' | 'wifi' | null;

export function contarDaLista(situacoes: readonly SituacaoDaFaixa[]): ContaDaLista {
  let descarregadas = 0;
  for (const s of situacoes) if (s === 'descarregada') descarregadas++;
  return { total: situacoes.length, descarregadas };
}

export function downloadDaLista(c: ContaDaLista): DownloadDaLista {
  if (c.total === 0 || c.descarregadas === 0) return 'nenhum';
  return c.descarregadas >= c.total ? 'completo' : 'parcial';
}

/**
 * As que ainda faltam, pela ordem da lista. Uma "em falta" (o pedido existe,
 * o ficheiro não) volta a tentar-se; uma a descarregar já está a caminho.
 */
export function faltamDescarregar<T>(faixas: readonly T[], situacaoDe: (t: T) => SituacaoDaFaixa): T[] {
  return faixas.filter((t) => {
    const s = situacaoDe(t);
    return s === 'nenhum' || s === 'em-falta';
  });
}

/** A linha por baixo do cabeçalho da playlist, enquanto descarrega. */
export function textoDoProgresso(c: ContaDaLista, espera: Espera): string {
  const quantas = `${c.descarregadas} of ${c.total}`;
  if (espera === 'rede') return `Waiting for a connection · ${quantas}`;
  if (espera === 'wifi') return `Waiting for Wi-Fi · ${quantas}`;
  return `Downloading ${quantas}`;
}

/** A mesma linha, parada: o que já está no iPhone. */
export function textoDoDescarregado(c: ContaDaLista): string {
  if (c.descarregadas >= c.total) return `Downloaded · ${c.total} ${c.total === 1 ? 'song' : 'songs'}`;
  return `${c.descarregadas} of ${c.total} downloaded`;
}

/** Quando o lote parou porque muitas seguidas falharam (o YouTube a recusar). */
export const TEXTO_DO_LOTE_PARADO = "Some songs couldn't download. Try again later.";

/**
 * O tamanho aproximado, para quem está em dados móveis decidir. Conta-se a
 * ~128 kbps (16 KB por segundo de música), e 3,5 minutos por música sem
 * duração. É uma ordem de grandeza: a qualidade escolhida e o formato mudam-no.
 */
const BYTES_POR_SEGUNDO = 16_000;
const DURACAO_SEM_DADOS_S = 210;
export function textoDoTamanho(duracoes: readonly (number | null | undefined)[]): string {
  const segundos = duracoes.reduce<number>((soma, d) => soma + (d && d > 0 ? d : DURACAO_SEM_DADOS_S), 0);
  const mb = (segundos * BYTES_POR_SEGUNDO) / 1_000_000;
  if (mb >= 1000) return `about ${(mb / 1000).toFixed(1)} GB`;
  return `about ${Math.max(1, Math.round(mb / 10) * 10 || Math.round(mb))} MB`;
}

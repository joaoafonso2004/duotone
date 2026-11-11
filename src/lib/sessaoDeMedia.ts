/**
 * A sessão de média do PC, do lado da página (issue #10, 11/11). O Windows lê
 * a sessão do frame do YouTube, que é quem toca; o processo principal põe lá a
 * da Duotone (`electron/sessaoDeMedia.cjs`) e as ações voltam à página por
 * `postMessage`. Aqui: o pedido que a página manda, e que mensagens aceita.
 *
 * Sem imports de runtime: `scripts/test-sessao-de-media.cjs`.
 */

export type AcaoDeMedia = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto' | 'stop';
const ACOES: readonly AcaoDeMedia[] = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'stop'];

/** Só os frames do YouTube que a app abre podem mandar ações. */
const ORIGEM_DO_YOUTUBE = /^https:\/\/www\.youtube(-nocookie)?\.com$/;

/** Uma mensagem do frame do YouTube, ou `null` se não é nossa ou não vem de lá. */
export function acaoDaMensagem(origem: string, dados: unknown): { acao: AcaoDeMedia; segundos: number | null } | null {
  if (!ORIGEM_DO_YOUTUBE.test(origem)) return null;
  const d = dados as { duotoneMedia?: unknown; seekTime?: unknown } | null;
  if (!d || typeof d !== 'object' || !ACOES.includes(d.duotoneMedia as AcaoDeMedia)) return null;
  const segundos = typeof d.seekTime === 'number' && Number.isFinite(d.seekTime) && d.seekTime >= 0 ? d.seekTime : null;
  if (d.duotoneMedia === 'seekto' && segundos === null) return null;
  return { acao: d.duotoneMedia as AcaoDeMedia, segundos };
}

export type PedidoDaSessao = {
  titulo: string; artista: string; album: string; capa: string;
  estado: 'playing' | 'paused' | 'none'; duracao: number | null; posicao: number | null;
};

/** O que a página manda ao processo principal, a cada música, pausa e salto. */
export function pedidoDaSessao(e: {
  titulo: string | null; artista: string | null; album: string | null; capa: string | null;
  aTocar: boolean; posicaoMs: number; duracaoMs: number;
}): PedidoDaSessao {
  if (!e.titulo) return { titulo: '', artista: '', album: '', capa: '', estado: 'none', duracao: null, posicao: null };
  const duracao = e.duracaoMs > 0 ? e.duracaoMs / 1000 : null;
  return {
    titulo: e.titulo,
    artista: e.artista ?? '',
    album: e.album || 'Duotone',
    capa: e.capa && /^https:\/\//i.test(e.capa) ? e.capa : '',
    estado: e.aTocar ? 'playing' : 'paused',
    duracao,
    posicao: duracao ? Math.min(Math.max(0, e.posicaoMs / 1000), duracao) : null,
  };
}

/** Um salto na música (e não o andar normal): a posição saiu do que se esperava. */
export function foiUmSalto(antesMs: number, agoraMs: number, passouMs: number, aTocar: boolean): boolean {
  const esperado = aTocar ? antesMs + passouMs : antesMs;
  return Math.abs(agoraMs - esperado) > 2500;
}

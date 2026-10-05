import type { Track } from '../types';
import type { SessaoDeEscuta } from '../api/ouvirJuntos';

/** Recalcula quando o ficheiro ficou pronto, antes de sair qualquer som. */
export function posicaoDaSalaParaFaixa(
  track: Pick<Track, 'source' | 'sourceId'>,
  sessao: SessaoDeEscuta | null,
  lerPosicao: () => number | null,
): number | null {
  if (sessao?.track?.source !== track.source || sessao.track.sourceId !== track.sourceId) return null;
  const ms = lerPosicao();
  if (ms == null || !Number.isFinite(ms)) return null;
  const duracao = (sessao.track.durationSeconds ?? 0) * 1000;
  return Math.max(0, duracao > 0 ? Math.min(ms, duracao) : ms);
}

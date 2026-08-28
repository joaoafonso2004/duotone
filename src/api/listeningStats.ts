import { displayArtist } from '../lib/artistName';
import {
  computeStats,
  periodStart,
  type ListeningStats,
  type PlayRow,
  type StatsPeriod,
} from '../lib/listeningStats';
import { supabase } from '../lib/supabase';

/**
 * Vai buscar o histórico de reproduções e agrega-o.
 *
 * A agregação é feita no cliente, em `lib/listeningStats.ts`, e não numa
 * função SQL — ver a nota lá sobre porquê. Aqui só há transporte.
 */

/** O PostgREST devolve no máximo 1000 linhas por pedido (`max-rows`), por
 * isso o histórico é lido às páginas. */
const PAGE = 1000;
/** Teto de segurança: 20 páginas chegam para anos de utilização pessoal e
 * impedem que "Sempre" puxe um histórico enorme num telemóvel em 4G. */
const MAX_PAGES = 20;

export interface StatsResult {
  stats: ListeningStats;
  /** Bateu no teto de páginas: os números são um mínimo, não o total. */
  truncated: boolean;
  /** A consulta falhou (tipicamente: falta a política de SELECT em `plays`
   * — ver supabase/listening-stats.sql). Distinto de "ainda não ouviste
   * nada", e a UI tem de dizer coisas diferentes nos dois casos. */
  unavailable: boolean;
}

function rowToPlay(row: any): PlayRow | null {
  const t = row?.tracks;
  if (!t?.source_id) return null;
  const track = {
    source: t.source as string,
    title: (t.title as string) ?? '',
    artist: (t.artist as string) ?? null,
  };
  return {
    playedAt: row.played_at,
    source: track.source,
    sourceId: t.source_id,
    title: track.title,
    // Normalizado aqui e não na agregação: é o mesmo extrator que dá nome aos
    // artistas no resto da app, senão o top daqui não batia certo com o das
    // outras listas.
    artist: displayArtist(track),
    artworkUrl: (t.artwork_url as string) ?? null,
    durationSeconds: (t.duration_seconds as number) ?? null,
  };
}

export async function fetchListeningStats(
  period: StatsPeriod,
  now: number = Date.now()
): Promise<StatsResult> {
  const empty = computeStats([], period, now);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { stats: empty, truncated: false, unavailable: false };

    const start = periodStart(period, now);
    const rows: PlayRow[] = [];
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      let q = supabase
        .from('plays')
        .select(
          'played_at, tracks (source, source_id, title, artist, artwork_url, duration_seconds)'
        )
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (start !== null) q = q.gte('played_at', new Date(start).toISOString());

      const { data, error } = await q;
      if (error) return { stats: empty, truncated: false, unavailable: true };
      if (!data || data.length === 0) break;

      for (const row of data) {
        const play = rowToPlay(row);
        if (play) rows.push(play);
      }

      if (data.length < PAGE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    return { stats: computeStats(rows, period, now), truncated, unavailable: false };
  } catch {
    return { stats: empty, truncated: false, unavailable: true };
  }
}

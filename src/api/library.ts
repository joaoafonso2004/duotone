import { supabase } from '../lib/supabase';
import type { Track } from '../types';

function rowToTrack(row: any): Track {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    artworkUrl: row.artwork_url,
    durationSeconds: row.duration_seconds,
  };
}

/** Garante que a faixa existe no catálogo global e devolve o id na BD. */
export async function upsertTrack(t: Track): Promise<string> {
  const { data, error } = await supabase
    .from('tracks')
    .upsert(
      {
        source: t.source,
        source_id: t.sourceId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork_url: t.artworkUrl,
        duration_seconds: t.durationSeconds,
      },
      { onConflict: 'source,source_id' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Chave estavel de uma faixa no catalogo global. */
export function trackKey(t: Pick<Track, 'source' | 'sourceId'>): string {
  return `${t.source}:${t.sourceId}`;
}

/**
 * Versao em LOTE do upsertTrack. Devolve um mapa `source:sourceId` -> id na BD.
 *
 * Existe porque importar uma playlist grande chamava upsertTrack faixa a
 * faixa: numa playlist de 2000 musicas eram 2000 idas ao Supabase em serie,
 * o que demorava minutos e bastava uma falhar para deitar tudo abaixo. Aqui
 * sao ~10 pedidos.
 */
export async function upsertTracks(
  tracks: Track[],
  chunkSize = 200,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Duplicados dentro do mesmo lote fazem o Postgres queixar-se de afetar a
  // mesma linha duas vezes — e listas do Spotify trazem repetidos com
  // frequencia (e faixas diferentes podem casar com o mesmo video).
  const unicas = new Map<string, Track>();
  for (const t of tracks) if (!unicas.has(trackKey(t))) unicas.set(trackKey(t), t);
  const lista = [...unicas.values()];

  for (let i = 0; i < lista.length; i += chunkSize) {
    const lote = lista.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('tracks')
      .upsert(
        lote.map((t) => ({
          source: t.source,
          source_id: t.sourceId,
          title: t.title,
          artist: t.artist,
          album: t.album,
          artwork_url: t.artworkUrl,
          duration_seconds: t.durationSeconds,
        })),
        { onConflict: 'source,source_id' }
      )
      .select('id, source, source_id');
    if (error) throw error;
    for (const row of data ?? []) {
      out.set(`${row.source}:${row.source_id}`, row.id as string);
    }
    onProgress?.(Math.min(i + lote.length, lista.length), lista.length);
  }
  return out;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Session expired');
  return data.user.id;
}

export async function saveToLibrary(track: Track): Promise<string> {
  const trackId = await upsertTrack(track);
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .upsert(
      { user_id: userId, track_id: trackId },
      { onConflict: 'user_id,track_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  return trackId;
}

export async function removeFromLibrary(trackId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .match({ user_id: userId, track_id: trackId });
  if (error) throw error;
}

export async function removeMultipleFromLibrary(trackIds: string[]): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .eq('user_id', userId)
    .in('track_id', trackIds);
  if (error) throw error;
}

/** Remove TODAS as faixas guardadas do utilizador atual (ação destrutiva). */
export async function clearLibrary(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .match({ user_id: userId });
  if (error) throw error;
}

export async function getLibrary(): Promise<Track[]> {
  const userId = await currentUserId();

  // 1. Fetch library tracks (ordered by added_at desc)
  const { data: libData, error: libError } = await supabase
    .from('library_tracks')
    .select('added_at, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (libError) throw libError;

  // 2. Fetch tracks from all playlists created by this user
  const { data: plTracksData, error: plTracksError } = await supabase
    .from('playlist_tracks')
    .select('tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds), playlists!inner (owner_id)')
    .eq('playlists.owner_id', userId);

  if (plTracksError) throw plTracksError;

  const tracksMap = new Map<string, Track>();

  // Add library tracks first to maintain order
  if (libData) {
    for (const row of libData) {
      if (row.tracks) {
        const track = rowToTrack(row.tracks);
        const key = `${track.source}:${track.sourceId}`;
        tracksMap.set(key, track);
      }
    }
  }

  // Add playlist tracks next (only if not already in map)
  if (plTracksData) {
    for (const row of plTracksData) {
      if (row.tracks) {
        const track = rowToTrack(row.tracks);
        const key = `${track.source}:${track.sourceId}`;
        if (!tracksMap.has(key)) {
          tracksMap.set(key, track);
        }
      }
    }
  }

  return Array.from(tracksMap.values());
}

/**
 * Chaves `source:sourceId` das faixas guardadas.
 *
 * Distinta do `getLibraryTrackIds` abaixo, que devolve ids da BD: resultados
 * de pesquisa vêm do YouTube e ainda não existem na tabela `tracks`, por isso
 * não têm id nenhum por onde comparar. A chave da fonte é a única que serve
 * para dizer "esta já a tens".
 */
export async function getLibraryKeys(): Promise<Set<string>> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('library_tracks')
    .select('tracks (source, source_id)')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((r: any) => r.tracks)
      .filter(Boolean)
      .map((t: any) => `${t.source}:${t.source_id}`)
  );
}

/** Ids (da BD) das faixas guardadas — para mostrar o estado "guardada". */
export async function getLibraryTrackIds(): Promise<Set<string>> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('library_tracks')
    .select('track_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.track_id as string));
}

export async function checkIsSaved(source: string, sourceId: string): Promise<{ saved: boolean; trackId: string | null }> {
  try {
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('id')
      .match({ source, source_id: sourceId })
      .maybeSingle();
    if (trackError || !trackData) return { saved: false, trackId: null };

    const userId = await currentUserId();
    const { data: libData, error: libError } = await supabase
      .from('library_tracks')
      .select('track_id')
      .match({ user_id: userId, track_id: trackData.id })
      .maybeSingle();

    if (libError || !libData) return { saved: false, trackId: trackData.id };
    return { saved: true, trackId: trackData.id };
  } catch {
    return { saved: false, trackId: null };
  }
}

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
  const { data, error } = await supabase
    .from('library_tracks')
    .select(
      'added_at, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)'
    )
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => row.tracks)
    .filter(Boolean)
    .map(rowToTrack);
}

/** Ids (da BD) das faixas guardadas — para mostrar o estado "guardada". */
export async function getLibraryTrackIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('library_tracks')
    .select('track_id');
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.track_id as string));
}

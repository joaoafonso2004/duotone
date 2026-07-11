import { supabase } from '../lib/supabase';
import { upsertTrack } from './library';
import type { Playlist, PlaylistTrack, Track } from '../types';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Session expired');
  return data.user.id;
}

export async function listPlaylists(): Promise<Playlist[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('playlists')
    .select('id, name, created_at, playlist_tracks (position, tracks (artwork_url))')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const pts: any[] = [...(row.playlist_tracks ?? [])].sort(
      (a, b) => a.position - b.position
    );
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      trackCount: pts.length,
      artworks: pts
        .map((pt) => pt.tracks?.artwork_url)
        .filter(Boolean)
        .slice(0, 4),
    };
  });
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from('playlists')
    .insert({ owner_id: ownerId, name })
    .select('id, name, created_at')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    trackCount: 0,
    artworks: [],
  };
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('playlists')
    .update({ name })
    .eq('id', id)
    .eq('owner_id', userId);
  if (error) throw error;
}

export async function deletePlaylist(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId);
  if (error) throw error;
}

export async function getPlaylistTracks(
  playlistId: string
): Promise<PlaylistTrack[]> {
  const { data, error } = await supabase
    .from('playlist_tracks')
    .select(
      'position, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)'
    )
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true });
  if (error) throw error;

  return (data ?? [])
    .filter((row: any) => row.tracks)
    .map((row: any) => ({
      id: row.tracks.id,
      source: row.tracks.source,
      sourceId: row.tracks.source_id,
      title: row.tracks.title,
      artist: row.tracks.artist,
      album: row.tracks.album,
      artworkUrl: row.tracks.artwork_url,
      durationSeconds: row.tracks.duration_seconds,
      position: row.position,
    }));
}

async function nextPosition(playlistId: string): Promise<number> {
  const { data } = await supabase
    .from('playlist_tracks')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

export async function addTrackToPlaylist(
  playlistId: string,
  track: Track
): Promise<void> {
  const trackId = await upsertTrack(track);
  const position = await nextPosition(playlistId);
  const { error } = await supabase
    .from('playlist_tracks')
    .upsert(
      { playlist_id: playlistId, track_id: trackId, position },
      { onConflict: 'playlist_id,track_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
): Promise<void> {
  const { error } = await supabase
    .from('playlist_tracks')
    .delete()
    .match({ playlist_id: playlistId, track_id: trackId });
  if (error) throw error;
}

/** Persiste uma nova ordem (lista completa de track ids, já ordenada). */
export async function setPlaylistOrder(
  playlistId: string,
  orderedTrackIds: string[]
): Promise<void> {
  const rows = orderedTrackIds.map((trackId, index) => ({
    playlist_id: playlistId,
    track_id: trackId,
    position: index,
  }));
  const { error } = await supabase
    .from('playlist_tracks')
    .upsert(rows, { onConflict: 'playlist_id,track_id' });
  if (error) throw error;
}

/** Importação em lote (ex.: playlist do YouTube). */
export async function addTracksToPlaylist(
  playlistId: string,
  tracks: Track[]
): Promise<void> {
  let position = await nextPosition(playlistId);
  const rows: { playlist_id: string; track_id: string; position: number }[] =
    [];
  for (const t of tracks) {
    const trackId = await upsertTrack(t);
    rows.push({ playlist_id: playlistId, track_id: trackId, position });
    position++;
  }
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('playlist_tracks')
    .upsert(rows, { onConflict: 'playlist_id,track_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Nome de uma playlist partilhada (leitura permitida a quem participa na
 * partilha — ver supabase/shared-playlists-read.sql). */
export async function getPlaylistName(playlistId: string): Promise<string | null> {
  const { data } = await supabase
    .from('playlists')
    .select('name')
    .eq('id', playlistId)
    .maybeSingle();
  return data?.name ?? null;
}

export async function importSharedPlaylist(sharedPlaylistId: string): Promise<string> {
  const { data: plData, error: plError } = await supabase
    .from('playlists')
    .select('name')
    .eq('id', sharedPlaylistId)
    .single();
  if (plError || !plData) throw new Error('Shared playlist not found');

  const { data: tracksData, error: tracksError } = await supabase
    .from('playlist_tracks')
    .select('position, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)')
    .eq('playlist_id', sharedPlaylistId)
    .order('position', { ascending: true });
  if (tracksError) throw tracksError;

  const newPl = await createPlaylist(plData.name + ' (Shared)');

  const tracksToInsert = (tracksData ?? [])
    .map((row: any) => row.tracks)
    .filter(Boolean)
    .map((t: any) => ({
      source: t.source,
      sourceId: t.source_id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      artworkUrl: t.artwork_url,
      durationSeconds: t.duration_seconds,
    }));

  if (tracksToInsert.length > 0) {
    await addTracksToPlaylist(newPl.id, tracksToInsert);
  }
  return newPl.id;
}

import { supabase } from '../lib/supabase';
import { upsertTrack } from './library';
import type { Track } from '../types';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Session expired');
  return data.user.id;
}

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

export async function recordPlayInSupabase(track: Track): Promise<void> {
  try {
    const trackId = await upsertTrack(track);
    const userId = await currentUserId();
    const { error } = await supabase
      .from('plays')
      .insert({ user_id: userId, track_id: trackId });
    if (error) console.error('Error recording play in Supabase:', error);
  } catch (err) {
    console.error('Error recording play in Supabase:', err);
  }
}

export async function getHeavyRotation(limit = 10): Promise<Track[]> {
  const { data, error } = await supabase.rpc('get_heavy_rotation', { limit_val: limit });
  if (error) throw error;
  return (data ?? []).map(rowToTrack);
}

export async function getForgottenFavorites(limit = 10): Promise<Track[]> {
  const { data, error } = await supabase.rpc('get_forgotten_favorites', { limit_val: limit });
  if (error) throw error;
  return (data ?? []).map(rowToTrack);
}

export async function getFlowMix(limit = 20): Promise<Track[]> {
  const { data, error } = await supabase.rpc('get_flow_mix', { limit_val: limit });
  if (error) throw error;
  return (data ?? []).map(rowToTrack);
}

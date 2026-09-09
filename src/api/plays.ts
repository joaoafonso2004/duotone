import { supabase } from '../lib/supabase';
import { upsertTrack } from './library';
import type { Track } from '../types';

import { artistasParaRecomendar, HISTORICO_QUE_CHEGA } from '../lib/artistasSemente';
import { getArtistasSemente } from '../lib/prefs';
import { chaveDeArtista } from '../lib/artistName';
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

export interface DbPlayStats {
  totalPlays: number;
  uniqueTracks: number;
  topArtist: { name: string; plays: number } | null;
}

export async function getProfilePlayStats(): Promise<DbPlayStats> {
  const { data, error } = await supabase.rpc('get_profile_play_stats');
  if (error) throw error;
  return data as DbPlayStats;
}

export interface ProfilePlayEntry {
  id?: string;
  source: 'youtube' | 'spotify';
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  count: number;
  lastPlayed?: number;
}

export async function getProfileMostPlayed(limit = 20): Promise<ProfilePlayEntry[]> {
  const { data, error } = await supabase.rpc('get_heavy_rotation', { limit_val: limit });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    artworkUrl: row.artwork_url,
    durationSeconds: row.duration_seconds,
    count: parseInt(row.play_count || '1', 10),
  }));
}

export async function getProfileRecentlyPlayed(limit = 10): Promise<ProfilePlayEntry[]> {
  const { data, error } = await supabase.rpc('get_profile_recently_played', { limit_val: limit });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    artworkUrl: row.artwork_url,
    durationSeconds: row.duration_seconds,
    count: 1,
    lastPlayed: row.max_played_at ? new Date(row.max_played_at).getTime() : undefined,
  }));
}

// ------------------------------------------------------------
// Top Artists (para o Perfil estilo Spotify)
// ------------------------------------------------------------

export interface TopArtist {
  name: string;
  plays: number;
  /** URL de uma thumbnail qualquer de uma faixa deste artista (para avatar). */
  artworkUrl: string | null;
}

export async function getTopArtists(limit = 8): Promise<TopArtist[]> {
  try {
    const { data, error } = await supabase.rpc('get_top_artists', { limit_val: limit });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      name: row.artist as string,
      plays: parseInt(row.play_count || '0', 10),
      artworkUrl: (row.artwork_url as string) || null,
    }));
  } catch (err) {
    console.error('Error fetching top artists:', err);
    return [];
  }
}

// ------------------------------------------------------------
// "Porque Ouviste..." — retorna o artista mais ouvido recentemente
// para gerar recomendações dinâmicas na Home
// ------------------------------------------------------------

export async function getRecentTopArtist(): Promise<string | null> {
  try {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('plays')
      .select('track_id, tracks!inner(artist)')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(30);
    if (error || !data || data.length === 0) return null;

    // Conta frequência de artistas nas últimas 30 reproduções
    const freq = new Map<string, number>();
    for (const row of data) {
      const artist = (row as any).tracks?.artist;
      if (artist && typeof artist === 'string') {
        freq.set(artist, (freq.get(artist) ?? 0) + 1);
      }
    }
    if (freq.size === 0) return null;

    // Retorna o artista com mais ocorrências recentes
    let top = '';
    let max = 0;
    for (const [a, c] of freq) {
      if (c > max) { top = a; max = c; }
    }
    return top || null;
  } catch {
    return null;
  }
}


/**
 * Os artistas com que se recomenda: o histórico, completado pelas sementes.
 *
 * **Um só sítio a decidir isto.** A descoberta, as misturas e os estilos
 * chamavam `getTopArtists` cada uma por si; três fallbacks copiados divergiam
 * ao primeiro acerto, e o dia em que alguém mudasse a regra num deles ficava
 * com a página meia semeada.
 *
 * As sementes vêm das Preferências e só entram enquanto o histórico for magro
 * -- a regra e o porquê vivem no `lib/artistasSemente.ts`, testados à parte.
 */
export async function artistasParaRecomendacoes(limite: number): Promise<TopArtist[]> {
  const historico = await getTopArtists(limite);
  // Só se vai às preferências quando o histórico não chega: quem já ouve não
  // paga uma leitura por causa de uma escolha que fez há meses.
  if (historico.length >= HISTORICO_QUE_CHEGA) return historico;
  const sementes = await getArtistasSemente().catch(() => [] as string[]);
  if (!sementes.length) return historico;
  // A capa vem do histórico quando o artista já lá está; uma semente ainda não
  // tem nenhuma, e quem a mostra sabe desenhar sem ela.
  const capas = new Map(historico.map((a) => [chaveDeArtista(a.name), a.artworkUrl]));
  return artistasParaRecomendar(historico, sementes, chaveDeArtista, Math.max(HISTORICO_QUE_CHEGA, limite))
    .map((a) => ({ name: a.name, plays: a.plays, artworkUrl: capas.get(chaveDeArtista(a.name)) ?? null }));
}

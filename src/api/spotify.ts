import { Linking } from 'react-native';
import { getSpotifyAccessToken } from '../lib/spotifyAuth';
import type { Track } from '../types';

const BASE = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function sfetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T | null> {
  const token = await getSpotifyAccessToken();
  if (!token) throw new SpotifyError(401, 'Spotify not connected');

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SpotifyError(res.status, body || res.statusText);
  }
  return (await res.json()) as T;
}

// ------------------------------------------------------------
// Pesquisa
// ------------------------------------------------------------

interface SpotifySearchResponse {
  tracks: {
    items: Array<{
      id: string;
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string; width: number }> };
    }>;
  };
}

export async function searchSpotify(query: string): Promise<Track[]> {
  const data = await sfetch<SpotifySearchResponse>(
    `/search?type=track&limit=25&q=${encodeURIComponent(query)}`
  );
  if (!data) return [];
  return data.tracks.items.map((item) => ({
    source: 'spotify' as const,
    sourceId: item.id,
    title: item.name,
    artist: item.artists.map((a) => a.name).join(', ') || null,
    album: item.album.name || null,
    artworkUrl: item.album.images[0]?.url ?? null,
    durationSeconds: Math.round(item.duration_ms / 1000),
  }));
}

// ------------------------------------------------------------
// Reprodução (Spotify Connect — controla a app oficial do Spotify)
// A música toca SEMPRE na app Spotify (requer app instalada + Premium).
// ------------------------------------------------------------

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  trackId: string | null;
}

export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  const data = await sfetch<any>('/me/player');
  if (!data || !data.item) return null;
  return {
    isPlaying: !!data.is_playing,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms ?? 0,
    trackId: data.item.id ?? null,
  };
}

interface SpotifyDevice {
  id: string;
  is_active: boolean;
  type: string;
}

async function getDevices(): Promise<SpotifyDevice[]> {
  const data = await sfetch<{ devices: SpotifyDevice[] }>('/me/player/devices');
  return data?.devices ?? [];
}

/**
 * Garante que existe um dispositivo Spotify disponível.
 * Se não houver, acorda a app Spotify via deep link e espera
 * que o dispositivo apareça (o utilizador volta à nossa app).
 */
async function ensureDevice(): Promise<string | null> {
  let devices = await getDevices();
  let device = devices.find((d) => d.is_active) ?? devices[0];
  if (device) return device.id;

  // Acordar a app Spotify (precisa de LSApplicationQueriesSchemes no app.json)
  const canOpen = await Linking.canOpenURL('spotify:');
  if (!canOpen) return null;
  await Linking.openURL('spotify:');

  // Esperar até 10s que o dispositivo apareça
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    devices = await getDevices();
    device = devices.find((d) => d.is_active) ?? devices[0];
    if (device) return device.id;
  }
  return null;
}

export async function playSpotifyTrack(track: Track): Promise<void> {
  const uris = [`spotify:track:${track.sourceId}`];
  try {
    await sfetch('/me/player/play', {
      method: 'PUT',
      body: JSON.stringify({ uris }),
    });
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 404 || e.status === 403)) {
      const deviceId = await ensureDevice();
      if (!deviceId) {
        throw new SpotifyError(
          404,
          'No active Spotify device. Open the Spotify app and try again.'
        );
      }
      await sfetch(`/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris }),
      });
    } else {
      throw e;
    }
  }
}

export async function pauseSpotify(): Promise<void> {
  await sfetch('/me/player/pause', { method: 'PUT' });
}

export async function resumeSpotify(): Promise<void> {
  await sfetch('/me/player/play', { method: 'PUT' });
}

export async function seekSpotify(positionMs: number): Promise<void> {
  await sfetch(`/me/player/seek?position_ms=${Math.round(positionMs)}`, {
    method: 'PUT',
  });
}

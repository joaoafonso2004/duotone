import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '../types';

/**
 * Contagem de reproduções por faixa, guardada LOCALMENTE (AsyncStorage). É
 * pessoal e de alta frequência, por isso não vale a pena ir ao Supabase —
 * fica no dispositivo. Alimenta a lista "Most played" do ecrã de Perfil.
 */

const KEY = 'playCounts:v1';

export interface PlayCountEntry {
  source: Track['source'];
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  count: number;
  lastPlayed: number; // epoch ms
}

type PlayCounts = Record<string, PlayCountEntry>;

function keyOf(track: Pick<Track, 'source' | 'sourceId'>): string {
  return `${track.source}:${track.sourceId}`;
}

async function readAll(): Promise<PlayCounts> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** +1 na contagem da faixa. Chamado ao iniciar a reprodução (ver player.ts). */
export async function incrementPlayCount(track: Track): Promise<void> {
  const all = await readAll();
  const k = keyOf(track);
  const prev = all[k];
  all[k] = {
    source: track.source,
    sourceId: track.sourceId,
    title: track.title,
    artist: track.artist ?? null,
    artworkUrl: track.artworkUrl ?? null,
    durationSeconds: track.durationSeconds ?? prev?.durationSeconds ?? null,
    count: (prev?.count ?? 0) + 1,
    lastPlayed: Date.now(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

/** Faixas mais ouvidas, da mais ouvida para a menos (desempate: mais recente). */
export async function getMostPlayed(limit = 50): Promise<PlayCountEntry[]> {
  const all = await readAll();
  return Object.values(all)
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

/** Faixas ouvidas há menos tempo primeiro (histórico recente). */
export async function getRecentlyPlayed(limit = 20): Promise<PlayCountEntry[]> {
  const all = await readAll();
  return Object.values(all)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

export interface PlayStats {
  totalPlays: number;
  uniqueTracks: number;
  topArtist: { name: string; plays: number } | null;
  youtubePlays: number;
  spotifyPlays: number;
}

/** Resumo agregado para o cabeçalho do perfil. */
export async function getPlayStats(): Promise<PlayStats> {
  const entries = Object.values(await readAll());
  const byArtist = new Map<string, number>();
  let youtubePlays = 0;
  let spotifyPlays = 0;
  let totalPlays = 0;

  for (const e of entries) {
    totalPlays += e.count;
    if (e.source === 'youtube') youtubePlays += e.count;
    else spotifyPlays += e.count;
    const artist = (e.artist ?? '').trim();
    if (artist) byArtist.set(artist, (byArtist.get(artist) ?? 0) + e.count);
  }

  let topArtist: PlayStats['topArtist'] = null;
  for (const [name, plays] of byArtist) {
    if (!topArtist || plays > topArtist.plays) topArtist = { name, plays };
  }

  return {
    totalPlays,
    uniqueTracks: entries.length,
    topArtist,
    youtubePlays,
    spotifyPlays,
  };
}

/** Total de reproduções somadas (para um resumo no perfil). */
export async function getTotalPlays(): Promise<number> {
  const all = await readAll();
  return Object.values(all).reduce((sum, e) => sum + e.count, 0);
}

export async function clearPlayCounts(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

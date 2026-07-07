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

/** Total de reproduções somadas (para um resumo no perfil). */
export async function getTotalPlays(): Promise<number> {
  const all = await readAll();
  return Object.values(all).reduce((sum, e) => sum + e.count, 0);
}

export async function clearPlayCounts(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

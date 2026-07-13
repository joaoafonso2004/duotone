import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Track } from '../types';

/**
 * Contagens partilhadas entre dispositivos.
 *
 * O Supabase é a fonte de verdade. AsyncStorage continua a ser usado como
 * cache imediato e como fila de deltas quando o dispositivo está offline.
 * Na primeira execução desta versão, os dados locais antigos são enviados uma
 * única vez para que o histórico existente no telemóvel não seja perdido.
 */

const KEY = 'playCounts:v1';
const PENDING_PREFIX = 'playCounts:pending:v2:';
const MIGRATED_PREFIX = 'playCounts:migrated:v2:';
const LAST_USER_KEY = 'playCounts:lastUser:v2';

export interface PlayCountEntry {
  source: Track['source'];
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  count: number;
  lastPlayed: number;
}

type PlayCounts = Record<string, PlayCountEntry>;

function keyOf(track: Pick<Track, 'source' | 'sourceId'>): string {
  return `${track.source}:${track.sourceId}`;
}

async function readMap(storageKey = KEY): Promise<PlayCounts> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(value: PlayCounts, storageKey = KEY): Promise<void> {
  await AsyncStorage.setItem(storageKey, JSON.stringify(value));
}

function rowToEntry(row: any): PlayCountEntry {
  return {
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    artworkUrl: row.artwork_url,
    durationSeconds: row.duration_seconds,
    count: Number(row.play_count) || 0,
    lastPlayed: new Date(row.last_played).getTime(),
  };
}

function entriesToMap(entries: PlayCountEntry[]): PlayCounts {
  return Object.fromEntries(entries.map((entry) => [keyOf(entry), entry]));
}

async function userId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function applyDeltas(entries: PlayCountEntry[]): Promise<boolean> {
  if (!entries.length) return true;
  const { error } = await supabase.rpc('apply_play_count_deltas', {
    entries: entries.map((entry) => ({
      source: entry.source,
      sourceId: entry.sourceId,
      title: entry.title,
      artist: entry.artist,
      artworkUrl: entry.artworkUrl,
      durationSeconds: entry.durationSeconds,
      count: entry.count,
      lastPlayed: entry.lastPlayed,
    })),
  });
  return !error;
}

async function pullRemote(uid: string): Promise<PlayCounts | null> {
  const { data, error } = await supabase
    .from('user_play_counts')
    .select('source, source_id, title, artist, artwork_url, duration_seconds, play_count, last_played')
    .eq('user_id', uid);
  if (error) return null;
  return entriesToMap((data ?? []).map(rowToEntry));
}

/** Serializa migração, flush e pull para nunca perder deltas concorrentes. */
let syncTail: Promise<void> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = syncTail.then(operation, operation);
  syncTail = result.then(() => undefined, () => undefined);
  return result;
}

async function syncUnsafe(): Promise<PlayCounts> {
  let local = await readMap();
  const uid = await userId();
  if (!uid) return local;

  const migratedKey = `${MIGRATED_PREFIX}${uid}`;
  const pendingKey = `${PENDING_PREFIX}${uid}`;
  const [migrated, lastUser] = await Promise.all([
    AsyncStorage.getItem(migratedKey),
    AsyncStorage.getItem(LAST_USER_KEY),
  ]);

  if (migrated !== '1') {
    // Importa o histórico pré-sincronização deste dispositivo uma única vez.
    // Inclui deltas pendentes já refletidos no cache local, por isso a fila é
    // limpa quando a importação tem sucesso para evitar dupla contagem.
    const canImportLegacyCache = !lastUser || lastUser === uid;
    if (!canImportLegacyCache) {
      local = {};
      await writeMap(local);
    }
    if ((!canImportLegacyCache || await applyDeltas(Object.values(local)))) {
      await AsyncStorage.multiSet([[migratedKey, '1'], [pendingKey, '{}'], [LAST_USER_KEY, uid]]);
    }
  } else {
    const pending = await readMap(pendingKey);
    if (await applyDeltas(Object.values(pending))) await writeMap({}, pendingKey);
  }

  const remote = await pullRemote(uid);
  if (!remote) return local;
  await Promise.all([writeMap(remote), AsyncStorage.setItem(LAST_USER_KEY, uid)]);
  return remote;
}

export async function synchronizePlayCounts(): Promise<void> {
  await serialized(syncUnsafe);
}

export async function incrementPlayCount(track: Track): Promise<void> {
  await serialized(async () => {
    const uid = await userId();
    const lastUser = await AsyncStorage.getItem(LAST_USER_KEY);
    if (uid && lastUser && lastUser !== uid) await syncUnsafe();

    const now = Date.now();
    const local = await readMap();
    const key = keyOf(track);
    const previous = local[key];
    local[key] = {
      source: track.source,
      sourceId: track.sourceId,
      title: track.title,
      artist: track.artist ?? null,
      artworkUrl: track.artworkUrl ?? null,
      durationSeconds: track.durationSeconds ?? previous?.durationSeconds ?? null,
      count: (previous?.count ?? 0) + 1,
      lastPlayed: now,
    };
    await writeMap(local);

    if (uid) {
      const pendingKey = `${PENDING_PREFIX}${uid}`;
      const pending = await readMap(pendingKey);
      const queued = pending[key];
      pending[key] = {
        ...local[key],
        count: (queued?.count ?? 0) + 1,
        lastPlayed: now,
      };
      await writeMap(pending, pendingKey);
    }

    await syncUnsafe();
  });
}

async function syncedEntries(): Promise<PlayCountEntry[]> {
  return Object.values(await serialized(syncUnsafe));
}

export async function getMostPlayed(limit = 50): Promise<PlayCountEntry[]> {
  return (await syncedEntries())
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

export async function getRecentlyPlayed(limit = 20): Promise<PlayCountEntry[]> {
  return (await syncedEntries())
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

export interface PlayStats {
  totalPlays: number;
  uniqueTracks: number;
  topArtist: { name: string; plays: number } | null;
}

export async function getPlayStats(): Promise<PlayStats> {
  const entries = await syncedEntries();
  const byArtist = new Map<string, number>();
  let totalPlays = 0;
  for (const entry of entries) {
    totalPlays += entry.count;
    const artist = (entry.artist ?? '').trim();
    if (artist) byArtist.set(artist, (byArtist.get(artist) ?? 0) + entry.count);
  }
  let topArtist: PlayStats['topArtist'] = null;
  for (const [name, plays] of byArtist) {
    if (!topArtist || plays > topArtist.plays) topArtist = { name, plays };
  }
  return { totalPlays, uniqueTracks: entries.length, topArtist };
}

export async function getTotalPlays(): Promise<number> {
  return (await syncedEntries()).reduce((sum, entry) => sum + entry.count, 0);
}

export async function clearPlayCounts(): Promise<void> {
  await serialized(async () => {
    const uid = await userId();
    if (uid) {
      const { error } = await supabase.from('user_play_counts').delete().eq('user_id', uid);
      if (error) throw error;
      await AsyncStorage.multiSet([
        [`${MIGRATED_PREFIX}${uid}`, '1'],
        [`${PENDING_PREFIX}${uid}`, '{}'],
        [LAST_USER_KEY, uid],
      ]);
    }
    await writeMap({});
  });
}

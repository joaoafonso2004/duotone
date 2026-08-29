import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '../types';

const KEY = 'playback:alternatives:v1';
let cache: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;

async function readMap(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (loading) return loading;
  loading = AsyncStorage.getItem(KEY).then((raw) => {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      cache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      cache = {};
    }
    return cache!;
  }).finally(() => { loading = null; });
  return loading;
}

/** Aplica no maximo quatro substituicoes encadeadas e protege contra ciclos. */
export async function applyPlaybackAlternative(track: Track): Promise<Track> {
  if (track.source !== 'youtube') return track;
  const map = await readMap();
  const seen = new Set([track.sourceId]);
  let sourceId = track.sourceId;
  for (let i = 0; i < 4; i++) {
    const next = map[sourceId];
    if (!next || seen.has(next)) break;
    sourceId = next;
    seen.add(next);
  }
  return sourceId === track.sourceId ? track : { ...track, sourceId };
}

export async function rememberPlaybackAlternative(failedSourceId: string, replacementSourceId: string): Promise<void> {
  if (!failedSourceId || !replacementSourceId || failedSourceId === replacementSourceId) return;
  const map = await readMap();
  map[failedSourceId] = replacementSourceId;
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

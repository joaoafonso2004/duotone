import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DEFAULT_SEARCH_TAB = 'pref:defaultSearchTab';
const KEY_DEFAULT_YT_VIEW = 'pref:defaultYtView';
const KEY_REPEAT_QUEUE = 'pref:repeatQueue';
const KEY_AUDIO_QUALITY = 'pref:audioQuality';
const KEY_SHOW_DURATION = 'pref:showTrackDuration';
const KEY_SHOW_REWIND = 'pref:showRewindButton';
const KEY_HAPTICS_ENABLED = 'pref:hapticsEnabled';
const KEY_SEARCH_HISTORY = 'pref:searchHistory';
const MAX_SEARCH_HISTORY = 10;

export type SearchSource = 'youtube' | 'spotify';
export type YtViewMode = 'video' | 'photo';
export type AudioQuality = 'high' | 'saver';

async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  return v === null ? fallback : v === '1';
}
async function setBool(key: string, v: boolean): Promise<void> {
  await AsyncStorage.setItem(key, v ? '1' : '0');
}

export async function getDefaultSearchTab(): Promise<SearchSource> {
  const v = await AsyncStorage.getItem(KEY_DEFAULT_SEARCH_TAB);
  return v === 'spotify' ? 'spotify' : 'youtube';
}
export async function setDefaultSearchTab(v: SearchSource): Promise<void> {
  await AsyncStorage.setItem(KEY_DEFAULT_SEARCH_TAB, v);
}

export async function getDefaultYtViewMode(): Promise<YtViewMode> {
  const v = await AsyncStorage.getItem(KEY_DEFAULT_YT_VIEW);
  return v === 'photo' ? 'photo' : 'video';
}
export async function setDefaultYtViewMode(v: YtViewMode): Promise<void> {
  await AsyncStorage.setItem(KEY_DEFAULT_YT_VIEW, v);
}

export async function getRepeatQueue(): Promise<boolean> {
  return getBool(KEY_REPEAT_QUEUE, false);
}
export async function setRepeatQueue(v: boolean): Promise<void> {
  await setBool(KEY_REPEAT_QUEUE, v);
}

export async function getAudioQuality(): Promise<AudioQuality> {
  const v = await AsyncStorage.getItem(KEY_AUDIO_QUALITY);
  return v === 'saver' ? 'saver' : 'high';
}
export async function setAudioQuality(v: AudioQuality): Promise<void> {
  await AsyncStorage.setItem(KEY_AUDIO_QUALITY, v);
}

export async function getShowRewindButton(): Promise<boolean> {
  return getBool(KEY_SHOW_REWIND, false);
}
export async function setShowRewindButton(v: boolean): Promise<void> {
  await setBool(KEY_SHOW_REWIND, v);
}

export async function getShowTrackDuration(): Promise<boolean> {
  return getBool(KEY_SHOW_DURATION, true);
}
export async function setShowTrackDuration(v: boolean): Promise<void> {
  await setBool(KEY_SHOW_DURATION, v);
}

export async function getHapticsEnabled(): Promise<boolean> {
  return getBool(KEY_HAPTICS_ENABLED, true);
}
export async function setHapticsEnabled(v: boolean): Promise<void> {
  await setBool(KEY_HAPTICS_ENABLED, v);
}

/** Últimas pesquisas (mais recente primeiro, sem duplicados, máx. 10). */
export async function getSearchHistory(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY_SEARCH_HISTORY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function addSearchHistoryEntry(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return getSearchHistory();
  const current = await getSearchHistory();
  const next = [q, ...current.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_SEARCH_HISTORY
  );
  await AsyncStorage.setItem(KEY_SEARCH_HISTORY, JSON.stringify(next));
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY_SEARCH_HISTORY);
}

// ------------------------------------------------------------
// Cache síncrono — para preferências lidas em caminhos "quentes"
// (renderização de listas, handlers de toque) onde uma leitura assíncrona
// ao AsyncStorage seria lenta ou causaria flicker. Carregado uma vez no
// arranque da app (ver App.tsx) e atualizado sempre que o utilizador muda
// a preferência nas Definições.
// ------------------------------------------------------------

let hapticsEnabledCache = true;
let showTrackDurationCache = true;

export function isHapticsEnabledSync(): boolean {
  return hapticsEnabledCache;
}
export function setHapticsEnabledCache(v: boolean): void {
  hapticsEnabledCache = v;
}

export function isShowTrackDurationSync(): boolean {
  return showTrackDurationCache;
}
export function setShowTrackDurationCache(v: boolean): void {
  showTrackDurationCache = v;
}

export async function loadPrefsCache(): Promise<void> {
  const [haptics, duration] = await Promise.all([
    getHapticsEnabled(),
    getShowTrackDuration(),
  ]);
  hapticsEnabledCache = haptics;
  showTrackDurationCache = duration;
}

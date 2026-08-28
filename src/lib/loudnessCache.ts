import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Memória do `loudnessDb` por vídeo.
 *
 * Existe por causa do cache de áudio: uma faixa já descarregada toca a partir
 * do ficheiro local e **não volta a passar pelo resolver**, por isso o valor
 * de loudness só aparece na primeira resolução (ou no pré-carregamento). Sem
 * isto, a normalização deixava de funcionar assim que a faixa entrasse em
 * cache — precisamente nas músicas mais ouvidas.
 *
 * Mapa pequeno (um número por vídeo), lido para memória no arranque e escrito
 * com debounce. Faixas descarregadas antes desta funcionalidade não têm valor
 * e tocam sem normalização, até serem re-descarregadas.
 */

const KEY = 'loudness:byVideo';
/** Teto para o mapa não crescer para sempre; ao atingir, corta-se a metade
 * mais antiga (ordem de inserção do objeto). */
const MAX_ENTRIES = 2000;

let cache: Record<string, number> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadLoudnessCache(): Promise<void> {
  if (cache) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
}

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!cache) return;
    AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
  }, 5000);
}

/** Síncrono de propósito: é lido no caminho de arranque da reprodução. */
export function getLoudnessDb(videoId: string): number | null {
  const v = cache?.[videoId];
  return typeof v === 'number' ? v : null;
}

export function rememberLoudnessDb(videoId: string, loudnessDb: number | null | undefined): void {
  if (typeof loudnessDb !== 'number' || !Number.isFinite(loudnessDb)) return;
  if (!cache) cache = {};
  if (cache[videoId] === loudnessDb) return;

  cache[videoId] = loudnessDb;

  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, Math.floor(MAX_ENTRIES / 2))) delete cache[k];
  }
  scheduleWrite();
}

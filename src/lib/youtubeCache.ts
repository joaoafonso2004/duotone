import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fixMp4Duration } from './mp4Fixer';

const PREFIX = 'yt-audio-';

// Incrementar sempre que o mp4Fixer mudar de forma que invalide ficheiros em cache.
// v3: Com a neutralização do edts/elst, o AVPlayer calcula consistentemente o DOBRO da duração
// dos cabeçalhos em fmp4. Assim, passar a duração real dividida por 2 resulta no tempo 1x exato.
const CACHE_VERSION = 3;
const CACHE_VERSION_KEY = 'yt_audio_cache_version';

/** Chamado no arranque da app. Se a versão do cache mudou, apaga todos os
 * ficheiros de áudio em cache para que sejam re-descarregados com o novo
 * mp4Fixer aplicado. */
export async function invalidateStaleAudioCache(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(CACHE_VERSION_KEY);
    if (stored === String(CACHE_VERSION)) return; // já está atualizado
    // Versão diferente (ou primeira execução) — limpar cache
    clearDownloadedAudioCache();
    await AsyncStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION));
  } catch {
    // Se falhar, não é crítico — o pior que acontece é tocar com duração errada
    // até o utilizador limpar o cache manualmente.
  }
}

// Downloader Constants
const CHUNK_BYTES = 4_000_000;
const CHUNK_PACING_MS = 0;
const MAX_ATTEMPTS_PER_CHUNK = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cache local do áudio (mp4 progressivo) por videoId — evita descarregar
 * outra vez ao voltar a tocar a mesma faixa (ver YouTubePlayerView). */
export function cachedAudioFile(videoId: string): File {
  return new File(Paths.cache, `${PREFIX}${videoId}.m4a`);
}

/** Apaga todo o áudio de YouTube descarregado localmente (Definições > Clear cache). */
export function clearDownloadedAudioCache(): void {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) {
      entry.delete();
    }
  }
}

/** Descobre o tamanho total do ficheiro via Content-Range, quando a API não o deu. */
export async function discoverContentLength(url: string): Promise<number> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-1' } });
  const range = res.headers.get('content-range'); // "bytes 0-1/4406875"
  const total = range ? Number(range.split('/')[1]) : NaN;
  if (!Number.isFinite(total)) throw new Error('Could not determine stream length');
  return total;
}

export async function fetchChunkWithRetry(url: string, start: number, end: number): Promise<Uint8Array> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    if (attempt > 0) await sleep(800 * 2 ** (attempt - 1)); // 800ms, 1.6s, 3.2s
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (res.status === 206 || res.status === 200) {
      return new Uint8Array(await res.arrayBuffer());
    }
    lastStatus = res.status;
  }
  throw new Error(`Chunk download failed (HTTP ${lastStatus}) at byte ${start}`);
}

/** Descarrega áudio progressivo por pedaços para armazenamento local e corrige os metadados de duração. */
export async function downloadProgressiveAudio(
  videoId: string,
  url: string,
  knownLength: number | null,
  durationSeconds: number | null
): Promise<string> {
  const dest = cachedAudioFile(videoId);
  if (dest.exists) return dest.uri;

  const total = knownLength ?? (await discoverContentLength(url));
  const parts: Uint8Array[] = [];
  let offset = 0;
  let first = true;
  while (offset < total) {
    if (!first) await sleep(CHUNK_PACING_MS);
    first = false;
    const end = Math.min(offset + CHUNK_BYTES, total) - 1;
    parts.push(await fetchChunkWithRetry(url, offset, end));
    offset = end + 1;
  }

  const combined = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    combined.set(part, pos);
    pos += part.length;
  }

  // Corrige a duração no contentor MP4 (m4a) antes de gravar em disco.
  // O mp4Fixer neutraliza edts/elst (edit lists) e sidx/ssix (segment index),
  // e com esta neutralização o AVPlayer calcula a duração consistentemente como o
  // DOBRO da duração definida nos cabeçalhos. Passar a metade resulta na duração exata.
  if (durationSeconds && durationSeconds > 0) {
    fixMp4Duration(combined, durationSeconds / 2);
  }

  dest.create({ overwrite: true });
  dest.write(combined);
  return dest.uri;
}

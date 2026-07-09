import { File, Paths } from 'expo-file-system';

const PREFIX = 'yt-audio-';

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

/** Descarrega áudio progressivo de forma estável usando download nativo para armazenamento local. */
export async function downloadProgressiveAudio(
  videoId: string,
  url: string,
  knownLength: number | null
): Promise<string> {
  const dest = cachedAudioFile(videoId);
  if (dest.exists) return dest.uri;

  // Descarrega usando a API nativa do novo expo-file-system para máxima estabilidade
  await File.downloadFileAsync(url, dest, { idempotent: true });

  return dest.uri;
}

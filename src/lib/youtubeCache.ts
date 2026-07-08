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

/** Descarrega áudio progressivo por pedaços para armazenamento local. */
export async function downloadProgressiveAudio(
  videoId: string,
  url: string,
  knownLength: number | null
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

  dest.create({ overwrite: true });
  dest.write(combined);
  
  // Limpa a cache de forma assíncrona para não atrasar o retorno imediato da reprodução
  pruneAudioCacheIfNeeded();
  
  return dest.uri;
}

/**
 * Mantém o armazenamento limpo limitando a cache às 50 músicas mais recentes.
 * Apaga os ficheiros mais antigos baseando-se na data de modificação.
 */
export function pruneAudioCacheIfNeeded(): void {
  try {
    const cacheDir = Paths.cache;
    const entries = cacheDir.list();
    const files = entries.filter(
      (e) => e instanceof File && e.name.startsWith(PREFIX)
    ) as File[];

    // Mantém no máximo 50 músicas na cache (cerca de 200MB-250MB)
    if (files.length <= 50) return;

    // Ordena por data de modificação decrescente (mais recente primeiro)
    const sorted = files.sort((a, b) => {
      const aTime = a.lastModified ?? 0;
      const bTime = b.lastModified ?? 0;
      return bTime - aTime;
    });

    // Apaga as faixas mais antigas (além das 50 mais recentes)
    for (let i = 50; i < sorted.length; i++) {
      try {
        sorted[i].delete();
      } catch (err) {
        console.warn(`[Smart Cache] Erro ao limpar faixa antiga ${sorted[i].name}:`, err);
      }
    }
  } catch (err) {
    console.warn('[Smart Cache] Erro ao gerir limite de cache:', err);
  }
}

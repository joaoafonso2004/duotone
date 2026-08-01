import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fixMp4Duration } from './mp4Fixer';

let File: any;
let Paths: any;

if (Platform.OS !== 'web') {
  try {
    const FileSystem = require('expo-file-system');
    File = FileSystem.File;
    Paths = FileSystem.Paths;
  } catch (e) {
    console.warn('Failed to load expo-file-system on native', e);
  }
}

const PREFIX = 'yt-audio-';

// Incrementar sempre que o mp4Fixer mudar de forma que invalide ficheiros em cache.
// v4: causa raiz encontrada — o m4a do YouTube é fMP4 com a duração total declarada
// TAMBÉM no moov (mvhd/tkhd/mdhd); o AVPlayer soma moov + fragmentos e reporta o DOBRO.
// O fixer agora escreve 0 no moov (fMP4 canónico) e a duração passa a vir só dos
// fragmentos, que somam o valor real. Fim do hack /2.
const CACHE_VERSION = 4;
const CACHE_VERSION_KEY = 'yt_audio_cache_version';

/** Chamado no arranque da app. Se a versão do cache mudou, apaga todos os
 * ficheiros de áudio em cache para que sejam re-descarregados com o novo
 * mp4Fixer aplicado. */
export async function invalidateStaleAudioCache(): Promise<void> {
  if (Platform.OS === 'web') return;
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
export function cachedAudioFile(videoId: string): any {
  if (Platform.OS === 'web') return null;
  return new File(Paths.cache, `${PREFIX}${videoId}.m4a`);
}

// ------------------------------------------------------------
// Índice em memória dos videoIds descarregados — permite badges "disponível
// offline" em listas (FlatList) sem tocar no sistema de ficheiros por linha.
// Carregado uma vez no arranque e mantido em sincronia pelas funções abaixo.
// ------------------------------------------------------------
let cachedIdsIndex: Set<string> | null = null;

export function loadCachedAudioIndex(): void {
  if (Platform.OS === 'web') return;
  try {
    const ids = new Set<string>();
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(PREFIX)) {
        ids.add(entry.name.slice(PREFIX.length).replace(/\.m4a$/, ''));
      }
    }
    cachedIdsIndex = ids;
  } catch {
    cachedIdsIndex = null;
  }
}

/** true se o áudio deste vídeo já está descarregado (síncrono; usa o índice
 * em memória e só cai no filesystem se o índice ainda não foi carregado). */
export function isAudioCached(videoId: string): boolean {
  if (Platform.OS === 'web') return false;
  if (cachedIdsIndex) return cachedIdsIndex.has(videoId);
  const file = cachedAudioFile(videoId);
  return file ? file.exists : false;
}

/** Apaga o áudio descarregado de UMA faixa ("Remover download"). */
export function removeDownloadedAudio(videoId: string): void {
  if (Platform.OS === 'web') return;
  const f = cachedAudioFile(videoId);
  if (f && f.exists) f.delete();
  cachedIdsIndex?.delete(videoId);
}

/** Apaga todo o áudio de YouTube descarregado localmente (Definições > Clear cache). */
export function clearDownloadedAudioCache(): void {
  if (Platform.OS === 'web') return;
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) {
      entry.delete();
    }
  }
  cachedIdsIndex = new Set();
}

// Limite do cache de áudio. Pruning LRU corre APENAS no arranque da app —
// nunca durante a reprodução (o pruning em pleno playback já causou crashes
// no passado; ver histórico do smart cache).
const MAX_CACHE_BYTES = 500 * 1024 * 1024;

/** Remove os ficheiros menos recentes até o cache caber em MAX_CACHE_BYTES.
 * `protectedIds` (fila atual restaurada) nunca são apagados. */
export function pruneAudioCacheLRU(protectedIds: string[] = []): void {
  if (Platform.OS === 'web') return;
  try {
    const protectedSet = new Set(protectedIds);
    const files: { file: any; id: string; size: number; mtime: number }[] = [];
    let totalBytes = 0;
    for (const entry of Paths.cache.list()) {
      if (!(entry instanceof File) || !entry.name.startsWith(PREFIX)) continue;
      const size = entry.size ?? 0;
      totalBytes += size;
      files.push({
        file: entry,
        id: entry.name.slice(PREFIX.length).replace(/\.m4a$/, ''),
        size,
        mtime: (entry as any).modificationTime ?? 0,
      });
    }
    if (totalBytes <= MAX_CACHE_BYTES) return;
    files.sort((a, b) => a.mtime - b.mtime); // mais antigos primeiro
    for (const f of files) {
      if (totalBytes <= MAX_CACHE_BYTES) break;
      if (protectedSet.has(f.id)) continue;
      try {
        f.file.delete();
        cachedIdsIndex?.delete(f.id);
        totalBytes -= f.size;
      } catch {
        // ficheiro em uso ou já removido — segue para o próximo
      }
    }
  } catch {
    // pruning é oportunista; falhar aqui nunca pode impedir o arranque
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

export interface DownloadOptions {
  /** Consultado entre chunks — devolve true para abortar (faixa trocada,
   * componente desmontado). Sem isto, saltar 5 faixas deixava 5 downloads
   * completos a competir pela rede em segundo plano. */
  shouldAbort?: () => boolean;
  /** Progresso 0..1 (por chunk descarregado). */
  onProgress?: (fraction: number) => void;
}

/** Erro lançado quando um download é abortado via shouldAbort — os callers
 * tratam-no como cancelamento silencioso, não como falha. */
export const DOWNLOAD_ABORTED = 'download aborted';

/** Descarrega áudio progressivo por pedaços para armazenamento local e corrige os metadados de duração. */
export async function downloadProgressiveAudio(
  videoId: string,
  url: string,
  knownLength: number | null,
  durationSeconds: number | null,
  opts: DownloadOptions = {}
): Promise<string> {
  if (Platform.OS === 'web') return '';
  const dest = cachedAudioFile(videoId);
  if (dest.exists) return dest.uri;

  const total = knownLength ?? (await discoverContentLength(url));
  const combined = new Uint8Array(total);
  let offset = 0;
  let first = true;
  while (offset < total) {
    if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    if (!first) await sleep(CHUNK_PACING_MS);
    first = false;
    const end = Math.min(offset + CHUNK_BYTES, total) - 1;
    const part = await fetchChunkWithRetry(url, offset, end);
    const expected = end - offset + 1;
    if (part.length !== expected) {
      throw new Error(`Chunk incompleto (${part.length}/${expected} bytes) @${offset}`);
    }
    // Escreve diretamente no buffer final — sem parts[] intermédio, que
    // duplicava o pico de RAM (2× o ficheiro; ~220MB num mix de 2h).
    combined.set(part, offset);
    offset = end + 1;
    opts.onProgress?.(Math.min(1, offset / total));
  }
  if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);

  // Corrige a duração no contentor MP4 (m4a) antes de gravar em disco: zera
  // os cabeçalhos do moov para o AVPlayer deixar de somar moov + fragmentos
  // (ver mp4Fixer.ts). Não precisa da duração real para isso, por isso corre
  // sempre — durationSeconds só é usada para o mehd, quando exista.
  // [duration-debug] log temporário — remover depois de validar no dispositivo
  console.log(
    `[duration-debug][download] videoId=${videoId} durationSeconds=${durationSeconds ?? 'null'} bytes=${total}`
  );
  fixMp4Duration(combined, durationSeconds);

  dest.create({ overwrite: true });
  dest.write(combined);
  cachedIdsIndex?.add(videoId);
  return dest.uri;
}

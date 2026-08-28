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
// 4MB era demasiado ganancioso: sem PO Token o CDN rejeita pedidos grandes
// (visto no 4G do João — a sonda de 2 bytes passava e o pedido de 4MB
// levava 403 no MESMO URL). 1MB passa muito mais vezes; se mesmo assim
// falhar, o ciclo encolhe sozinho até MIN_CHUNK_BYTES.
const CHUNK_BYTES = 1_000_000;
const MIN_CHUNK_BYTES = 131_072; // 128KB — abaixo disto não compensa
const CHUNK_PACING_MS = 0;
const MAX_ATTEMPTS_PER_CHUNK = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Onde vive o áudio descarregado.
 *
 * Paths.document e NÃO Paths.cache. A documentação do expo-file-system é
 * explícita: `cache` é "a place to store files that CAN BE DELETED BY THE
 * SYSTEM when the device runs low on storage", `document` é "safe from being
 * deleted by the system". Como estava, o iOS apagava as músicas descarregadas
 * quando lhe apetecia — era por isso que desapareciam e a app ficava sem nada
 * para tocar offline. Isto são downloads pedidos pelo utilizador, portanto
 * pertencem a document.
 */
function audioDir(): any {
  return Paths.document;
}

/** Áudio descarregado desta faixa (ver audioDir para o porquê da pasta). */
export function cachedAudioFile(videoId: string): any {
  if (Platform.OS === 'web') return null;
  return new File(audioDir(), `${PREFIX}${videoId}.m4a`);
}

/** Move para document o que ficou na pasta cache de versões anteriores, para
 * o utilizador não perder o que já tinha descarregado. Corre uma vez. */
const MIGRATED_KEY = 'yt_audio_moved_to_documents';
export async function migrateAudioCacheToDocuments(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await AsyncStorage.getItem(MIGRATED_KEY)) return;
    for (const entry of Paths.cache.list()) {
      if (!(entry instanceof File) || !entry.name.startsWith(PREFIX)) continue;
      const dest = new File(Paths.document, entry.name);
      try {
        // moveSync e não move: o `move` devolve Promise e, sem await, o
        // erro escapava a este try/catch e o ciclo seguia sem esperar.
        if (!dest.exists) entry.moveSync(dest);
        else entry.delete();
      } catch {
        // ficheiro em uso ou corrompido — fica para trás, será re-descarregado
      }
    }
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
    loadCachedAudioIndex();
  } catch {
    // sem drama — o pior que acontece é re-descarregar
  }
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
    for (const entry of audioDir().list()) {
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
/**
 * Espaço ocupado pelo áudio descarregado, em bytes.
 *
 * Lê o filesystem de cada vez (ao contrário do `cachedIdsIndex`, que é um
 * índice em memória): é chamado uma vez ao abrir as Definições, não num hot
 * path de listas.
 */
export function getAudioCacheBytes(): number {
  if (Platform.OS === 'web') return 0;
  try {
    let total = 0;
    for (const entry of audioDir().list()) {
      if (entry instanceof File && entry.name.startsWith(PREFIX)) total += entry.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/** "1,2 GB" / "340 MB" / "—" quando não há nada. */
export function formatCacheSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1 MB';
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
}

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
  for (const entry of audioDir().list()) {
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
    for (const entry of audioDir().list()) {
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

/** Estados em que o URL assinado do CDN morreu de vez: repetir o MESMO URL
 * nunca recupera — só um URL novo (resolver outra vez) resolve. */
function isDeadUrlStatus(status: number): boolean {
  return status === 403 || status === 401 || status === 410;
}

export async function fetchChunkWithRetry(
  url: string,
  start: number,
  end: number,
  renewUrl?: () => Promise<string | null>
): Promise<{ bytes: Uint8Array; url: string }> {
  let lastStatus = 0;
  let current = url;
  let renewed = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    if (attempt > 0) await sleep(800 * 2 ** (attempt - 1)); // 800ms, 1.6s, 3.2s
    const res = await fetch(current, { headers: { Range: `bytes=${start}-${end}` } });
    if (res.status === 206 || res.status === 200) {
      return { bytes: new Uint8Array(await res.arrayBuffer()), url: current };
    }
    lastStatus = res.status;
    // O URL do googlevideo está ligado ao IP que o pediu e tem validade. Em
    // 4G o IP muda (troca de célula, reconexão) e o URL que estava em cache
    // morre — e o retry repetia-o ús 4 vezes, dando sempre 403. Pedimos um
    // URL fresco uma vez; se vier, continuamos do mesmo offset com ele.
    if (isDeadUrlStatus(lastStatus)) {
      if (renewUrl && !renewed) {
        renewed = true;
        const fresh = await renewUrl().catch(() => null);
        if (fresh) {
          current = fresh;
          continue;
        }
      }
      // Um 403 não é transitório. Já tentámos URL novo; insistir mais 3 vezes
      // com backoff só atrasa a música ~6s antes do mesmo fim. Sai já para o
      // caller encolher o pedido ou cair para o embed.
      break;
    }
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
  /** Pede um URL novo quando o CDN responde 403/401/410. Sem isto um URL
   * expirado (ou preso a um IP antigo) é irrecuperável: os 4 retries
   * repetem exatamente o mesmo URL morto. Devolve null se não der. */
  renewUrl?: () => Promise<string | null>;
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

  let currentUrl = url;
  let chunkSize = CHUNK_BYTES;
  const total = knownLength ?? (await discoverContentLength(url));
  const combined = new Uint8Array(total);
  let offset = 0;
  let first = true;
  while (offset < total) {
    if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    if (!first) await sleep(CHUNK_PACING_MS);
    first = false;
    const end = Math.min(offset + chunkSize, total) - 1;
    let part: Uint8Array;
    try {
      const got = await fetchChunkWithRetry(currentUrl, offset, end, opts.renewUrl);
      part = got.bytes;
      currentUrl = got.url; // se foi renovado, os chunks seguintes usam o novo
    } catch (e) {
      // Um 403 nem sempre quer dizer URL morto: sem PO Token o CDN também
      // rejeita pedidos GRANDES de propósito. Já renovámos o URL sem
      // sucesso, por isso a hipótese seguinte é o tamanho — encolher e
      // repetir o MESMO offset, até ao mínimo, antes de desistir.
      if (e instanceof Error && e.message !== DOWNLOAD_ABORTED && chunkSize > MIN_CHUNK_BYTES) {
        chunkSize = Math.max(MIN_CHUNK_BYTES, Math.floor(chunkSize / 4));
        continue;
      }
      throw e;
    }
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

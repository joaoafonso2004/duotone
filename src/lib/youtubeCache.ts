import { create } from 'zustand';
export const useAudioCache=create<{revision:number}>(()=>({revision:0}));
const changed=()=>useAudioCache.setState(s=>({revision:s.revision+1}));
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fixMp4Duration } from './mp4Fixer';
import { validarRespostaParcial } from './audioRange';
import { largarVez, pedirVez, type Prioridade } from './filaDeDownloads';
import { escolherParaApagar, type FicheiroEmCache } from './limpezaDoCache';
import { publicarAudio } from './publicarDownload';

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
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_AUDIO_BYTES = 256 * 1024 * 1024;

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
      if (entry instanceof File && entry.name.startsWith(PREFIX) && entry.name.endsWith('.m4a') && entry.size>0) {
        ids.add(entry.name.slice(PREFIX.length).replace(/\.m4a$/, ''));
      }
    }
    cachedIdsIndex = ids;changed();
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

/** O que está descarregado, com tamanho e data. Para o ecrã de Downloads. */
export function listarDescarregados(): FicheiroEmCache[] {
  if (Platform.OS === 'web') return [];
  try {
    const out: FicheiroEmCache[] = [];
    for (const entry of audioDir().list()) {
      if (!(entry instanceof File) || !entry.name.startsWith(PREFIX)) continue;
      if (!entry.name.endsWith('.m4a')) continue; // .part de um download a decorrer
      out.push({
        id: entry.name.slice(PREFIX.length).replace(/\.m4a$/, ''),
        bytes: entry.size ?? 0,
        modificadoEm: (entry as any).modificationTime ?? 0,
      });
    }
    return out;
  } catch {
    return [];
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
  cachedIdsIndex?.delete(videoId);changed();
}

/** Apaga todo o áudio de YouTube descarregado localmente (Definições > Clear cache). */
export function clearDownloadedAudioCache(): void {
  if (Platform.OS === 'web') return;
  for (const entry of audioDir().list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) {
      entry.delete();
    }
  }
  cachedIdsIndex = new Set();changed();
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
    const ficheiros = listarDescarregados();
    // A DECISAO vive em limpezaDoCache.ts, testada sem tocar em disco: e a
    // unica coisa nesta app que apaga musica do telemovel.
    const aApagar = new Set(escolherParaApagar(ficheiros, protectedIds, MAX_CACHE_BYTES));
    if (aApagar.size === 0) return;

    for (const entry of audioDir().list()) {
      if (!(entry instanceof File) || !entry.name.startsWith(PREFIX)) continue;
      const id = entry.name.slice(PREFIX.length).replace(/\.m4a$/, '');
      if (!aApagar.has(id)) continue;
      try {
        entry.delete();
        cachedIdsIndex?.delete(id);changed();
      } catch {
        // ficheiro em uso ou já removido — segue para o próximo
      }
    }
  } catch {
    // pruning é oportunista; falhar aqui nunca pode impedir o arranque
  }
}

/** Descobre o tamanho total do ficheiro via Content-Range, quando a API não o deu. */
export async function discoverContentLength(url: string, shouldAbort?: () => boolean): Promise<number> {
  if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancel = shouldAbort ? setInterval(() => { if (shouldAbort()) controller.abort(); }, 100) : undefined;
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: controller.signal });
    const range = res.headers.get('content-range'); // "bytes 0-1/4406875"
    const total = range ? Number(range.split('/')[1]) : NaN;
    if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_AUDIO_BYTES) {
      throw new Error('Audio file is too large to download safely.');
    }
    return total;
  } catch (error) {
    if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    throw error;
  } finally {
    clearTimeout(timeout);
    if (cancel) clearInterval(cancel);
  }
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
  renewUrl?: () => Promise<string | null>,
  shouldAbort?: () => boolean,
  expectedTotal?: number,
): Promise<{ bytes: Uint8Array; url: string }> {
  let lastStatus = 0;
  let current = url;
  let renewed = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    if (attempt > 0) await sleep(800 * 2 ** (attempt - 1)); // 800ms, 1.6s, 3.2s
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    const cancel=shouldAbort?setInterval(()=>{if(shouldAbort())controller.abort();},100):undefined;
    try{
      const res=await fetch(current,{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal});
      if (res.status === 206 || res.status === 200) {
        if (expectedTotal === undefined) throw new Error('Total do audio em falta');
        // Nao chega verificar o TAMANHO: pedir 4-7 e receber "bytes 0-3/8" da
        // 4 bytes certinhos no offset errado, e o ficheiro fica corrompido sem
        // um unico erro pelo caminho.
        validarRespostaParcial(res, start, end, expectedTotal);
        return { bytes: new Uint8Array(await res.arrayBuffer()), url: current };
      }
      lastStatus = res.status;
    }
    catch(e){
      if(shouldAbort?.())throw new Error(DOWNLOAD_ABORTED);
      if(attempt===MAX_ATTEMPTS_PER_CHUNK-1)throw e;
      continue;
    }finally{clearTimeout(timeout);if(cancel)clearInterval(cancel);}
    // O URL do googlevideo está ligado ao IP que o pediu e tem validade. Em
    // 4G o IP muda (troca de célula, reconexão) e o URL que estava em cache
    // morre — e o retry repetia-o ús 4 vezes, dando sempre 403. Pedimos um
    // URL fresco uma vez; se vier, continuamos do mesmo offset com ele.
    if (isDeadUrlStatus(lastStatus)) {
      if (renewUrl && !renewed) {
        renewed = true;
        // Com prazo: era esta a chamada que podia pendurar para sempre e
        // deixar a vaga da fila presa -- e com ela toda a app parada em 0:00
        // até alguém reiniciar.
        const fresh = await Promise.race([
          renewUrl(),
          new Promise<null>((r) => setTimeout(() => r(null), REQUEST_TIMEOUT_MS)),
        ]).catch(() => null);
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
  /** Quem fica a frente na fila. Ver `Prioridade`. */
  prioridade?: Prioridade;
}



/** Erro lançado quando um download é abortado via shouldAbort — os callers
 * tratam-no como cancelamento silencioso, não como falha. */
export const DOWNLOAD_ABORTED = 'download aborted';

/**
 * Os downloads a decorrer, por faixa.
 *
 * Duas pessoas a pedir o mesmo ficheiro ao mesmo tempo -- o adiantamento da
 * faixa seguinte e o toque do utilizador nessa mesma faixa -- descarregavam-no
 * DUAS vezes, uma atras da outra, porque a fila so deixa passar um de cada vez.
 * Aqui a segunda espera pela primeira.
 */
const emCurso = new Map<string, Promise<string>>();

/** So para testes: esquece o que esta a meio. */
export function limparDownloadsEmCurso(): void {
  emCurso.clear();
}

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
  // O que ja esta em disco nem chega a entrar na fila.
  if (dest.exists) return dest.uri;
  if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);

  // JA ESTA A SER DESCARREGADO? Entao espera-se por ele em vez de pedir vez.
  //
  // Isto e o que tirava o "delay" do botao de seguinte. O Smart Cache comeca a
  // descarregar a faixa seguinte cinco segundos depois de a actual arrancar. Se
  // o utilizador carregar em seguinte a meio disso, a chamada da REPRODUCAO
  // pedia vez ao mesmo tempo -- e como so passa um download de cada vez, ficava
  // atras do adiantamento DA MESMA FAIXA. Esperava que ele acabasse e depois
  // recomecava do zero: o dobro do tempo e o dobro da rede, para o mesmo
  // ficheiro.
  //
  // Agora quem chega a seguir espera pelo que ja anda. Se esse for abandonado,
  // quem ainda quer a faixa tenta por si -- o abandono de um nao pode condenar
  // o outro.
  const jaAnda = emCurso.get(videoId);
  if (jaAnda) {
    try {
      return await jaAnda;
    } catch (e: any) {
      if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
      if (dest.exists) return dest.uri;
      if (e?.message !== DOWNLOAD_ABORTED) throw e;
      // Abandonado por quem o comecou. Segue-se para o caminho normal.
    }
  }

  const meu = (async () => {
    const bilhete = await pedirVez(opts.prioridade ?? 'explicito');
    try {
      // Entre pedir a vez e chega-la, a faixa pode ter mudado ou outro job pode
      // ter descarregado esta mesma.
      if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
      if (dest.exists) return dest.uri;
      return await descarregarAgora(videoId, url, knownLength, durationSeconds, opts, dest);
    } finally {
      largarVez(bilhete);
    }
  })();

  emCurso.set(videoId, meu);
  try {
    return await meu;
  } finally {
    // So se apaga a PROPRIA: entre o fim desta e esta linha pode ja ter
    // comecado outra para a mesma faixa, e apagar a dela deixava duas a andar.
    if (emCurso.get(videoId) === meu) emCurso.delete(videoId);
  }
}

async function descarregarAgora(
  videoId: string,
  url: string,
  knownLength: number | null,
  durationSeconds: number | null,
  opts: DownloadOptions,
  dest: any
): Promise<string> {

  let currentUrl = url;
  let chunkSize = CHUNK_BYTES;
  const total = knownLength ?? (await discoverContentLength(url, opts.shouldAbort));
  if (!Number.isSafeInteger(total) || total<=0 || total>MAX_AUDIO_BYTES) throw new Error('Audio file is too large to download safely.');
  if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
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
      const got = await fetchChunkWithRetry(currentUrl, offset, end, opts.renewUrl, opts.shouldAbort, total);
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
  fixMp4Duration(combined, durationSeconds);

  // Escrever primeiro para .part e so promover depois de confirmar o tamanho.
  // Como estava, o create() publicava o nome final ANTES de a escrita acabar:
  // uma interrupcao deixava um ficheiro truncado com o nome bom, e o
  // `if (dest.exists)` la em cima devolvia-o para sempre -- a faixa nunca mais
  // tocava e nao havia mensagem nenhuma a dizer porque.
  const parcial = new File(audioDir(), `${PREFIX}${videoId}-${Date.now()}-${Math.random().toString(36).slice(2)}.part`);
  const uri = publicarAudio({
    parcial,
    destino: dest,
    dados: combined,
    total,
    abortado: opts.shouldAbort,
    erroDeAborto: DOWNLOAD_ABORTED,
  });
  cachedIdsIndex?.add(videoId);changed();
  return uri;
}

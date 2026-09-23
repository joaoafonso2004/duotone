import { create } from 'zustand';
export const useAudioCache=create<{revision:number}>(()=>({revision:0}));
const changed=()=>useAudioCache.setState(s=>({revision:s.revision+1}));
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fixMp4Duration } from './mp4Fixer';
import { validarRespostaParcial } from './audioRange';
import { largarVez, pedirVez, type Prioridade } from './filaDeDownloads';
import { escolherParaApagar, type FicheiroEmCache } from './limpezaDoCache';
import { AUDIO_INCOMPLETO, publicarAudio } from './publicarDownload';
import { criarMp4AoVivo } from './mp4AoVivo';

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
/**
 * O primeiro pedido de quem toca enquanto descarrega (`transmitirAudio`). A
 * cabeça do m4a tem poucos KB e o AVPlayer começa com uns segundos de som:
 * esperar por 1 MB inteiro num 4G fraco era esperar segundos a mais.
 */
const PRIMEIRO_BOCADO_A_TOCAR = 262_144;
const MAX_ATTEMPTS_PER_CHUNK = 4;

/**
 * De quanto em quanto tempo um pedido à espera da rede volta a perguntar se deve
 * parar, SE ninguém avisar antes. Era de 100 em 100 ms: dez acordares por
 * segundo da thread de JS durante cada download, e o Smart Cache adianta até
 * três músicas e a Daily mix doze. Quem muda aquilo de que um `shouldAbort`
 * depende chama `verificarCancelamentos`, e o pedido pára no instante; este
 * relógio fica só como rede de segurança.
 */
const VERIFICAR_CANCELAMENTO_MS = 1_000;
const verificacoesDeCancelamento = new Set<() => void>();

/** Pergunta JÁ a todos os pedidos à espera da rede se devem parar. */
export function verificarCancelamentos(): void {
  for (const verificar of [...verificacoesDeCancelamento]) verificar();
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_AUDIO_BYTES = 256 * 1024 * 1024;

/**
 * Abortar a rede não chega: a Promise do fetch/corpo pode nunca assentar.
 * A espera também rejeita, para o finally largar a vaga sem esperar 4 minutos.
 * Vale ainda para renewUrl e para quem espera por outro download; nesse caso
 * cancela-se só a espera, nunca o trabalho partilhado de quem ainda o quer.
 */
async function esperarDownload<T>(
  operacao: (signal: AbortSignal) => Promise<T>,
  shouldAbort?: () => boolean,
  prazoMs: number | null = REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
  const controller = new AbortController();
  let interromper!: (erro: Error) => void;
  const interrupcao = new Promise<never>((_, rejeitar) => {
    interromper = (erro) => { rejeitar(erro); controller.abort(); };
  });
  const verificar = () => {
    if (shouldAbort?.()) interromper(new Error(DOWNLOAD_ABORTED));
  };
  const prazo = prazoMs === null ? null : setTimeout(
    () => interromper(new Error('Download sem resposta dentro do prazo')), prazoMs,
  );
  const vigia = shouldAbort ? setInterval(verificar, VERIFICAR_CANCELAMENTO_MS) : null;
  if (shouldAbort) verificacoesDeCancelamento.add(verificar);
  try {
    return await Promise.race([operacao(controller.signal), interrupcao]);
  } finally {
    if (prazo !== null) clearTimeout(prazo);
    if (vigia !== null) clearInterval(vigia);
    verificacoesDeCancelamento.delete(verificar);
  }
}

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
export const MAX_CACHE_BYTES = 500 * 1024 * 1024;

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
  try {
    const res = await esperarDownload(
      (signal) => fetch(url, { headers: { Range: 'bytes=0-1' }, signal }), shouldAbort,
    );
    const range = res.headers.get('content-range'); // "bytes 0-1/4406875"
    const total = range ? Number(range.split('/')[1]) : NaN;
    if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_AUDIO_BYTES) {
      throw new Error('Audio file is too large to download safely.');
    }
    return total;
  } catch (error) {
    if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    throw error;
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
  registo?: { tentativas: number; ultimoHttp: number | null; urlRenovado: boolean },
): Promise<{ bytes: Uint8Array; url: string }> {
  let lastStatus = 0;
  let current = url;
  let renewed = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    if (attempt > 0) await esperarDownload(() => sleep(800 * 2 ** (attempt - 1)), shouldAbort); // 800ms, 1.6s, 3.2s
    if (registo) registo.tentativas = attempt + 1;
    try{
      const resposta = await esperarDownload(async (signal) => {
        const res = await fetch(current, { headers: { Range: `bytes=${start}-${end}` }, signal });
        if (signal.aborted) throw new Error(DOWNLOAD_ABORTED);
        if (registo) registo.ultimoHttp = res.status;
        if (res.status === 206 || res.status === 200) {
          if (expectedTotal === undefined) throw new Error('Total do audio em falta');
          // O tamanho certo no offset errado também corrompe o ficheiro.
          validarRespostaParcial(res, start, end, expectedTotal);
          return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
        }
        return { status: res.status, bytes: null };
      }, shouldAbort);
      if (resposta.bytes) return { bytes: resposta.bytes, url: current };
      lastStatus = resposta.status;
    }
    catch(e){
      if(shouldAbort?.() || (e instanceof Error && e.message === DOWNLOAD_ABORTED))throw new Error(DOWNLOAD_ABORTED);
      if(attempt===MAX_ATTEMPTS_PER_CHUNK-1)throw e;
      continue;
    }
    // O URL do googlevideo está ligado ao IP que o pediu e tem validade. Em
    // 4G o IP muda (troca de célula, reconexão) e o URL que estava em cache
    // morre — e o retry repetia-o ús 4 vezes, dando sempre 403. Pedimos um
    // URL fresco uma vez; se vier, continuamos do mesmo offset com ele.
    if (isDeadUrlStatus(lastStatus)) {
      if (renewUrl && !renewed) {
        renewed = true;
        // O prazo já existia, mas o cancelamento acabava antes deste await:
        // um skip durante a renovação prendia a vaga até aos 30 segundos.
        const fresh = await esperarDownload(() => renewUrl(), shouldAbort).catch((erro) => {
          if (shouldAbort?.() || (erro instanceof Error && erro.message === DOWNLOAD_ABORTED)) throw new Error(DOWNLOAD_ABORTED);
          return null;
        });
        if (shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
        if (fresh) {
          current = fresh;
          if (registo) registo.urlRenovado = true;
          continue;
        }
      }
      // Um 403 não é transitório. Já tentámos URL novo; insistir mais 3 vezes
      // com backoff só atrasa a música ~6s antes do mesmo fim. Sai já para o
      // caller encolher o pedido ou cair para o embed.
      break;
    }
  }
  // O HTTP vai pendurado no erro: e ele que o `classificar` le primeiro. So com
  // a mensagem, um 403 chegou a ser lido como falta de rede.
  const erro: any = new Error(`Chunk download failed (HTTP ${lastStatus}) at byte ${start}`);
  if (lastStatus > 0) erro.http = lastStatus;
  throw erro;
}

export interface DownloadOptions {
  /** Consultado durante as esperas e entre chunks — true aborta (faixa trocada,
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
  downloads.clear();
}

/**
 * O que se sabe de cada download em curso -- para a capa 3D se montar ao ritmo
 * dos bocados (`useMontagemDaCapa`) e para o relatório de uma faixa presa
 * (`relatorioDoArranque.ts`). Por faixa, seja quem for que o pediu: uma faixa que
 * o Smart Cache já estava a adiantar mostra o progresso desse download.
 *
 * `na-fila` é à espera de vaga (`filaDeDownloads`, uma de cada vez); é aí que
 * uma faixa fica parada quando um download de fundo encrava.
 */
export type EstadoDoDownload = {
  videoId: string;
  prioridade: Prioridade;
  fase: 'na-fila' | 'a-descarregar';
  pedidoEm: number;
  inicioEm: number | null;
  bytes: number;
  total: number | null;
  bocados: number;
  bocadoBytes: number;
  ultimoBocadoEm: number | null;
  /** Tentativas no bocado em curso (volta a 0 a cada bocado que chega). */
  tentativas: number;
  ultimoHttp: number | null;
  urlRenovado: boolean;
};

const downloads = new Map<string, EstadoDoDownload>();
const ouvintesDosDownloads = new Set<() => void>();

function avisarDownloads(): void {
  for (const ouvir of [...ouvintesDosDownloads]) ouvir();
}

export function estadoDoDownload(videoId: string): EstadoDoDownload | null {
  const estado = downloads.get(videoId);
  return estado ? { ...estado } : null;
}

export function downloadsEmCurso(): EstadoDoDownload[] {
  return [...downloads.values()].map((estado) => ({ ...estado }));
}

/** Chamado quando um download entra na fila, começa, recebe um bocado ou acaba. */
export function ouvirDownloads(ouvir: () => void): () => void {
  ouvintesDosDownloads.add(ouvir);
  return () => { ouvintesDosDownloads.delete(ouvir); };
}

/**
 * O resumo de um download que chegou a começar, para o evento
 * `download_terminado` (ver `state/medicoes.ts`). Sem o id da faixa: é uma
 * medição, não um histórico.
 */
export type FimDeDownload = {
  resultado: 'ok' | 'falhou' | 'cancelado' | 'nao-publicado';
  modo: 'ficheiro' | 'stream';
  prioridade: Prioridade;
  msNaFila: number;
  msADescarregar: number;
  bocados: number;
  bytes: number;
  urlRenovado: boolean;
};

const ouvintesDoFim = new Set<(fim: FimDeDownload) => void>();

export function ouvirFimDosDownloads(ouvir: (fim: FimDeDownload) => void): () => void {
  ouvintesDoFim.add(ouvir);
  return () => { ouvintesDoFim.delete(ouvir); };
}

function resultadoDoErro(erro: unknown): FimDeDownload['resultado'] {
  return erro instanceof Error && erro.message === DOWNLOAD_ABORTED ? 'cancelado' : 'falhou';
}

function avisarFim(registo: EstadoDoDownload, resultado: FimDeDownload['resultado'], modo: FimDeDownload['modo']): void {
  // Um pedido que nunca saiu da fila não mediu nada.
  if (registo.inicioEm === null) return;
  const agora = Date.now();
  const fim: FimDeDownload = {
    resultado,
    modo,
    prioridade: registo.prioridade,
    msNaFila: Math.max(0, registo.inicioEm - registo.pedidoEm),
    msADescarregar: Math.max(0, agora - registo.inicioEm),
    bocados: registo.bocados,
    bytes: registo.bytes,
    urlRenovado: registo.urlRenovado,
  };
  for (const ouvir of [...ouvintesDoFim]) {
    try { ouvir(fim); } catch { /* quem mede não parte o download */ }
  }
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
      const uri = await esperarDownload(() => jaAnda, opts.shouldAbort, null);
      if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
      return uri;
    } catch (e: any) {
      if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
      if (dest.exists) return dest.uri;
      if (e?.message !== DOWNLOAD_ABORTED) throw e;
      // Abandonado por quem o comecou. Segue-se para o caminho normal.
    }
  }

  const meu = (async () => {
    const registo: EstadoDoDownload = {
      videoId, prioridade: opts.prioridade ?? 'explicito', fase: 'na-fila', pedidoEm: Date.now(), inicioEm: null,
      bytes: 0, total: knownLength, bocados: 0, bocadoBytes: CHUNK_BYTES, ultimoBocadoEm: null,
      tentativas: 0, ultimoHttp: null, urlRenovado: false,
    };
    downloads.set(videoId, registo);
    avisarDownloads();
    let resultado: FimDeDownload['resultado'] = 'ok';
    try {
      // O sinal retira o pedido da fila; só desistir da Promise deixaria um
      // pedido fantasma a ocupar uma vaga quando chegasse a sua vez.
      const bilhete = await esperarDownload(
        (signal) => pedirVez(opts.prioridade ?? 'explicito', signal), opts.shouldAbort, null,
      );
      try {
        // Entre pedir a vez e chega-la, a faixa pode ter mudado ou outro job pode
        // ter descarregado esta mesma.
        if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
        if (dest.exists) return dest.uri;
        registo.fase = 'a-descarregar';
        registo.inicioEm = Date.now();
        avisarDownloads();
        return await descarregarAgora(videoId, url, knownLength, durationSeconds, opts, dest, registo);
      } finally {
        largarVez(bilhete);
      }
    } catch (erro) {
      resultado = resultadoDoErro(erro);
      throw erro;
    } finally {
      if (downloads.get(videoId) === registo) {
        downloads.delete(videoId);
        avisarDownloads();
      }
      avisarFim(registo, resultado, 'ficheiro');
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

/** O tamanho do ficheiro, já conferido contra o teto. */
async function totalDoAudio(
  url: string,
  knownLength: number | null,
  opts: DownloadOptions,
  registo?: EstadoDoDownload,
): Promise<number> {
  const total = knownLength ?? (await discoverContentLength(url, opts.shouldAbort));
  if (!Number.isSafeInteger(total) || total<=0 || total>MAX_AUDIO_BYTES) throw new Error('Audio file is too large to download safely.');
  if (registo) { registo.total = total; avisarDownloads(); }
  if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
  return total;
}

/**
 * Pede o ficheiro aos bocados, por ordem, e entrega cada um a `receber`.
 * Partilhado pelo download de sempre e pelo que toca enquanto descarrega:
 * as renovações, o encolher depois de um 403 e o cancelamento são os mesmos.
 */
async function pedirBocados(
  url: string,
  total: number,
  opts: DownloadOptions,
  registo: EstadoDoDownload | undefined,
  receber: (bocado: Uint8Array, offset: number) => void,
  primeiroBocado: number = CHUNK_BYTES,
): Promise<void> {
  let currentUrl = url;
  let chunkSize = CHUNK_BYTES;
  let offset = 0;
  let first = true;
  while (offset < total) {
    if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    if (!first) await sleep(CHUNK_PACING_MS);
    const pedido = first ? Math.min(chunkSize, primeiroBocado) : chunkSize;
    first = false;
    const end = Math.min(offset + pedido, total) - 1;
    let part: Uint8Array;
    try {
      const got = await fetchChunkWithRetry(currentUrl, offset, end, opts.renewUrl, opts.shouldAbort, total, registo);
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
    receber(part, offset);
    offset = end + 1;
    opts.onProgress?.(Math.min(1, offset / total));
    if (registo) {
      registo.bytes = offset;
      registo.bocados += 1;
      registo.bocadoBytes = chunkSize;
      registo.ultimoBocadoEm = Date.now();
      registo.tentativas = 0;
      avisarDownloads();
    }
  }
}

async function descarregarAgora(
  videoId: string,
  url: string,
  knownLength: number | null,
  durationSeconds: number | null,
  opts: DownloadOptions,
  dest: any,
  registo?: EstadoDoDownload
): Promise<string> {
  const total = await totalDoAudio(url, knownLength, opts, registo);
  const combined = new Uint8Array(total);
  // Escreve diretamente no buffer final — sem parts[] intermédio, que
  // duplicava o pico de RAM (2× o ficheiro; ~220MB num mix de 2h).
  await pedirBocados(url, total, opts, registo, (part, offset) => combined.set(part, offset));
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

// ------------------------------------------------------------
// Tocar enquanto descarrega
// ------------------------------------------------------------

/**
 * A ponte para o módulo nativo que serve o ficheiro ao AVPlayer à medida que
 * ele cresce (`modules/duotone-stream`). Entra por parâmetro: os testes dão uma
 * de mentira, e a app a verdadeira.
 */
export type LigacaoAoMotor = {
  /** Abre uma sessão sobre o `.part` e devolve a uri a dar ao motor. */
  abrir(sessao: string, caminho: string, total: number): string;
  /** Já há `disponiveis` bytes no disco, a contar do início. */
  cresceu(sessao: string, disponiveis: number): void;
  /** O ficheiro está todo no disco. */
  concluir(sessao: string): void;
  /** Esquece a sessão; os pedidos do motor por responder falham. */
  fechar(sessao: string): void;
};

export type Transmissao =
  | { tipo: 'ficheiro'; uri: string }
  | {
      tipo: 'stream';
      uri: string;
      sessao: string;
      /**
       * O ficheiro já na cache quando o download acabar; `null` se não se
       * publicou (ver `mp4AoVivo`). Rejeita se o download falhar a meio.
       */
      ficheiro: Promise<string | null>;
      /** Larga o lado nativo. Quem toca chama-o quando deixa de tocar isto. */
      fechar: () => void;
    };

function nomeDoParcial(videoId: string): string {
  return `${PREFIX}${videoId}-${Date.now()}-${Math.random().toString(36).slice(2)}.part`;
}

/**
 * Descarrega como o `downloadProgressiveAudio`, mas escreve para o disco à
 * medida que os bocados chegam e entrega o `.part` a crescer ao AVPlayer: o som
 * começa com o primeiro bocado em vez de esperar pelo ficheiro inteiro.
 *
 * Resolve quando os primeiros bytes (a cabeça já corrigida, ver `mp4AoVivo`)
 * estão em disco. Se a faixa já está descarregada, ou se já anda um download
 * dela (o Smart Cache adiantou-a), devolve `ficheiro`, como o caminho antigo.
 * Se o módulo nativo recusar a sessão, o download segue na mesma e devolve o
 * ficheiro no fim: nunca é pior do que dantes.
 *
 * Ocupa a MESMA vaga da fila e aparece no MESMO registo (`estadoDoDownload`),
 * e quem pedir esta faixa entretanto espera por ele (`emCurso`).
 */
export async function transmitirAudio(
  videoId: string,
  url: string,
  knownLength: number | null,
  durationSeconds: number | null,
  ligacao: LigacaoAoMotor,
  opts: DownloadOptions = {},
): Promise<Transmissao> {
  const dest = cachedAudioFile(videoId);
  if (dest.exists) return { tipo: 'ficheiro', uri: dest.uri };
  if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
  if (emCurso.has(videoId)) {
    return { tipo: 'ficheiro', uri: await downloadProgressiveAudio(videoId, url, knownLength, durationSeconds, opts) };
  }

  const sessao = `${videoId.replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let fechada = false;
  const fechar = () => {
    if (fechada) return;
    fechada = true;
    try { ligacao.fechar(sessao); } catch { /* sem módulo, nada a largar */ }
  };

  let entregue = false;
  let entregar!: (t: Transmissao) => void;
  let recusar!: (erro: unknown) => void;
  const arranque = new Promise<Transmissao>((sim, nao) => { entregar = sim; recusar = nao; });

  // O que fica no `emCurso` para quem se juntar (ver mais abaixo).
  let partilhado: Promise<string> | null = null;
  const meu = (async (): Promise<string | null> => {
    const registo: EstadoDoDownload = {
      videoId, prioridade: opts.prioridade ?? 'reproducao', fase: 'na-fila', pedidoEm: Date.now(), inicioEm: null,
      bytes: 0, total: knownLength, bocados: 0, bocadoBytes: CHUNK_BYTES, ultimoBocadoEm: null,
      tentativas: 0, ultimoHttp: null, urlRenovado: false,
    };
    downloads.set(videoId, registo);
    avisarDownloads();
    let resultado: FimDeDownload['resultado'] = 'ok';
    try {
      const bilhete = await esperarDownload(
        (signal) => pedirVez(opts.prioridade ?? 'reproducao', signal), opts.shouldAbort, null,
      );
      try {
        if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
        if (dest.exists) return dest.uri;
        registo.fase = 'a-descarregar';
        registo.inicioEm = Date.now();
        avisarDownloads();
        const publicado = await transmitirAgora(videoId, url, knownLength, durationSeconds, opts, dest, registo, ligacao, sessao, (uri) => {
          if (entregue) return;
          entregue = true;
          entregar({ tipo: 'stream', uri, sessao, ficheiro: meu, fechar });
        });
        if (publicado === null) resultado = 'nao-publicado';
        return publicado;
      } finally {
        largarVez(bilhete);
      }
    } catch (erro) {
      resultado = resultadoDoErro(erro);
      throw erro;
    } finally {
      if (downloads.get(videoId) === registo) {
        downloads.delete(videoId);
        avisarDownloads();
      }
      avisarFim(registo, resultado, 'stream');
      // Sai do `emCurso` ANTES de assentar: quem reage ao fim deste (a rede de
      // segurança do leitor, depois de um download falhado a meio) tem de
      // começar um download novo, e não juntar-se a este que já acabou.
      if (partilhado && emCurso.get(videoId) === partilhado) emCurso.delete(videoId);
    }
  })();

  // Para quem se juntar: um ficheiro que não se publicou é, para eles, um
  // download abandonado -- e aí descarregam-no pelo caminho antigo.
  const juntar = meu.then((uri) => {
    if (uri === null) throw new Error(DOWNLOAD_ABORTED);
    return uri;
  });
  juntar.catch(() => {});
  partilhado = juntar;
  emCurso.set(videoId, juntar);

  meu.then(
    (uri) => {
      if (entregue) return;
      // Acabou sem nunca ter aberto a torneira ao motor.
      entregue = true;
      fechar();
      if (uri) { entregar({ tipo: 'ficheiro', uri }); return; }
      downloadProgressiveAudio(videoId, url, knownLength, durationSeconds, opts)
        .then((u) => entregar({ tipo: 'ficheiro', uri: u }), recusar);
    },
    (erro) => {
      if (entregue) return;
      entregue = true;
      fechar();
      recusar(erro);
    },
  );
  return arranque;
}

async function transmitirAgora(
  videoId: string,
  url: string,
  knownLength: number | null,
  durationSeconds: number | null,
  opts: DownloadOptions,
  dest: any,
  registo: EstadoDoDownload,
  ligacao: LigacaoAoMotor,
  sessao: string,
  aoArrancar: (uri: string) => void,
): Promise<string | null> {
  const total = await totalDoAudio(url, knownLength, opts, registo);
  const parcial = new File(audioDir(), nomeDoParcial(videoId));
  let publicado = false;
  let escrita: any = null;
  try {
    parcial.create();
    escrita = parcial.open('w');
    let uriDoMotor: string | null = null;
    try {
      uriDoMotor = ligacao.abrir(sessao, parcial.uri, total);
    } catch {
      // Sem sessão nativa o download continua: no fim há ficheiro na mesma.
    }

    const remendo = criarMp4AoVivo(durationSeconds);
    let escritos = 0;
    const escrever = (dados: Uint8Array) => {
      if (!dados.length) return;
      escrita.writeBytes(dados);
      escritos += dados.length;
      if (!uriDoMotor) return;
      try { ligacao.cresceu(sessao, escritos); } catch { /* o motor espera pelo fim */ }
      aoArrancar(uriDoMotor);
    };
    await pedirBocados(url, total, opts, registo, (bocado) => escrever(remendo.receber(bocado)), PRIMEIRO_BOCADO_A_TOCAR);
    const { resto, exato } = remendo.acabar();
    escrever(resto);
    escrita.close();
    escrita = null;
    if (escritos !== total || parcial.size !== total) throw new Error(AUDIO_INCOMPLETO);
    if (uriDoMotor) {
      try { ligacao.concluir(sessao); } catch { /* idem */ }
    }
    if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    // Não se publica o que não ficou igual ao do caminho antigo. O motor
    // continua a ler o que já abriu: apagar um ficheiro aberto não o tira a
    // quem o tem aberto.
    if (!exato) return null;
    if (dest.exists) return dest.uri;
    parcial.moveSync(dest);
    publicado = true;
    cachedIdsIndex?.add(videoId);changed();
    return dest.uri;
  } finally {
    if (escrita) {
      try { escrita.close(); } catch { /* já fechada */ }
    }
    // Pela bandeira e não pelo `exists`: depois do moveSync o objeto aponta
    // para o destino (ver publicarDownload.ts).
    if (!publicado) {
      try { if (parcial.exists) parcial.delete(); } catch { /* lixo, não erro */ }
    }
  }
}

/** Um `.part` com mais do que isto é de um download que a app não acabou. */
const PARCIAL_ESQUECIDO_MS = 30 * 60 * 1000;

/**
 * Apaga os `.part` que ficaram de downloads interrompidos (a app fechada a
 * meio de uma música que tocava enquanto descarregava). O caminho antigo
 * escrevia o `.part` e mudava-lhe o nome no mesmo instante; este vive o
 * download inteiro. A idade vem do nome, e um recente nunca se apaga: pode
 * estar a ser escrito.
 */
export function limparParciaisEsquecidos(agora: number = Date.now()): void {
  if (Platform.OS === 'web') return;
  try {
    for (const entry of audioDir().list()) {
      if (!(entry instanceof File) || !entry.name.startsWith(PREFIX) || !entry.name.endsWith('.part')) continue;
      const criado = Number(/-(\d{12,})-[a-z0-9]*\.part$/.exec(entry.name)?.[1]);
      if (Number.isFinite(criado) && agora - criado < PARCIAL_ESQUECIDO_MS) continue;
      try { entry.delete(); } catch { /* em uso: fica para a próxima */ }
    }
  } catch {
    // oportunista, como a limpeza da cache
  }
}

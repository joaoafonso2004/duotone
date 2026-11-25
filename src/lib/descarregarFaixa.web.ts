import { create } from 'zustand';
import { resolveYouTubeStream } from '../api/ytstream';
import { useConnectivity } from '../state/connectivity';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { criarAcoesDeDownload } from './acoesDeDownload';
import { downloadNoMenu, situacaoDoDownload, type DownloadNoMenu, type SituacaoDoDownload } from './downloadsExplicitos';
import {
  carregarFixados, esquecerPedido, esquecerPedidos, esquecerTodos, marcarADescarregar, registarPedido, temPedido, useDownloadsFixados,
} from './downloadsFixados';
import { criarLotesDeDownload, type EstadoDoLote } from './loteDeDownloads';

/**
 * Ouvir sem rede no PC (25/11). Na Duotone em Tauri o som é um ficheiro servido
 * pela casca (`/audio/<id>`, `desktop/src/audio.rs`), e o que tocou inteiro já
 * ficava na cache dela. Agora há também os downloads PEDIDOS, numa pasta que a
 * poda do arranque não toca, com as mesmas decisões do iPhone: o pedido não é o
 * ficheiro (`downloadsExplicitos.ts`), as corridas (`acoesDeDownload.ts`) e as
 * listas uma música de cada vez, com pausa (`loteDeDownloads.ts`).
 *
 * - **O disco quem o sabe é a casca** (`audioNoDisco`): os downloads e a cache.
 *   Lê-se ao arrancar, depois de cada download e a cada música nova (a cache
 *   ganha a que acabou de tocar inteira). É um `read_dir` local, sem rede.
 * - **Descarregar** é resolver (o `ytstream.ts`, como o clique) e a casca buscar
 *   os bytes aos bocados de 1 MB. Uma música já inteira na cache só se copia.
 * - Sem a casca nova (o Electron, a Duotone no browser) nada disto existe: as
 *   funções dizem que não, como o ficheiro antigo dizia sempre.
 */

const ponte = (): any => (typeof window !== 'undefined' ? (window as any).duotoneDesktop : undefined);

/** A casca guarda áudio (só a Duotone em Tauri). */
function temDisco(): boolean {
  return typeof ponte()?.descarregarAudio === 'function';
}

type Disco = { descarregadas: Set<string>; emCache: Set<string>; revisao: number };
const useDisco = create<Disco>(() => ({ descarregadas: new Set(), emCache: new Set(), revisao: 0 }));

let lido = false;
let aLer: Promise<void> | null = null;
/** Relê o que está no disco. Vários pedidos ao mesmo tempo partilham a leitura. */
function lerODisco(): Promise<void> {
  if (!temDisco()) return Promise.resolve();
  if (aLer) return aLer;
  aLer = (async () => {
    try {
      const r = await ponte().audioNoDisco();
      const descarregadas = new Set<string>(Array.isArray(r?.descarregadas) ? r.descarregadas : []);
      const emCache = new Set<string>(Array.isArray(r?.emCache) ? r.emCache : []);
      useDisco.setState((s) => ({ descarregadas, emCache, revisao: s.revisao + 1 }));
    } catch { /* fica o que se sabia */ }
    // Os pedidos guardados (no localStorage) leem-se uma vez, mesmo que o disco
    // não tenha respondido: sem isto, gravar um pedido esperava para sempre.
    if (!lido) {
      lido = true;
      await carregarFixados(() => [...useDisco.getState().descarregadas]);
    }
    aLer = null;
  })();
  return aLer;
}

let ligado = false;
function ligar(): void {
  if (ligado || !temDisco()) return;
  ligado = true;
  void lerODisco();
  // Uma música nova: a anterior pode ter ficado inteira na cache.
  usePlayer.subscribe((s, p) => {
    if (s.current?.sourceId !== p.current?.sourceId) void lerODisco();
  });
  // Ao ficar sem rede, o que toca é o que lá está agora.
  useConnectivity.subscribe((s, p) => { if (s.offline && !p.offline) void lerODisco(); });
}

/** Neste aparelho dá para ouvir sem rede (no PC, só com a casca nova). */
export function ouveSemRedeNesteAparelho(): boolean {
  ligar();
  return temDisco();
}

export function podeDescarregar(track: Track): boolean {
  ligar();
  return temDisco() && track.source === 'youtube' && !!track.sourceId;
}

/** Toca sem rede: está inteira no disco, descarregada ou na cache. */
export function tocaSemRede(track: Track): boolean {
  if (!podeDescarregar(track)) return false;
  const d = useDisco.getState();
  return d.descarregadas.has(track.sourceId) || d.emCache.has(track.sourceId);
}

/** O download PEDIDO: conta como em disco só o que está na pasta dos downloads (a protegida). */
export function situacaoDoDownloadDe(track: Track): SituacaoDoDownload {
  if (!podeDescarregar(track)) return 'nenhum';
  const s = useDownloadsFixados.getState();
  return situacaoDoDownload({
    pedido: track.sourceId in s.registo.pedidos,
    emDisco: useDisco.getState().descarregadas.has(track.sourceId),
    aDescarregar: s.aDescarregar.has(track.sourceId),
  });
}

export function downloadNoMenuDe(track: Track): DownloadNoMenu {
  return downloadNoMenu(situacaoDoDownloadDe(track));
}

export function useRevisaoDosDownloads(): void {
  useDownloadsFixados((s) => s.registo.pedidos);
  useDownloadsFixados((s) => s.aDescarregar);
  useDisco((s) => s.revisao);
}

/** O ↓ das linhas: descarregada de propósito e na pasta. Só redesenha a linha dela. */
export function useDescarregadaDeProposito(track: Track): boolean {
  const pedida = useDownloadsFixados((s) => podeDescarregar(track) && track.sourceId in s.registo.pedidos);
  return useDisco((s) => pedida && s.descarregadas.has(track.sourceId));
}

const CANCELADO = 'Download cancelled';
/**
 * O que a casca disse: a ponte embrulha o erro do Rust num `Error` (`desktop/src/ponte.js`).
 * Só se compara ("expirada", "cancelado"): nunca chega à interface, que avisa pelo
 * `acoesDeDownload` (e esse só escreve na consola).
 */
const motivo = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

const acoes = criarAcoesDeDownload({
  registar: (t) => registarPedido(t),
  esquecer: esquecerPedido,
  esquecerVarios: esquecerPedidos,
  esquecerTodos,
  temPedido,
  emDisco: (id) => useDisco.getState().descarregadas.has(id),
  marcarADescarregar,
  semRede: () => useConnectivity.getState().offline,
  async descarregar(track, parar) {
    const p = ponte();
    const id = track.sourceId;
    const resolver = async (deNovo: boolean) => {
      const s = await resolveYouTubeStream(id, 'high', deNovo, 'opus');
      if (s.isHls || !s.contentLength) throw new Error('sem ficheiro de áudio (HLS)');
      return { url: s.url, tamanho: s.contentLength, mime: s.formato === 'opus' ? 'audio/webm; codecs="opus"' : 'audio/mp4; codecs="mp4a.40.2"' };
    };
    // Inteira na cache: a casca copia-a, sem resolver nem ir à rede.
    let fonte = useDisco.getState().emCache.has(id) ? null : await resolver(false);
    if (parar()) throw new Error(CANCELADO);
    // O "Cancel download" chega à casca entre dois bocados.
    const vigia = setInterval(() => { if (parar()) void p.cancelarDownloadDeAudio(id).catch(() => {}); }, 400);
    try {
      try {
        await p.descarregarAudio(id, fonte?.url, fonte?.tamanho, fonte?.mime);
      } catch (e) {
        // O endereço da memória do resolvedor já expirou (vale até 5 h): uma vez de novo, como o leitor.
        if (motivo(e) !== 'expirada' || !fonte || parar()) throw e;
        fonte = await resolver(true);
        await p.descarregarAudio(id, fonte.url, fonte.tamanho, fonte.mime);
      }
    } catch (e) {
      throw new Error(motivo(e) === 'cancelado' || parar() ? CANCELADO : motivo(e));
    } finally {
      clearInterval(vigia);
      await lerODisco();
    }
  },
  apagarFicheiro: (id) => {
    void Promise.resolve(ponte()?.tirarDownloadDeAudio?.(id)).catch(() => {}).finally(() => { void lerODisco(); });
  },
  apagarTudo: () => {
    const ids = [...useDisco.getState().descarregadas];
    void Promise.all(ids.map((id) => Promise.resolve(ponte()?.tirarDownloadDeAudio?.(id)).catch(() => {})))
      .finally(() => { void lerODisco(); });
  },
  avisarCancelamentos: () => {},
  foiCancelado: (erro) => erro instanceof Error && erro.message === CANCELADO,
  avisar: (msg, e) => console.warn(msg, e),
});

export async function alternarDownload(track: Track): Promise<void> {
  if (!podeDescarregar(track)) return;
  await acoes.alternar(track, situacaoDoDownloadDe(track));
}

export async function pedirDownload(track: Track): Promise<void> {
  if (!podeDescarregar(track)) return;
  await acoes.pedir(track);
}

export async function tirarDownload(videoId: string): Promise<void> {
  await acoes.tirar(videoId);
}

export async function limparTodosOsDownloads(): Promise<void> {
  if (!temDisco()) return;
  await acoes.limparTudo();
}

/** No PC não há Daily mix adiantada: o que fica no disco é o que se pede e o que tocou. */
export async function guardarEmSegundoPlano(_faixas: readonly Track[], _opcoes?: { opcional?: boolean }): Promise<number> {
  return 0;
}

/** As listas: uma música de cada vez, com a pausa do `loteDeDownloads.ts` entre elas. */
const useLotes = create<{ revisao: number }>(() => ({ revisao: 0 }));

function esperarPelaRede(): Promise<void> {
  return new Promise((resolve) => {
    let feito = false;
    const acabar = () => {
      if (feito) return;
      feito = true;
      clearTimeout(relogio);
      largar();
      resolve();
    };
    const largar = useConnectivity.subscribe((s, p) => { if (s.offline !== p.offline) acabar(); });
    const relogio = setTimeout(acabar, 30_000);
  });
}

const lotes = criarLotesDeDownload<Track>({
  id: (t) => t.sourceId,
  jaTratada: (t) => {
    const s = situacaoDoDownloadDe(t);
    return s === 'descarregada' || s === 'a-descarregar';
  },
  emDisco: (t) => useDisco.getState().descarregadas.has(t.sourceId) || useDisco.getState().emCache.has(t.sourceId),
  pedir: async (t) => (await acoes.pedir(t)) === 'descarregada',
  tirar: (id) => acoes.tirar(id),
  semRede: () => useConnectivity.getState().offline,
  // O PC não tem dados móveis: a rede é a de casa.
  dadosMoveis: () => false,
  esperarPelaRede,
  pausa: (ms) => new Promise((r) => setTimeout(r, ms)),
  aoMudar: () => useLotes.setState((s) => ({ revisao: s.revisao + 1 })),
});

export function descarregarLista(chave: string, faixas: readonly Track[]): void {
  if (!temDisco()) return;
  lotes.juntar(chave, faixas.filter(podeDescarregar));
}

export async function cancelarDownloadDaLista(chave: string): Promise<void> {
  await lotes.cancelar(chave);
}

export function usarDadosMoveisNaLista(chave: string): void {
  lotes.permitirDadosMoveis(chave);
}

export async function tirarDownloadsDaLista(faixas: readonly Track[]): Promise<void> {
  const ids = faixas.filter((t) => podeDescarregar(t) && temPedido(t.sourceId)).map((t) => t.sourceId);
  await acoes.tirarVarias(Array.from(new Set(ids)));
}

export function useDownloadDaLista(chave: string): EstadoDoLote {
  useLotes((s) => s.revisao);
  useConnectivity((s) => s.offline);
  return lotes.estado(chave);
}

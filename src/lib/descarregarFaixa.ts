import { create } from 'zustand';
import { useConnectivity } from '../state/connectivity';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { criarAcoesDeDownload } from './acoesDeDownload';
import { criarLotesDeDownload, type EstadoDoLote } from './loteDeDownloads';
import { downloadNoMenu, situacaoDoDownload, type DownloadNoMenu, type SituacaoDoDownload } from './downloadsExplicitos';
import {
  esquecerPedido, esquecerPedidos, esquecerTodos, marcarADescarregar, registarPedido, temPedido, useDownloadsFixados,
} from './downloadsFixados';
import { podeDescarregarOpcionais } from './adiantarFaixas';
import { estadoDeEnergia } from '../../modules/duotone-diagnostico';
import { faixasParaGuardar } from './misturaDoDia';
import { getAudioQuality } from './prefs';
import { resolverEDescarregar } from './resolverEDescarregar';
import {
  clearDownloadedAudioCache, DOWNLOAD_ABORTED, isAudioCached,
  removeDownloadedAudio, useAudioCache, verificarCancelamentos,
} from './youtubeCache';
import { AppState } from 'react-native';

/**
 * Os cancelamentos destes downloads dependem da rede e do leitor (ver os
 * `shouldAbort` abaixo). Quando um dos dois muda, pergunta-se logo a quem está à
 * espera da rede, em vez de esperar pela verificação periódica
 * (`verificarCancelamentos`, em youtubeCache.ts). Liga-se da primeira vez que é
 * preciso, e não ao importar: nesse instante as lojas podem ainda não existir.
 */
let vigiasLigadas = false;
function ligarVigias(): void {
  if (vigiasLigadas) return;
  vigiasLigadas = true;
  useConnectivity.subscribe(() => verificarCancelamentos());
  usePlayer.subscribe((s, p) => {
    if (s.activeBackend !== p.activeBackend || s.buffering !== p.buffering) verificarCancelamentos();
  });
}

/**
 * Descarregar uma faixa para ouvir sem rede, a partir de qualquer menu.
 *
 * Vivia dentro do `TrackActionsSheet`, e por isso só as listas tinham
 * download: o leitor, a fila e o chat não. Os menus passaram a ser os mesmos
 * em todo o lado (lib/menuDaFaixa.ts), e este é o bocado que eles partilham.
 *
 * Só YouTube, e só no iPhone -- no PC há o `.web.ts`, que não faz nada: lá o
 * leitor é o player oficial e não guarda áudio.
 */

export function podeDescarregar(track: Track): boolean {
  return track.source === 'youtube' && !!track.sourceId;
}

/**
 * Toca sem rede: o ficheiro está em disco, venha de onde vier (um download,
 * uma música que já tocou, o Smart Cache). NÃO quer dizer que foi descarregada
 * de propósito -- isso é a `situacaoDoDownloadDe`.
 */
export function tocaSemRede(track: Track): boolean {
  return podeDescarregar(track) && isAudioCached(track.sourceId);
}

/** O download PEDIDO desta faixa (ver lib/downloadsExplicitos.ts). */
export function situacaoDoDownloadDe(track: Track): SituacaoDoDownload {
  if (!podeDescarregar(track)) return 'nenhum';
  const s = useDownloadsFixados.getState();
  return situacaoDoDownload({
    pedido: track.sourceId in s.registo.pedidos,
    emDisco: isAudioCached(track.sourceId),
    aDescarregar: s.aDescarregar.has(track.sourceId),
  });
}

export function downloadNoMenuDe(track: Track): DownloadNoMenu {
  return downloadNoMenu(situacaoDoDownloadDe(track));
}

/**
 * Para quem desenha: volta a desenhar quando muda um pedido, um download a
 * andar ou o disco. O que se mostra lê-se a seguir com as funções de cima.
 */
export function useRevisaoDosDownloads(): void {
  useDownloadsFixados((s) => s.registo.pedidos);
  useDownloadsFixados((s) => s.aDescarregar);
  useAudioCache((s) => s.revision);
}

/** A faixa foi descarregada de propósito e está em disco -- o ↓ das listas. */
export function useDescarregadaDeProposito(track: Track): boolean {
  const pedida = useDownloadsFixados((s) => podeDescarregar(track) && track.sourceId in s.registo.pedidos);
  // O seletor devolve o booleano, e não a revisão: um download de OUTRA faixa
  // não volta a desenhar as linhas todas de uma lista.
  return useAudioCache((s) => s.revision >= 0 && pedida && isAudioCached(track.sourceId));
}

const acoes = criarAcoesDeDownload({
  registar: (t) => registarPedido(t),
  esquecer: esquecerPedido,
  esquecerVarios: esquecerPedidos,
  esquecerTodos,
  temPedido,
  emDisco: isAudioCached,
  marcarADescarregar,
  semRede: () => useConnectivity.getState().offline,
  async descarregar(track, parar) {
    ligarVigias();
    const quality = await getAudioQuality();
    if (parar()) throw new Error(DOWNLOAD_ABORTED);
    // Só há HLS: não há ficheiro para guardar. Fica em falta, e a lista diz.
    await resolverEDescarregar(track.sourceId, quality, track.durationSeconds, { prioridade: 'explicito', shouldAbort: parar });
  },
  apagarFicheiro: removeDownloadedAudio,
  apagarTudo: clearDownloadedAudioCache,
  avisarCancelamentos: verificarCancelamentos,
  foiCancelado: (e) => e instanceof Error && e.message === DOWNLOAD_ABORTED,
  avisar: (msg, e) => console.warn(msg, e),
});

/** "Download" num menu, ou "Remove download"/"Cancel download". Falhar não interrompe nada. */
export async function alternarDownload(track: Track): Promise<void> {
  if (!podeDescarregar(track)) return;
  await acoes.alternar(track, situacaoDoDownloadDe(track));
}

/** Pede o download (idempotente). Para o "Retry" da lista de Downloads. */
export async function pedirDownload(track: Track): Promise<void> {
  if (!podeDescarregar(track)) return;
  await acoes.pedir(track);
}

/** Tira o pedido e apaga o ficheiro desta faixa. */
export async function tirarDownload(videoId: string): Promise<void> {
  await acoes.tirar(videoId);
}

/**
 * Uma playlist inteira de uma vez (15/11, `lib/loteDeDownloads.ts`): uma
 * música de cada vez, pela mesma porta do "Download" de uma só. Para quem
 * desenha há o `useDownloadDaLista`.
 */
const useLotes = create<{ revisao: number }>(() => ({ revisao: 0 }));

/** Resolve quando a rede muda, ou ao fim de 30 s (por segurança: uma mudança perdida não prende o lote). */
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
    const largar = useConnectivity.subscribe((s, p) => {
      if (s.offline !== p.offline || s.dadosMoveis !== p.dadosMoveis) acabar();
    });
    const relogio = setTimeout(acabar, 30_000);
  });
}

const lotes = criarLotesDeDownload<Track>({
  id: (t) => t.sourceId,
  jaTratada: (t) => {
    const s = situacaoDoDownloadDe(t);
    return s === 'descarregada' || s === 'a-descarregar';
  },
  emDisco: (t) => isAudioCached(t.sourceId),
  pedir: async (t) => (await acoes.pedir(t)) === 'descarregada',
  tirar: (id) => acoes.tirar(id),
  semRede: () => useConnectivity.getState().offline,
  dadosMoveis: () => useConnectivity.getState().dadosMoveis,
  esperarPelaRede,
  pausa: (ms) => new Promise((r) => setTimeout(r, ms)),
  aoMudar: () => useLotes.setState((s) => ({ revisao: s.revisao + 1 })),
});

/** "Download" no menu de uma playlist: junta as que faltam à fila de downloads. */
export function descarregarLista(chave: string, faixas: readonly Track[]): void {
  ligarVigias();
  lotes.juntar(chave, faixas.filter(podeDescarregar));
}

/** "Cancel download": pára a lista; as que já estavam ficam. */
export async function cancelarDownloadDaLista(chave: string): Promise<void> {
  await lotes.cancelar(chave);
}

/** "Use mobile data": esta lista deixa de esperar pelo Wi-Fi. */
export function usarDadosMoveisNaLista(chave: string): void {
  lotes.permitirDadosMoveis(chave);
}

/** "Remove download" de uma playlist: tira o pedido e o ficheiro de cada música dela. */
export async function tirarDownloadsDaLista(faixas: readonly Track[]): Promise<void> {
  const ids = faixas.filter((t) => podeDescarregar(t) && temPedido(t.sourceId)).map((t) => t.sourceId);
  await acoes.tirarVarias(Array.from(new Set(ids)));
}

/** Se a lista está a descarregar, à espera de quê, e se o último lote parou por falhas. */
export function useDownloadDaLista(chave: string): EstadoDoLote {
  useLotes((s) => s.revisao);
  useConnectivity((s) => s.offline);
  useConnectivity((s) => s.dadosMoveis);
  return lotes.estado(chave);
}

/**
 * O "Clear YouTube cache" e o "Remover tudo" dos Downloads: todo o áudio, os
 * downloads pedidos incluídos (decisão do João a 11/9), a proteção da
 * migração, e os downloads pedidos que estejam a meio.
 */
export async function limparTodosOsDownloads(): Promise<void> {
  await acoes.limparTudo();
}

/**
 * Deixa descarregadas, em segundo plano, as primeiras músicas de uma lista que
 * se vai ouvir -- a Daily mix (`lib/misturaDoDia.ts`). Uma de cada vez, com a
 * prioridade mais baixa da fila, e nunca em dados móveis.
 *
 * **Pára quando o leitor está a preparar uma música.** A fila de downloads não
 * interrompe ninguém: sem isto, carregar numa música que não está em disco
 * esperava pelo fim do ficheiro da mix que estivesse a meio. Não conta como
 * guardada, e não se tenta outra vez nesta passagem.
 *
 * Não são downloads EXPLÍCITOS: não ficam fixados, e a limpeza da cache no
 * arranque leva-os como leva o resto. Devolve quantas ficaram em disco.
 */
export async function guardarEmSegundoPlano(
  faixas: readonly Track[],
  { opcional = true }: { opcional?: boolean } = {},
): Promise<number> {
  ligarVigias();
  // Opcionais (a Daily mix) param com o iPhone quente ou em modo de poupança
  // (2/10, `podeDescarregarOpcionais`). A seguinte de um amigo que se segue
  // não é opcional: é a música que vem a seguir.
  const deveParar = () => {
    const rede = useConnectivity.getState();
    const leitor = usePlayer.getState();
    return rede.offline || rede.dadosMoveis || leitor.activeBackend === 'resolving' || leitor.buffering
      // Com a app escondida, a Daily mix espera (3/10): o download corre no JavaScript.
      || (opcional && !podeDescarregarOpcionais(estadoDeEnergia(), AppState.currentState !== 'background'));
  };
  let guardadas = 0;
  for (const track of faixasParaGuardar(faixas, isAudioCached, useConnectivity.getState())) {
    if (useConnectivity.getState().offline || useConnectivity.getState().dadosMoveis) break;
    if (isAudioCached(track.sourceId) || deveParar()) continue;
    try {
      const quality = await getAudioQuality();
      const { uri } = await resolverEDescarregar(track.sourceId, quality, track.durationSeconds, {
        prioridade: 'adiantar',
        shouldAbort: deveParar,
      });
      if (uri) guardadas++;
    } catch (err: any) {
      if (err?.message !== DOWNLOAD_ABORTED) console.warn('[Daily mix] Falha ao guardar faixa:', err);
    }
  }
  return guardadas;
}

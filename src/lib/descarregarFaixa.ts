import { criarRenovacao, resolveYouTubeStream } from '../api/ytstream';
import { useConnectivity } from '../state/connectivity';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { faixasParaGuardar } from './misturaDoDia';
import { getAudioQuality } from './prefs';
import { DOWNLOAD_ABORTED, downloadProgressiveAudio, isAudioCached, removeDownloadedAudio, verificarCancelamentos } from './youtubeCache';

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

export function estaDescarregada(track: Track): boolean {
  return podeDescarregar(track) && isAudioCached(track.sourceId);
}

/** Descarrega, ou tira o download se já lá estiver. Falhar não interrompe nada. */
export async function alternarDownload(track: Track): Promise<void> {
  if (!podeDescarregar(track)) return;
  ligarVigias();
  if (isAudioCached(track.sourceId)) {
    removeDownloadedAudio(track.sourceId);
    return;
  }
  try {
    const quality = await getAudioQuality();
    const stream = await resolveYouTubeStream(track.sourceId, quality);
    if (stream.isHls) return;
    await downloadProgressiveAudio(
      track.sourceId,
      stream.url,
      stream.contentLength,
      track.durationSeconds || stream.durationSeconds || null,
      {
        prioridade: 'explicito',
        shouldAbort: () => useConnectivity.getState().offline,
        renewUrl: criarRenovacao(track.sourceId, quality),
      },
    );
  } catch (err) {
    console.warn('[Download] Falha ao descarregar faixa:', err);
  }
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
export async function guardarEmSegundoPlano(faixas: readonly Track[]): Promise<number> {
  ligarVigias();
  const deveParar = () => {
    const rede = useConnectivity.getState();
    const leitor = usePlayer.getState();
    return rede.offline || rede.dadosMoveis || leitor.activeBackend === 'resolving' || leitor.buffering;
  };
  let guardadas = 0;
  for (const track of faixasParaGuardar(faixas, isAudioCached, useConnectivity.getState())) {
    if (useConnectivity.getState().offline || useConnectivity.getState().dadosMoveis) break;
    if (isAudioCached(track.sourceId) || deveParar()) continue;
    try {
      const quality = await getAudioQuality();
      const stream = await resolveYouTubeStream(track.sourceId, quality);
      if (stream.isHls || deveParar()) continue;
      await downloadProgressiveAudio(
        track.sourceId,
        stream.url,
        stream.contentLength,
        track.durationSeconds || stream.durationSeconds || null,
        {
          prioridade: 'adiantar',
          shouldAbort: deveParar,
          renewUrl: criarRenovacao(track.sourceId, quality),
        },
      );
      guardadas++;
    } catch (err: any) {
      if (err?.message !== DOWNLOAD_ABORTED) console.warn('[Daily mix] Falha ao guardar faixa:', err);
    }
  }
  return guardadas;
}

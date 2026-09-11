import { resolveYouTubeStream } from '../api/ytstream';
import { useConnectivity } from '../state/connectivity';
import type { Track } from '../types';
import { getAudioQuality } from './prefs';
import { downloadProgressiveAudio, isAudioCached, removeDownloadedAudio } from './youtubeCache';

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
        renewUrl: async () => (await resolveYouTubeStream(track.sourceId, quality, true)).url,
      },
    );
  } catch (err) {
    console.warn('[Download] Falha ao descarregar faixa:', err);
  }
}

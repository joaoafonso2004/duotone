import { usePlayer } from './player';
import { useOuvirJuntos } from './ouvirJuntos';
import { setRecommendationFeedback } from './recommendationFeedback';
import { trackKey } from '../lib/shuffle';
import type { Track } from '../types';

/**
 * "Not interested" (7/10): um toque, nas músicas que a app sugeriu.
 *
 * O "Recommendations…" já existia nos menus das listas, mas é uma folha com
 * três escolhas, e não estava no leitor -- onde se ouve o Radio e o Smart
 * Shuffle. A app só aprendia com os saltos, e devagar (três músicas do mesmo
 * artista em 30 dias). Isto é o "menos disto" na hora: a música deixa de ser
 * sugerida (a mesma preferência `track` da folha), e sai do caminho -- se é a
 * que toca salta-se, se está no Up next tira-se. Num Jam a fila é de todos:
 * fica só a preferência.
 */

/** A música veio do Radio ou do Smart Shuffle (as marcas da store). */
export function eSugestao(track: Track | null | undefined): boolean {
  if (!track) return false;
  const p = usePlayer.getState();
  const chave = trackKey(track);
  return p.doRadio.includes(chave) || p.sugeridas.includes(chave);
}

export async function naoInteressa(track: Track): Promise<void> {
  const chave = trackKey(track);
  await setRecommendationFeedback({ kind: 'track', key: chave, label: track.title.slice(0, 500) }, true);
  if (useOuvirJuntos.getState().sessao) return;
  const p = usePlayer.getState();
  if (p.current && trackKey(p.current) === chave) { await p.next(true); return; }
  const noUpNext = p.upcomingQueue().find((e) => trackKey(e.track) === chave);
  if (noUpNext) p.removeFromQueue(noUpNext.index);
}

/** A frase do aviso, a mesma nos dois lados. */
export const AVISO_DO_NAO_INTERESSA = 'Got it. We won’t suggest this song again.';

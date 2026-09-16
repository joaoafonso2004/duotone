/**
 * Duplo de src/lib/playbackAlternatives.ts.
 *
 * O real troca o `sourceId` por uma cópia que se saiba tocar. Aqui devolve a
 * faixa tal como veio -- é o caminho normal, e é o que os testes seguem.
 */
import type { Track } from '../../src/types.ts';
import { controlo } from './controlo.ts';

export function applyPlaybackAlternative(t: Track): Promise<Track> {
  return controlo.alternativaPendente ?? Promise.resolve(t);
}
export function rememberPlaybackAlternative(): void {}

/** Duplo de src/lib/playCounts.ts. Regista no `controlo` o que contou. */
import type { Track } from '../../src/types.ts';
import { controlo } from './controlo.ts';

export function incrementPlayCount(track: Track): Promise<void> {
  controlo.contagens.locais.push(track.sourceId);
  return Promise.resolve();
}

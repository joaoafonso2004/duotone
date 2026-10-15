/** Duplo de src/lib/playCounts.ts. Regista no `controlo` o que contou. */
import type { Track } from '../../src/types.ts';
import { controlo } from './controlo.ts';

export function incrementPlayCount(track: Track): Promise<void> {
  controlo.contagens.locais.push(track.sourceId);
  return Promise.resolve();
}

/** O histórico do aparelho (15/10): o Radio não repõe o que se ouviu há pouco. */
export function contagensNoAparelho(): Promise<unknown[]> {
  return Promise.resolve([...controlo.ouvidasNoAparelho]);
}

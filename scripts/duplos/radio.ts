/** Duplo de src/api/radio.ts -- programável. Ver descoberta.ts. */
import { controlo } from './controlo.ts';
import type { Track } from '../../src/types.ts';

export function fetchRadioTracks(): Promise<Track[]> {
  controlo.chamadas.radio++;
  return Promise.resolve([...controlo.radio]);
}

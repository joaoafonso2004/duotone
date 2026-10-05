/** Duplo de src/api/radio.ts -- programável. Ver descoberta.ts. */
import { controlo } from './controlo.ts';
import type { Track } from '../../src/types.ts';

export function fetchRadioTracks(
  sementes?: Track[], _excluir?: Track[], _limite?: number, jaDescobertas?: ReadonlySet<string>, modo: 'automatic' | 'session' = 'automatic',
): Promise<Track[]> {
  controlo.chamadas.radio++;
  controlo.radioJaDescobertas = jaDescobertas ?? null;
  controlo.radioContextos.push([...(sementes ?? [])]); controlo.radioModos.push(modo);
  return controlo.radioPendentes.shift() ?? Promise.resolve([...controlo.radio]);
}

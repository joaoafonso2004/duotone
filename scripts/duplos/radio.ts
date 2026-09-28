/** Duplo de src/api/radio.ts -- programável. Ver descoberta.ts. */
import { controlo } from './controlo.ts';
import type { Track } from '../../src/types.ts';

export function fetchRadioTracks(
  _sementes?: Track[], _excluir?: Track[], _limite?: number, jaDescobertas?: ReadonlySet<string>,
): Promise<Track[]> {
  controlo.chamadas.radio++;
  controlo.radioJaDescobertas = jaDescobertas ?? null;
  return Promise.resolve([...controlo.radio]);
}

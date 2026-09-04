import type { Track } from '../types';

const chave = (track: Pick<Track, 'source' | 'sourceId'>) => `${track.source}:${track.sourceId}`;

/** Calcula o merge sem alterar nenhuma das listas. */
export function planearMerge(target: Track[], source: Track[]): { novas: Track[]; repetidas: number } {
  const existentes = new Set(target.map(chave));
  const vistasNaOrigem = new Set<string>();
  const novas: Track[] = [];
  let repetidas = 0;
  for (const track of source) {
    const key = chave(track);
    if (existentes.has(key) || vistasNaOrigem.has(key)) { repetidas++; continue; }
    vistasNaOrigem.add(key);
    novas.push(track);
  }
  return { novas, repetidas };
}

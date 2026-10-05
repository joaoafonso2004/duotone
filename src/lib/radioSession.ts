import type { Track } from '../types';

/** Apenas escutas que passaram o limiar de contagem; nunca posições da fila. */
export type RadioListeningSession = { owner: string | null; tracks: Track[] };
export function rememberRadioListen(session: RadioListeningSession | null, owner: string | null, track: Track): RadioListeningSession {
  const previous = session?.owner === owner ? session.tracks : [];
  return { owner, tracks: [...previous, track].slice(-20) };
}

/** Frequência nesta sessão primeiro, recência como desempate. Sem perfil global. */
export function radioSessionSeeds(
  session: RadioListeningSession | null, owner: string | null, current: Track,
  artistOf: (t: Track) => string, artistKey: (s: string) => string,
): Track[] {
  const heard = session?.owner === owner ? session.tracks : [];
  const groups = new Map<string, { count: number; last: number; tracks: Track[] }>();
  heard.forEach((track, index) => {
    const name = artistOf(track);
    if (!name || name === 'Unknown artist') return;
    const key = artistKey(name);
    if (!key) return;
    const group = groups.get(key) ?? { count: 0, last: index, tracks: [] };
    group.count++; group.last = index; group.tracks.unshift(track); groups.set(key, group);
  });
  const ranked = [...groups.values()].sort((a,b) => b.count-a.count || b.last-a.last).slice(0,3);
  const seeds: Track[] = [];
  const seen = new Set<string>();
  for (let round=0; seeds.length<3; round++) {
    let added=false;
    for (const group of ranked) {
      const track=group.tracks[round]; if (!track) continue;
      const key=`${track.source}:${track.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key); seeds.push(track); added=true;
      if (seeds.length===3) break;
    }
    if (!added && ranked.every(g => round>=g.tracks.length-1)) break;
  }
  return seeds.length ? seeds : [current];
}

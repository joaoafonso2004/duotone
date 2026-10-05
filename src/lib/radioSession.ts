import type { Track } from '../types';

/**
 * Apenas escutas que passaram o limiar de contagem; nunca posições da fila.
 * `skipped`: as do Radio saltadas antes dos 30 s, com som (5/10).
 */
export type RadioListeningSession = { owner: string | null; tracks: Track[]; skipped?: Track[] };
export function rememberRadioListen(session: RadioListeningSession | null, owner: string | null, track: Track): RadioListeningSession {
  const mine = session?.owner === owner ? session : null;
  return { owner, tracks: [...(mine?.tracks ?? []), track].slice(-20), skipped: mine?.skipped ?? [] };
}
export function rememberRadioSkip(session: RadioListeningSession | null, owner: string | null, track: Track): RadioListeningSession {
  const mine = session?.owner === owner ? session : null;
  return { owner, tracks: mine?.tracks ?? [], skipped: [...(mine?.skipped ?? []), track].slice(-20) };
}

/** O peso de cada âncora de quando se ligou o Radio. */
export const PESO_DO_NUCLEO = 3;
/** Uma escuta até ao fim soma isto ao artista; um salto cedo tira isto. */
export const PESO_DA_ESCUTA = 1;
export const PESO_DO_SALTO = 2;
/** Um artista da sessão só passa a âncora com este peso (duas escutas). */
export const PESO_PARA_ANCORA = 2;
/** Saltado tantas vezes na sessão, o artista sai das âncoras e das sugestões. */
export const SALTOS_PARA_EVITAR = 2;

/**
 * As âncoras do Radio a cada lote (5/10, "um algoritmo mais inteligente").
 *
 * Eram as três de quando se ligou, fixas: o Radio não ouvia o que se fazia
 * com ele. Agora as de quando se ligou são o NÚCLEO (peso 3 cada), e a sessão
 * mexe-lhe: cada escuta até ao fim soma 1 ao artista, cada salto antes dos
 * 30 s tira 2. Um artista novo só entra com duas escutas (uma sozinha não
 * desvia o Radio), e um artista saltado duas vezes sai das âncoras E das
 * sugestões até se desligar. Ficam as três de maior peso, cada uma
 * representada pela faixa mais recente dela; sem nenhuma, o núcleo.
 * Puro: o artista e a chave entram por parâmetro.
 */
export function ancorasDoRadio(
  nucleo: readonly Track[], session: RadioListeningSession | null, owner: string | null,
  artistOf: (t: Track) => string, artistKey: (s: string) => string,
): { sementes: Track[]; evitar: Set<string> } {
  const mine = session?.owner === owner ? session : null;
  type Peso = { peso: number; ultimo: number; faixa: Track; saltos: number; noNucleo: number };
  const pesos = new Map<string, Peso>();
  let ordem = 0;
  const somar = (t: Track, delta: number, salto = false, noNucleo = Infinity) => {
    const nome = artistOf(t);
    if (!nome || nome === 'Unknown artist') return;
    const k = artistKey(nome);
    if (!k) return;
    const p = pesos.get(k) ?? { peso: 0, ultimo: 0, faixa: t, saltos: 0, noNucleo };
    p.peso += delta;
    ordem++;
    if (!salto) { p.ultimo = ordem; p.faixa = t; } else p.saltos++;
    pesos.set(k, p);
  };
  nucleo.forEach((t, i) => somar(t, PESO_DO_NUCLEO, false, i));
  for (const t of mine?.tracks ?? []) somar(t, PESO_DA_ESCUTA);
  for (const t of mine?.skipped ?? []) somar(t, -PESO_DO_SALTO, true);
  const evitar = new Set([...pesos].filter(([, p]) => p.saltos >= SALTOS_PARA_EVITAR).map(([k]) => k));
  const sementes = [...pesos].filter(([k, p]) => p.peso >= PESO_PARA_ANCORA && !evitar.has(k))
    // Empate: o núcleo pela ordem dele; os da sessão, o mais recente primeiro.
    .sort(([, a], [, b]) => b.peso - a.peso
      || (a.noNucleo !== b.noNucleo ? a.noNucleo - b.noNucleo : b.ultimo - a.ultimo))
    .slice(0, 3).map(([, p]) => p.faixa);
  return { sementes: sementes.length ? sementes : [...nucleo], evitar };
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

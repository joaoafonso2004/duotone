import type { Track } from '../types';

/**
 * Rádio: continuar a tocar quando a fila acaba, em vez de ficar em silêncio.
 *
 * Porque não são os mixes do YouTube (`RD<videoId>`): a Data API v3, que é a
 * que a app usa para playlists, NÃO resolve mixes — não são playlists reais
 * para a API e vem 404. Fazê-lo pelo InnerTube era possível mas acrescentava
 * mais uma superfície frágil ao pipeline que já está sempre a partir.
 *
 * Em vez disso o rádio sai dos dados do próprio utilizador (biblioteca,
 * histórico de reproduções no Supabase) e só cai na pesquisa do YouTube em
 * último recurso — que é o que o ROADMAP já previa para as recomendações.
 * Funções puras aqui; a ida à rede em `api/radio.ts`. O extrator de artista
 * e a chave da faixa entram por parâmetro em vez de serem importados: é o que
 * mantém este módulo sem dependências de runtime e, por isso, testável em Node
 * puro como o resto da lógica da app (ver scripts/test-radio.ts).
 */

/** Quantas faixas o rádio acrescenta de cada vez. */
export const RADIO_BATCH = 10;

/** Quantas das últimas ouvidas servem de semente. */
export const RADIO_SEED_COUNT = 3;

/**
 * As faixas que definem "mais do mesmo": as últimas ouvidas, da mais recente
 * para trás. Só a atual seria pouco — numa fila variada, a última faixa pode
 * não representar nada do que se esteve a ouvir.
 */
export function radioSeeds(
  queue: Track[],
  queueIndex: number,
  count: number = RADIO_SEED_COUNT
): Track[] {
  if (queue.length === 0) return [];
  const end = Math.max(0, Math.min(queueIndex, queue.length - 1));
  const start = Math.max(0, end - count + 1);
  return queue.slice(start, end + 1).reverse();
}

/** Artistas distintos das sementes, do mais recente para o mais antigo. */
export function seedArtists(
  seeds: Track[],
  artistOf: (t: Track) => string
): string[] {
  const out: string[] = [];
  for (const t of seeds) {
    const name = artistOf(t)?.trim();
    // O `displayArtist` devolve 'Unknown artist' quando não consegue extrair
    // nada. Pesquisar por isso no YouTube dava lixo — melhor não semear.
    if (!name || name.toLowerCase() === 'unknown artist') continue;
    const norm = name.toLowerCase();
    if (!out.some((a) => a.toLowerCase() === norm)) out.push(name);
  }
  return out;
}

/**
 * Limpa os candidatos: fora o que já está na fila, fora repetidos, e fora o
 * que não é do YouTube (é a única fonte que a app sabe tocar).
 *
 * Sem o filtro da fila, o rádio começava a repetir as faixas que o
 * utilizador acabou de ouvir — que é a maneira mais rápida de o desligar.
 */
export function filterRadioCandidates(
  candidates: Track[],
  exclude: Track[],
  keyOf: (t: Track) => string,
  limit: number = RADIO_BATCH
): Track[] {
  const seen = new Set(exclude.map(keyOf));
  const out: Track[] = [];
  for (const t of candidates) {
    if (out.length >= limit) break;
    if (!t?.sourceId || t.source !== 'youtube') continue;
    const k = keyOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Baralha sem enviesamento, para dois arranques do rádio não darem o mesmo. */
export function shuffleCandidates(tracks: Track[], rng: () => number = Math.random): Track[] {
  const out = tracks.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Se o rádio deve entrar agora.
 *
 * `upcomingCount` é quantas faixas faltam MESMO tocar (com shuffle não é
 * `queue.length - queueIndex - 1`) — daí vir de fora, do `upcomingQueue()`.
 * Com repeat ligado a fila nunca acaba, e o rádio não tem que se meter.
 */
export function shouldExtendWithRadio(
  enabled: boolean,
  hasCurrent: boolean,
  upcomingCount: number,
  repeatMode: 'off' | 'all' | 'one'
): boolean {
  return enabled && hasCurrent && repeatMode === 'off' && upcomingCount === 0;
}

/**
 * Estatísticas de escuta ("Wrapped").
 *
 * Toda a agregação é feita aqui, a partir das linhas cruas de `plays` — não
 * numa função no Postgres. É deliberado: a app já depende de seis funções
 * SQL que só existem na base de dados e em lado nenhum do repositório, e
 * acrescentar mais uma agravava o problema. Assim o que define as estatísticas
 * vive em git e é testável em Node puro (scripts/test-listening-stats.ts).
 *
 * Sem imports de runtime — ver a nota equivalente em lib/radio.ts.
 */

export type StatsPeriod = '30d' | '6m' | 'all';

export interface PlayRow {
  /** ISO. */
  playedAt: string;
  source: string;
  sourceId: string;
  title: string;
  /** Já normalizado pelo chamador (displayArtist), ou null. */
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
}

export interface TopTrack {
  key: string;
  source: string;
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  plays: number;
}

export interface TopArtist {
  name: string;
  plays: number;
  artworkUrl: string | null;
}

export interface TimelineBucket {
  /** Chave ordenável (YYYY-MM-DD ou YYYY-MM). */
  key: string;
  /** Etiqueta curta para o eixo. */
  label: string;
  plays: number;
}

export interface ListeningStats {
  totalPlays: number;
  uniqueTracks: number;
  uniqueArtists: number;
  /** Estimativa: o `plays` regista o ARRANQUE de uma faixa, não o fim, por
   * isso isto é um teto — quem salta a meio conta na mesma o tema inteiro.
   * A UI tem de o dizer ("≈"), não fingir precisão que não existe. */
  estimatedMinutes: number;
  topTracks: TopTrack[];
  topArtists: TopArtist[];
  timeline: TimelineBucket[];
  /** Dia com mais reproduções no período. */
  busiestDay: { key: string; plays: number } | null;
  /** Dias seguidos com pelo menos uma reprodução, a contar do mais recente. */
  streakDays: number;
  firstPlayAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do período, ou null para "sempre". */
export function periodStart(period: StatsPeriod, now: number = Date.now()): number | null {
  if (period === '30d') return now - 30 * DAY_MS;
  if (period === '6m') return now - 182 * DAY_MS;
  return null;
}

/** Data local em YYYY-MM-DD. Local e não UTC de propósito: ouvir à meia-noite
 * e um quarto pertence a hoje para quem está a ouvir, não a ontem em UTC. */
function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function trackKey(r: PlayRow): string {
  return `${r.source}:${r.sourceId}`;
}

/**
 * Dias seguidos com escuta, a contar do dia mais recente com reproduções.
 *
 * Conta a partir do último dia ouvido e não de hoje: quem abre as
 * estatísticas ao fim da tarde sem ter ouvido nada ainda não deve ver a sua
 * série a zero.
 */
export function listeningStreak(dayKeys: Set<string>, now: number = Date.now()): number {
  if (dayKeys.size === 0) return 0;

  const sorted = Array.from(dayKeys).sort().reverse();
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - DAY_MS));

  // Uma série só está viva se o último dia ouvido for hoje ou ontem; mais
  // antigo do que isso já foi interrompida.
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

  let streak = 1;
  let cursor = new Date(`${sorted[0]}T12:00:00`).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const expected = dayKey(new Date(cursor - DAY_MS));
    if (sorted[i] !== expected) break;
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
}

/**
 * Agrega as reproduções de um período.
 *
 * `rows` pode vir por qualquer ordem; nada aqui assume ordenação.
 */
export function computeStats(
  rows: PlayRow[],
  period: StatsPeriod,
  now: number = Date.now()
): ListeningStats {
  const start = periodStart(period, now);
  const inPeriod = rows.filter((r) => {
    const at = Date.parse(r.playedAt);
    if (!Number.isFinite(at)) return false;
    return start === null || at >= start;
  });

  const tracks = new Map<string, TopTrack>();
  const artists = new Map<string, TopArtist>();
  const days = new Map<string, number>();
  const months = new Map<string, number>();
  let seconds = 0;
  let firstAt = Number.POSITIVE_INFINITY;

  for (const r of inPeriod) {
    const at = Date.parse(r.playedAt);
    if (at < firstAt) firstAt = at;
    seconds += Math.max(0, r.durationSeconds ?? 0);

    const key = trackKey(r);
    const track = tracks.get(key);
    if (track) {
      track.plays++;
      // Manter a capa mais recente que exista, para a lista não ficar cheia
      // de placeholders quando uma reprodução antiga não a tinha.
      if (!track.artworkUrl && r.artworkUrl) track.artworkUrl = r.artworkUrl;
    } else {
      tracks.set(key, {
        key,
        source: r.source,
        sourceId: r.sourceId,
        title: r.title,
        artist: r.artist,
        artworkUrl: r.artworkUrl,
        plays: 1,
      });
    }

    const name = r.artist?.trim();
    if (name && name.toLowerCase() !== 'unknown artist') {
      const norm = name.toLowerCase();
      const a = artists.get(norm);
      if (a) {
        a.plays++;
        if (!a.artworkUrl && r.artworkUrl) a.artworkUrl = r.artworkUrl;
      } else {
        artists.set(norm, { name, plays: 1, artworkUrl: r.artworkUrl });
      }
    }

    const d = new Date(at);
    const dk = dayKey(d);
    days.set(dk, (days.get(dk) ?? 0) + 1);
    const mk = monthKey(d);
    months.set(mk, (months.get(mk) ?? 0) + 1);
  }

  const byPlays = <T extends { plays: number }>(a: T, b: T) => b.plays - a.plays;
  const topTracks = Array.from(tracks.values()).sort(byPlays).slice(0, 10);
  const topArtists = Array.from(artists.values()).sort(byPlays).slice(0, 10);

  // Períodos curtos contam-se em dias; longos em meses, senão o gráfico teria
  // centenas de barras de um pixel.
  const buckets = period === '30d' ? days : months;
  const timeline: TimelineBucket[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, plays]) => ({
      key,
      label:
        period === '30d'
          ? key.slice(8) // dia do mês
          : MONTHS_PT[Number(key.slice(5, 7)) - 1] ?? key,
      plays,
    }));

  let busiestDay: ListeningStats['busiestDay'] = null;
  for (const [key, plays] of days) {
    if (!busiestDay || plays > busiestDay.plays) busiestDay = { key, plays };
  }

  return {
    totalPlays: inPeriod.length,
    uniqueTracks: tracks.size,
    uniqueArtists: artists.size,
    estimatedMinutes: Math.round(seconds / 60),
    topTracks,
    topArtists,
    timeline,
    busiestDay,
    streakDays: listeningStreak(new Set(days.keys()), now),
    firstPlayAt: Number.isFinite(firstAt) ? new Date(firstAt).toISOString() : null,
  };
}

/** "12 h 34 min", "45 min", "—". */
export function formatListeningTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

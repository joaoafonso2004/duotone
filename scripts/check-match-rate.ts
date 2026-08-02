/**
 * Mede a taxa de correspondência automática contra o YouTube a sério.
 *
 * Não faz parte do bundle: é uma ferramenta de diagnóstico para correr à mão
 * quando se mexe nos pesos do `trackMatch`.
 *
 * Espelha os parâmetros do `searchYouTube` real (25 resultados, sem filtro de
 * categoria) — com parâmetros diferentes a medição não diz nada sobre a app.
 *
 * As respostas ficam em cache no disco: a primeira passagem gasta 100 unidades
 * de quota por faixa, as seguintes não gastam nada. Usar `--fresh` para
 * ignorar a cache.
 *
 *   node --experimental-strip-types scripts/check-match-rate.ts <ficheiro.csv>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseSpotifyCsv, toMatchTarget } from '../src/lib/spotifyCsv.ts';
import { pickBest, buildSearchQueries, type MatchCandidate } from '../src/lib/trackMatch.ts';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const KEY = env.EXPO_PUBLIC_YOUTUBE_API_KEY;
if (!KEY) {
  console.error('falta EXPO_PUBLIC_YOUTUBE_API_KEY no .env');
  process.exit(1);
}

const path = process.argv[2];
const fresh = process.argv.includes('--fresh');
if (!path) {
  console.error('uso: node --experimental-strip-types scripts/check-match-rate.ts <ficheiro.csv>');
  process.exit(1);
}

const CACHE = new URL('../.cache/match-rate.json', import.meta.url).pathname.replace(/^\//, '');
const cache: Record<string, any> = !fresh && existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, 'utf8'))
  : {};
const saveCache = () => {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
};

/** Segundos a partir do formato ISO 8601 que a API devolve (PT3M42S). */
function isoToSec(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** A API devolve títulos com entidades HTML (&amp;, &#39;) — a app descodifica. */
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

let spent = 0;
async function api(endpoint: string, params: Record<string, string>, cost: number) {
  const cacheKey = endpoint + ':' + JSON.stringify(params);
  if (cache[cacheKey]) return cache[cacheKey];
  const qs = new URLSearchParams({ ...params, key: KEY });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  spent += cost;
  cache[cacheKey] = await res.json();
  saveCache();
  return cache[cacheKey];
}

const { rows, skipped, problem } = parseSpotifyCsv(readFileSync(path, 'utf8'));
if (problem) {
  console.error('leitura falhou:', problem);
  process.exit(1);
}
console.log(`${rows.length} faixas lidas (${skipped} ignoradas)\n`);

let confident = 0;
const review: string[] = [];

for (const row of rows) {
  const target = toMatchTarget(row);
  // Mesmos parâmetros do searchYouTube da app; consultas por ordem até haver
  // resultados, porque a API suprime algumas queries curtas.
  let search: any = { items: [] };
  let usedQuery = '';
  for (const q of buildSearchQueries(target)) {
    usedQuery = q;
    search = await api('search', { part: 'snippet', type: 'video', maxResults: '25', q }, 100);
    if ((search.items ?? []).length) break;
  }

  const ids = (search.items ?? []).map((i: any) => i?.id?.videoId).filter(Boolean);
  const details = ids.length
    ? await api('videos', { part: 'contentDetails', id: ids.join(',') }, 1)
    : { items: [] };
  const durations = new Map<string, number | null>(
    (details.items ?? []).map((i: any) => [i.id, isoToSec(i.contentDetails?.duration ?? '')])
  );

  const candidates: MatchCandidate[] = (search.items ?? [])
    .filter((i: any) => i?.id?.videoId)
    .map((i: any) => ({
      id: i.id.videoId,
      title: decodeEntities(i.snippet?.title ?? ''),
      channel: decodeEntities(i.snippet?.channelTitle ?? ''),
      durationSec: durations.get(i.id.videoId) ?? null,
    }));

  const result = pickBest(candidates, target);
  const best = result.best;
  const runnerUp = result.ranked[1];
  const label = `${row.artist} — ${row.title}`;

  if (result.confident) confident++;
  else review.push(label);

  const viaFallback = usedQuery !== buildSearchQueries(target)[0];
  console.log(
    `${result.confident ? 'AUTO ' : 'REVER'} ${label}   (${candidates.length} resultados` +
      `${viaFallback ? ', via álbum' : ''})`
  );
  console.log(
    `      -> ${best?.title ?? '(nada)'}  [${best?.channel ?? '-'}]  ` +
      `score=${best?.score ?? '-'}  ${best?.durationSec ?? '?'}s vs ${target.durationSec}s`
  );
  if (!result.confident && runnerUp) {
    console.log(
      `      2º: ${runnerUp.title}  [${runnerUp.channel}]  score=${runnerUp.score}  ${runnerUp.durationSec}s`
    );
  }
}

const pct = rows.length ? Math.round((confident / rows.length) * 100) : 0;
console.log(`\nautomáticas: ${confident}/${rows.length} (${pct}%)   quota gasta: ${spent} unidades`);
if (review.length) console.log('a rever:\n  ' + review.join('\n  '));

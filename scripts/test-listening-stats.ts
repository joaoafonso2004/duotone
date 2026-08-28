import {
  computeStats,
  formatListeningTime,
  listeningStreak,
  periodStart,
  type PlayRow,
} from '../src/lib/listeningStats.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const DAY = 24 * 60 * 60 * 1000;
// Meio-dia local, para os testes nao dependerem do fuso da maquina.
const NOW = new Date(2026, 7, 28, 12, 0, 0).getTime();
const diasAtras = (n: number) => new Date(NOW - n * DAY).toISOString();

const play = (over: Partial<PlayRow> = {}): PlayRow => ({
  playedAt: diasAtras(0),
  source: 'youtube',
  sourceId: 'a',
  title: 'Faixa A',
  artist: 'Artista A',
  artworkUrl: null,
  durationSeconds: 180,
  ...over,
});

// --- janelas ---------------------------------------------------------------
check('30d comeca ha 30 dias', periodStart('30d', NOW) === NOW - 30 * DAY);
check('sempre nao tem inicio', periodStart('all', NOW) === null);
check('6m e mais atras que 30d', periodStart('6m', NOW)! < periodStart('30d', NOW)!);

// --- contagens -------------------------------------------------------------
const linhas: PlayRow[] = [
  play({ sourceId: 'a', playedAt: diasAtras(0) }),
  play({ sourceId: 'a', playedAt: diasAtras(1) }),
  play({ sourceId: 'a', playedAt: diasAtras(2) }),
  play({ sourceId: 'b', title: 'Faixa B', playedAt: diasAtras(1) }),
  play({ sourceId: 'c', title: 'Faixa C', artist: 'Artista B', playedAt: diasAtras(3) }),
  // Fora da janela de 30 dias.
  play({ sourceId: 'd', title: 'Faixa D', artist: 'Artista C', playedAt: diasAtras(100) }),
];

const m30 = computeStats(linhas, '30d', NOW);
check('conta so o que esta na janela', m30.totalPlays === 5, String(m30.totalPlays));
check('faixas distintas', m30.uniqueTracks === 3, String(m30.uniqueTracks));
check('artistas distintos', m30.uniqueArtists === 2, String(m30.uniqueArtists));
// 5 reproducoes x 180s = 900s = 15 min.
check('minutos estimados', m30.estimatedMinutes === 15, String(m30.estimatedMinutes));

const sempre = computeStats(linhas, 'all', NOW);
check('"sempre" apanha as antigas', sempre.totalPlays === 6, String(sempre.totalPlays));

// --- tops ------------------------------------------------------------------
check('faixa mais tocada a cabeca', m30.topTracks[0].sourceId === 'a', m30.topTracks[0].sourceId);
check('com a contagem certa', m30.topTracks[0].plays === 3, String(m30.topTracks[0].plays));
check('artista mais ouvido a cabeca', m30.topArtists[0].name === 'Artista A', m30.topArtists[0].name);
check('artista com 4 reproducoes', m30.topArtists[0].plays === 4, String(m30.topArtists[0].plays));
// Pesquisar/mostrar "Unknown artist" como artista favorito seria ridiculo.
check(
  'Unknown artist nao conta como artista',
  computeStats([play({ artist: 'Unknown artist' })], 'all', NOW).uniqueArtists === 0
);
check(
  'artista sem nome nao conta',
  computeStats([play({ artist: null })], 'all', NOW).uniqueArtists === 0
);
// O mesmo artista escrito com outra caixa e o mesmo artista.
check(
  'artistas agrupam sem olhar a maiusculas',
  computeStats(
    [play({ artist: 'Radiohead' }), play({ sourceId: 'z', artist: 'radiohead' })],
    'all', NOW
  ).uniqueArtists === 1
);
// A capa mais recente ganha ao placeholder de uma reproducao antiga.
const comCapa = computeStats(
  [play({ sourceId: 'x', artworkUrl: null }), play({ sourceId: 'x', artworkUrl: 'http://capa' })],
  'all', NOW
);
check('recupera a capa de outra reproducao', comCapa.topTracks[0].artworkUrl === 'http://capa');

// --- dia mais cheio --------------------------------------------------------
check('dia mais cheio identificado', m30.busiestDay?.plays === 2, String(m30.busiestDay?.plays));

// --- series ----------------------------------------------------------------
const dia = (n: number) => {
  const d = new Date(NOW - n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
check('serie de tres dias', listeningStreak(new Set([dia(0), dia(1), dia(2)]), NOW) === 3);
check('um buraco corta a serie', listeningStreak(new Set([dia(0), dia(1), dia(3)]), NOW) === 2);
// Quem ainda nao ouviu nada hoje nao deve ver a serie a zero ao almoco.
check('serie viva se o ultimo dia foi ontem', listeningStreak(new Set([dia(1), dia(2)]), NOW) === 2);
check('serie morta se parou ha tres dias', listeningStreak(new Set([dia(3), dia(4)]), NOW) === 0);
check('sem dias nao ha serie', listeningStreak(new Set(), NOW) === 0);

// --- linha temporal --------------------------------------------------------
check('30d agrupa por dia', m30.timeline.length === 4, String(m30.timeline.length));
check('a linha vem por ordem', m30.timeline[0].key < m30.timeline[3].key);
const seis = computeStats(linhas, '6m', NOW);
check('6m agrupa por mes', seis.timeline.length <= 2, String(seis.timeline.length));
check('meses tem etiqueta legivel', /^[A-Z][a-z]{2}$/.test(seis.timeline[0].label), seis.timeline[0].label);

// --- degradacao ------------------------------------------------------------
const vazio = computeStats([], 'all', NOW);
check('sem dados nao rebenta', vazio.totalPlays === 0 && vazio.topTracks.length === 0);
check('sem dados nao ha primeiro play', vazio.firstPlayAt === null);
check('datas invalidas sao ignoradas', computeStats([play({ playedAt: 'nao-e-data' })], 'all', NOW).totalPlays === 0);
check('duracao em falta nao vira NaN', computeStats([play({ durationSeconds: null })], 'all', NOW).estimatedMinutes === 0);

// --- formatacao ------------------------------------------------------------
check('horas e minutos', formatListeningTime(754) === '12 h 34 min', formatListeningTime(754));
check('so minutos', formatListeningTime(45) === '45 min', formatListeningTime(45));
check('horas certas', formatListeningTime(120) === '2 h', formatListeningTime(120));
check('zero mostra traco', formatListeningTime(0) === '—');

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

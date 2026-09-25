import { readFileSync } from 'node:fs';
import { pareceMusica } from '../src/lib/musica.ts';
import {
  filterRadioCandidates,
  limitarMesmoArtista,
  onlyPlausibleMusic,
  radioSeeds,
  seedArtists,
  shouldExtendWithRadio,
  shuffleCandidates,
} from '../src/lib/radio.ts';
import type { Track } from '../src/types.ts';

// Os mesmos helpers que a app injeta (displayArtist / trackKey), replicados
// aqui em versao minima para o teste nao precisar de imports de runtime.
const keyOf = (t: Track) => `${t.source}:${t.sourceId}`;
const artistOf = (t: Track) => {
  const m = t.title.match(/^(.+?)\s+-\s+/);
  return m ? m[1].trim() : t.artist ?? 'Unknown artist';
};

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const yt = (id: string, title: string, artist: string | null = null): Track => ({
  source: 'youtube', sourceId: id, title, artist,
  album: null, artworkUrl: null, durationSeconds: 200,
});

// --- sementes ---------------------------------------------------------------
const fila = [
  yt('1', 'Radiohead - Creep'),
  yt('2', 'Portishead - Roads'),
  yt('3', 'Massive Attack - Teardrop'),
  yt('4', 'Bjork - Hyperballad'),
];
const sementes = radioSeeds(fila, 3);
check('semeia com as ultimas ouvidas', sementes.length === 3, String(sementes.length));
check('a mais recente vem primeiro', sementes[0].sourceId === '4', sementes[0].sourceId);
check('no inicio da fila nao inventa', radioSeeds(fila, 0).length === 1);
check('fila vazia nao semeia', radioSeeds([], 0).length === 0);
check('indice fora de alcance e preso', radioSeeds(fila, 99)[0].sourceId === '4');

// --- artistas ---------------------------------------------------------------
const artistas = seedArtists(sementes, artistOf);
check('extrai o artista do titulo', artistas[0] === 'Bjork', artistas.join(','));
check('tres sementes, tres artistas', artistas.length === 3, artistas.join(','));
check(
  'artistas repetidos contam uma vez',
  seedArtists([yt('a', 'Radiohead - Creep'), yt('b', 'radiohead - Karma Police')], artistOf).length === 1
);
// Pesquisar "Unknown artist music" no YouTube so daria lixo.
check(
  'faixas sem artista nao semeiam',
  seedArtists([yt('x', 'video aleatorio sem formato')], artistOf).length === 0,
  seedArtists([yt('x', 'video aleatorio sem formato')], artistOf).join(',')
);

// --- filtro de candidatos ---------------------------------------------------
const candidatos = [
  yt('4', 'Bjork - Hyperballad'),   // ja esta na fila
  yt('5', 'Tricky - Hell Is Round'),
  yt('5', 'Tricky - duplicado'),    // repetido
  { ...yt('6', 'algo'), source: 'spotify' as const }, // fonte que a app nao toca
  yt('7', 'Air - La Femme'),
];
const limpos = filterRadioCandidates(candidatos, fila, keyOf, 10);
check('nao repete o que ja esta na fila', !limpos.some((t) => t.sourceId === '4'));
check('nao repete candidatos duplicados', limpos.filter((t) => t.sourceId === '5').length === 1);
check('deixa cair fontes que nao sao YouTube', !limpos.some((t) => t.sourceId === '6'));
check('fica com os restantes', limpos.map((t) => t.sourceId).join() === '5,7', limpos.map((t) => t.sourceId).join());
check('respeita o limite', filterRadioCandidates(candidatos, [], keyOf, 1).length === 1);
check('sem candidatos devolve vazio', filterRadioCandidates([], fila, keyOf, 10).length === 0);

// --- so musica --------------------------------------------------------------
// O caso de 14/9: um temporizador de 7 h na fila de um amigo do Joao.
const temporizador = { ...yt('t', '6 Hour 30 minute Timer + 1 Hour Loud Alarm'), durationSeconds: 27000 };
const longaGuardada = { ...yt('g', 'Artista - Tema de vinte minutos'), durationSeconds: 1200 };
const guardadas = new Set([keyOf(longaGuardada)]);
const soMusica = onlyPlausibleMusic(
  [yt('m', 'Air - La Femme'), temporizador, longaGuardada],
  (t) => guardadas.has(keyOf(t)),
  pareceMusica,
);
check('o radio deixa cair o que nao e musica', !soMusica.some((t) => t.sourceId === 't'));
check('o que ele guardou passa, mesmo longo', soMusica.some((t) => t.sourceId === 'g'));
check('a musica normal passa', soMusica.some((t) => t.sourceId === 'm'));

// --- baralhar ---------------------------------------------------------------
let seed = 42;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const baralhados = shuffleCandidates(limpos, rng);
check('baralhar preserva as faixas', baralhados.length === limpos.length);
check('baralhar nao muta a entrada', limpos.map((t) => t.sourceId).join() === '5,7');

// --- quando entrar ----------------------------------------------------------
check('entra quando a fila acaba', shouldExtendWithRadio(true, true, 0, 'off'));
check('nao entra com faixas por tocar', !shouldExtendWithRadio(true, true, 3, 'off'));
// Com repeat a fila nunca acaba — o radio nao se tem de meter.
check('nao entra com repeat all', !shouldExtendWithRadio(true, true, 0, 'all'));
check('nao entra com repeat one', !shouldExtendWithRadio(true, true, 0, 'one'));
check('nao entra desligado', !shouldExtendWithRadio(false, true, 0, 'off'));
check('nao entra sem nada a tocar', !shouldExtendWithRadio(true, false, 0, 'off'));

// --- a pesquisa nao enche a fila ----------------------------------------------
// Tocar um resultado punha os resultados TODOS na fila, e com o shuffle ligado
// a seguir vinha o que o YouTube casou com o texto. Le-se o codigo como texto:
// os ecras importam React Native e nao abrem em Node.
const ecrasDePesquisa: Record<string, RegExp> = {
  'desktop/paginas/BibliotecaPages.web.tsx': /\bplay\(\s*\w+\s*,\s*results\b/,
  'screens/SearchScreen.tsx': /\bplayTrack\(\s*\w+\s*,\s*results\b/,
};
for (const [ficheiro, proibido] of Object.entries(ecrasDePesquisa)) {
  const fonte = readFileSync(new URL(`../src/${ficheiro}`, import.meta.url), 'utf8');
  check(`${ficheiro}: tocar um resultado nao poe os resultados na fila`, !proibido.test(fonte));
}

// O mesmo artista é tempero: clicar em Morad dá artistas com um tom parecido,
// e não um lote só de Morad (João, 25/9).
{
  const chave = (n: string) => n.toLowerCase();
  const lote = [
    yt('m1', 'Morad - A'), yt('m2', 'Morad - B'), yt('m3', 'Morad - C'), yt('m4', 'Morad - D'),
    yt('b1', 'Beny Jr - E'), yt('m5', 'Morad - F'), yt('j1', 'JUL - G'), yt('k1', 'Kidd Keo - H'),
  ];
  const ficou = limitarMesmoArtista(lote, ['Morad'], artistOf, chave, 8);
  const deMorad = ficou.filter((t) => artistOf(t) === 'Morad').length;
  check('num lote de 8, no máximo 2 do mesmo artista', deMorad === 2, String(deMorad));
  check('os outros artistas ficam todos, pela mesma ordem',
    ficou.filter((t) => artistOf(t) !== 'Morad').map((t) => t.sourceId).join() === 'b1,j1,k1');
  check('a primeira do artista escolhido continua à frente', ficou[0].sourceId === 'm1');
}

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

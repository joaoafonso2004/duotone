import { pickBest, buildSearchQueries, type MatchCandidate, type MatchTarget } from '../src/lib/trackMatch.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const target = (over: Partial<MatchTarget> = {}): MatchTarget => ({
  title: 'Blueberry Faygo',
  artist: 'Lil Mosey',
  durationSec: 163,
  ...over,
});

const cand = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: 'x',
  title: 'Blueberry Faygo',
  channel: 'Lil Mosey - Topic',
  durationSec: 163,
  ...over,
});

// 1. Dois uploads da mesma gravação (Topic + canal do artista) empatam sempre.
//    Caso real: ambas as escolhas estão certas, mandar a revisão não ajuda.
const dupes = pickBest(
  [
    cand({ id: 'a' }),
    cand({ id: 'b', title: 'Lil Mosey - Blueberry Faygo [Audio]', channel: 'Lil Mosey', durationSec: 164 }),
  ],
  target()
);
check('cópias da mesma gravação não vão a revisão', dupes.confident, 'score=' + dupes.best?.score);

// 2. Mas karaoke/instrumental têm a duração exacta do original e áudio
//    diferente — esses continuam a ser ambiguidade a sério.
//
//    O karaoke está num canal "- Topic", cujo bónus anula a penalização e o
//    põe a par do original. Sem a salvaguarda, os dois passariam por cópias
//    da mesma gravação e a app escolhia o karaoke sem perguntar.
const karaoke = pickBest(
  [
    cand({ id: 'a', channel: 'Uploads Aleatorios', durationSec: 163 }),
    cand({ id: 'b', title: 'Blueberry Faygo (Karaoke)', channel: 'Lil Mosey - Topic', durationSec: 163 }),
  ],
  target()
);
check(
  'karaoke com a mesma duração não conta como cópia',
  !karaoke.confident,
  karaoke.ranked.map((c) => `${c.id}=${c.score}`).join(' ')
);

// 3. Regressão: "Instant Crush (Drumless Edition)" no canal oficial ganhava
//    COM CONFIANÇA porque \bedit\b não apanha "Edition".
const daft = pickBest(
  [
    { id: 'a', title: 'Daft Punk - Instant Crush (Drumless Edition)', channel: 'Daft Punk', durationSec: 337 },
    { id: 'b', title: 'Daft Punk - Instant Crush (Official Audio)', channel: 'Daft Punk', durationSec: 337 },
  ],
  { title: 'Instant Crush', artist: 'Daft Punk', durationSec: 337 }
);
check('versão sem bateria não ganha', daft.best?.id === 'b', daft.best?.title);
check('e a escolha certa é confiante', daft.confident);

// 4. Gravações diferentes com pontuações próximas continuam a ir a revisão.
const ambiguous = pickBest(
  [
    cand({ id: 'a', channel: 'Canal Um', durationSec: 163 }),
    cand({ id: 'b', title: 'Blueberry Faygo (Live at Wembley)', channel: 'Canal Dois', durationSec: 190 }),
    cand({ id: 'c', title: 'Blueberry Faygo', channel: 'Canal Tres', durationSec: 200 }),
  ],
  target()
);
check('durações diferentes não são a mesma gravação', ambiguous.ranked.length === 3);

// 5. Consultas: o álbum só entra quando acrescenta contexto.
check(
  'single sem álbum repetido',
  buildSearchQueries(target({ album: 'Blueberry Faygo' })).length === 1,
  JSON.stringify(buildSearchQueries(target({ album: 'Blueberry Faygo' })))
);
const withAlbum = buildSearchQueries({
  title: 'sex',
  artist: 'EDEN',
  durationSec: 219,
  album: 'i think you think too much of me',
});
check('álbum entra como segunda tentativa', withAlbum.length === 2, JSON.stringify(withAlbum));
check(
  'primeira consulta é artista + título',
  withAlbum[0] === 'EDEN sex',
  withAlbum[0]
);
check(
  'segunda consulta acrescenta o álbum',
  withAlbum[1] === 'EDEN sex i think you think too much of me',
  withAlbum[1]
);
check('sem álbum, só uma consulta', buildSearchQueries(target({ album: null })).length === 1);

// 6. Degradação.
const empty = pickBest([], target());
check('sem candidatos não rebenta', empty.best === null && !empty.confident);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

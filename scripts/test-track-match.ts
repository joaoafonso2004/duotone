import { pickBest, buildSearchQueries, nucleoDoTitulo, type MatchCandidate, type MatchTarget } from '../src/lib/trackMatch.ts';

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
// --- Sufixos do Spotify ----------------------------------------------------
// O Spotify escreve "X - Remastered 2011" onde o YouTube tem "X". Medido em
// 20 faixas comuns: três iam a revisão só por causa disto, com a escolha
// certa já em primeiro lugar.

check('reedição sai do título', nucleoDoTitulo('Bohemian Rhapsody - Remastered 2011') === 'Bohemian Rhapsody');
check('remaster sem ano sai', nucleoDoTitulo('Wonderwall - Remastered') === 'Wonderwall');
check('ano à frente sai', nucleoDoTitulo('Heroes - 2017 Remaster') === 'Heroes');
check('bonus track sai', nucleoDoTitulo('Song - Bonus Track') === 'Song');

check('sufixo de versão sai da comparação', nucleoDoTitulo('Song - Live at Wembley') === 'Song');
check('mas um travessão a sério fica', nucleoDoTitulo('Sunflower - Spider-Man: Into the Spider-Verse')
  === 'Sunflower - Spider-Man: Into the Spider-Verse');

// O ponto todo: OUTRA gravação nunca pode entrar sozinha no lugar da pedida.
// Testa-se onde a decisão é tomada, e nos DOIS sentidos -- as duas trocas são
// igualmente erradas, e cada uma delas falhava por sua razão.
const ESTUDIO = { id: 'a', title: 'Artista - Song (Official Audio)', channel: 'Artista - Topic', durationSec: 200 };
const versoes: [string, string][] = [
  ['ao vivo', 'Artista - Song (Live at Wembley)'],
  ['acústica', 'Artista - Song (Acoustic)'],
  ['remix', 'Artista - Song (Tiesto Remix)'],
  ['instrumental', 'Artista - Song (Instrumental)'],
  ['acelerada', 'Artista - Song (Sped Up)'],
  ['demo', 'Artista - Song (Demo)'],
];

for (const [nome, titulo] of versoes) {
  const candidato = { id: 'b', title: titulo, channel: 'Artista - Topic', durationSec: 200 };
  const limpo = { title: 'Song', artist: 'Artista', durationSec: 200, album: null };

  // Pediu-se a de estúdio e só existe a outra: tem de ir a revisão.
  check('pedir estúdio não aceita ' + nome + ' sozinha',
    !pickBest([candidato], limpo).confident);

  // Pediu-se a outra e só existe a de estúdio: também tem de ir a revisão.
  const pedida = { title: 'Song - ' + titulo.replace(/^.*\(|\)$/g, ''), artist: 'Artista', durationSec: 200, album: null };
  check('pedir ' + nome + ' não aceita estúdio sozinho',
    !pickBest([ESTUDIO], pedida).confident);

  // E quando existe a certa, entra sem perguntar.
  check('pedir ' + nome + ' aceita ' + nome,
    pickBest([candidato], pedida).confident, 'score=' + pickBest([candidato], pedida).best?.score);
}

check('título que é só o sufixo fica intacto', nucleoDoTitulo(' - Remastered') === ' - Remastered');
check('sem sufixo não muda nada', nucleoDoTitulo('Creep') === 'Creep');

// O sufixo deixa de custar pontos: a mesma gravação, com e sem ele, decide igual.
const comSufixo = pickBest(
  [{ id: 'a', title: 'Queen - Bohemian Rhapsody', channel: 'Queen Official', durationSec: 355 }],
  { title: 'Bohemian Rhapsody - Remastered 2011', artist: 'Queen', durationSec: 355, album: null }
);
const semSufixo = pickBest(
  [{ id: 'a', title: 'Queen - Bohemian Rhapsody', channel: 'Queen Official', durationSec: 355 }],
  { title: 'Bohemian Rhapsody', artist: 'Queen', durationSec: 355, album: null }
);
check('o sufixo já não tira pontos', comSufixo.best?.score === semSufixo.best?.score,
  comSufixo.best?.score + ' vs ' + semSufixo.best?.score);
check('e a faixa entra sozinha', comSufixo.confident);

// A versão ao vivo continua a ser apanhada, apesar de ter o mesmo núcleo.
const aoVivo = pickBest(
  [{ id: 'a', title: 'Queen - Bohemian Rhapsody (Live Aid 1985)', channel: 'Queen Official', durationSec: 355 }],
  { title: 'Bohemian Rhapsody - Remastered 2011', artist: 'Queen', durationSec: 355, album: null }
);
check('ao vivo não passa como a gravação de estúdio', !aoVivo.confident, 'score=' + aoVivo.best?.score);

// Apóstrofos: "Don't" e "Dont" são a mesma palavra.
const apostrofo = pickBest(
  [{ id: 'a', title: 'Queen - Dont Stop Me Now', channel: 'Queen Official', durationSec: 210 }],
  { title: "Don't Stop Me Now - Remastered 2011", artist: 'Queen', durationSec: 210, album: null }
);
check('apóstrofo não parte a palavra', apostrofo.confident, 'score=' + apostrofo.best?.score);

// Quem PROCURA a versão ao vivo tem de a receber: o candidato traz a mesma
// marca do alvo, por isso não é "mais marcado" e entra sozinho.
const querAoVivo = pickBest(
  [{ id: 'a', title: 'Queen - Bohemian Rhapsody (Live Aid 1985)', channel: 'Queen Official', durationSec: 355 }],
  { title: 'Bohemian Rhapsody - Live', artist: 'Queen', durationSec: 355, album: null }
);
check('ao vivo entra quando é o ao vivo que se pede', querAoVivo.confident, 'score=' + querAoVivo.best?.score);

const querAcustica = pickBest(
  [{ id: 'a', title: 'Song (Acoustic)', channel: 'Artista - Topic', durationSec: 200 }],
  { title: 'Song - Acoustic', artist: 'Artista', durationSec: 200, album: null }
);
check('acústica entra quando é a acústica que se pede', querAcustica.confident, 'score=' + querAcustica.best?.score);

check('sem candidatos não rebenta', empty.best === null && !empty.confident);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

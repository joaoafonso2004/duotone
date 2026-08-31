import { MAXIMO_S, MINIMO_S, pareceMusica } from '../src/lib/musica.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const sim = (rotulo: string, t: any) => check(rotulo, pareceMusica(t) === true);
const nao = (rotulo: string, t: any) => check(rotulo, pareceMusica(t) === false);

console.log('\nmusica passa');
sim('uma faixa normal', { title: 'Juice WRLD - Lucid Dreams', durationSeconds: 240 });
sim('sem duracao conhecida passa na mesma', { title: 'Alguma Musica', durationSeconds: null });
// Estes dois estavam a ser cortados por regras demasiado gulosas noutras
// versoes desta ideia: no genero que o utilizador ouve, sao a faixa.
sim('um remix e musica', { title: 'Song (Slowed + Reverb) [Remix]', durationSeconds: 200 });
sim('um mix de generos e musica', { title: 'angelcore mix', durationSeconds: 300 });
sim('uma versao ao vivo e musica', { title: 'Artista - Tema (Live at Wembley)', durationSeconds: 320 });
sim('no limite de baixo', { title: 'Curta', durationSeconds: MINIMO_S });
sim('no limite de cima', { title: 'Longa', durationSeconds: MAXIMO_S });

console.log('\nvideo nao passa');
nao('curto de mais', { title: 'Teaser', durationSeconds: 30 });
nao('longo de mais', { title: 'Set completo', durationSeconds: MAXIMO_S + 1 });
nao('uma reacao', { title: 'FIRST REACTION to Juice WRLD', durationSeconds: 600 });
nao('uma entrevista', { title: 'Interview with the artist', durationSeconds: 500 });
nao('um podcast', { title: 'Episode 42 - podcast', durationSeconds: 400 });
nao('um album inteiro', { title: 'Artista - Full Album', durationSeconds: 500 });
nao('uma hora de loop', { title: 'Song 1 hour loop', durationSeconds: 400 });
nao('duas horas', { title: 'Best of 2 hours mix', durationSeconds: 500 });
nao('gameplay', { title: 'GTA gameplay with music', durationSeconds: 400 });
nao('um trailer', { title: 'Official Trailer', durationSeconds: 120 });
nao('titulo vazio', { title: '   ', durationSeconds: 200 });

console.log('\nos limites fazem sentido');
check('o minimo corta clipes mas nao musicas curtas', MINIMO_S >= 45 && MINIMO_S <= 90, String(MINIMO_S));
check('o maximo corta sets mas nao musicas longas',
  MAXIMO_S >= 8 * 60 && MAXIMO_S <= 20 * 60, String(MAXIMO_S));

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

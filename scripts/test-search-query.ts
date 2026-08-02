import { searchAttempts } from '../src/lib/searchQuery.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

// O caso que originou isto: a query devolve zero na API e "music" destrava-a.
const eden = searchAttempts('EDEN sex');
check('query curta ganha segunda tentativa', eden.length === 2, JSON.stringify(eden));
check('a primeira é a do utilizador, intacta', eden[0] === 'EDEN sex', eden[0]);
check('a segunda acrescenta contexto musical', eden[1] === 'EDEN sex music', eden[1]);

// Já fala de música: repetir dava o mesmo e gastava 100 unidades de quota.
check('não repete quando já diz "music"', searchAttempts('daft punk music').length === 1);
check('não repete quando já diz "song"', searchAttempts('best song ever').length === 1);

// "audio" parece contexto mas não destrava — verificado contra a API.
const audio = searchAttempts('EDEN sex official audio');
check('"audio" não conta como contexto', audio.length === 2, JSON.stringify(audio));

// Queries longas que falham falharam mesmo; repetir só duplica o custo.
const longa = searchAttempts('uma frase muito comprida que ninguem escreveu nunca');
check('query longa não é repetida', longa.length === 1, String(longa.length));
check('limite é 5 palavras', searchAttempts('a b c d e').length === 2);
check('6 palavras já não repete', searchAttempts('a b c d e f').length === 1);

// Degradação.
check('query vazia não gera pesquisas', searchAttempts('').length === 0);
check('só espaços não gera pesquisas', searchAttempts('   ').length === 0);
check('espaços à volta são limpos', searchAttempts('  eden  ')[0] === 'eden', searchAttempts('  eden  ')[0]);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

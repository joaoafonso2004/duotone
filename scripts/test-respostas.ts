import {
  acharOriginal,
  citadasPorCarregar,
  excertoDaMensagem,
  faltaAColunaDeResposta,
  quemECitado,
  TAMANHO_DO_EXCERTO,
} from '../src/lib/respostas.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

const texto = (message: string | null) => ({ itemType: 'track', message, playlistId: null });

console.log('\no excerto da original');
check('uma mensagem curta vai inteira', excertoDaMensagem(texto('bora ouvir isto')) === 'bora ouvir isto');
const longa = excertoDaMensagem(texto('a'.repeat(300)));
check('uma longa é cortada com reticências', longa.length === TAMANHO_DO_EXCERTO && longa.endsWith('…'), String(longa.length));
check('as quebras de linha viram espaços', excertoDaMensagem(texto('linha 1\n\nlinha 2')) === 'linha 1 linha 2');
// As mensagens de texto são item_type 'track' sem faixa: o tipo não diz que é música.
check('uma música partilhada diz qual é',
  excertoDaMensagem(texto(null), { faixa: { titulo: 'Lucid Dreams', artista: 'Juice WRLD' } }) === '♫ Lucid Dreams · Juice WRLD');
check('uma playlist com nome', excertoDaMensagem({ itemType: 'playlist', message: null, playlistId: 'p1' }, { playlist: 'Chill' }) === 'Playlist · Chill');
check('uma playlist sem nome ainda', excertoDaMensagem({ itemType: 'playlist', message: null, playlistId: 'p1' }) === 'Playlist');
check('um convite para ouvir junto', excertoDaMensagem({ itemType: 'sessao', message: 'bora', playlistId: null }) === 'Listening session invite');
check('sem nada para mostrar não fica vazio', excertoDaMensagem(texto('   ')) === 'Message');

console.log('\nquem é citado');
check('as minhas dizem You', quemECitado('eu', 'eu', 'João') === 'You');
check('as dos outros dizem o nome', quemECitado('ele', 'eu', 'Sampas') === 'Sampas');
check('sem sessão não se engana', quemECitado('eu', undefined, 'João') === 'João');

console.log('\nachar a original');
const mensagens = [{ id: 'a' }, { id: 'b', replyToId: 'a' }, { id: 'c', replyToId: 'antiga' }];
check('encontra a carregada', acharOriginal(mensagens, 'a')?.id === 'a');
check('sem id não procura', acharOriginal(mensagens, null) === null);
check('uma mais antiga do que a página não está', acharOriginal(mensagens, 'antiga') === null);
check('e é pedida à parte', citadasPorCarregar(mensagens).join() === 'antiga');
check('a mesma original citada duas vezes pede-se uma vez',
  citadasPorCarregar([...mensagens, { id: 'd', replyToId: 'antiga' }]).length === 1);

console.log('\nsem a migração');
check('o PostgREST sem a coluna', faltaAColunaDeResposta({ code: 'PGRST204', message: "Could not find the 'reply_to_id' column of 'shared_items'" }));
check('o Postgres sem a coluna', faltaAColunaDeResposta({ code: '42703', message: 'column "reply_to_id" does not exist' }));
// Uma recusa da política (responder a uma mensagem alheia) NÃO pode ser
// reenviada sem a citação às escondidas: é um erro a sério.
check('uma recusa da política não conta', !faltaAColunaDeResposta({ code: '42501', message: 'new row violates row-level security policy' }));
check('sem erro não conta', !faltaAColunaDeResposta(null));

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

import { estadoDoGuardar, mensagemDeFalhaAoGuardar } from '../src/lib/guardarPlaylist.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = veio === esperado;
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado ${esperado}, veio ${veio}`}`);
};

console.log('\no botão');
eq('uma playlist recebida mostra Save', estadoDoGuardar({ id: 'p', donoId: 'amigo', eu: 'eu', copias: new Set() }), 'guardar');
eq('depois de guardada abre a cópia', estadoDoGuardar({ id: 'p', donoId: 'amigo', eu: 'eu', copias: new Set(['p']) }), 'abrir-copia');
eq('numa playlist minha não aparece', estadoDoGuardar({ id: 'p', donoId: 'eu', eu: 'eu', copias: new Set() }), 'escondido');
// Enquanto as cópias não chegam, um "Save" podia estar a mentir sobre uma já guardada.
eq('enquanto não se sabe se já a tenho, não aparece', estadoDoGuardar({ id: 'p', donoId: 'amigo', eu: 'eu', copias: null }), 'escondido');
eq('com a playlist ainda a carregar, não aparece', estadoDoGuardar({ id: 'p', donoId: null, eu: 'eu', copias: new Set() }), 'escondido');
eq('sem sessão, não aparece', estadoDoGuardar({ id: 'p', donoId: 'amigo', eu: undefined, copias: new Set() }), 'escondido');
eq('uma cópia de OUTRA playlist não conta', estadoDoGuardar({ id: 'p', donoId: 'amigo', eu: 'eu', copias: new Set(['outra']) }), 'guardar');

console.log('\nquando falha');
eq('a base de dados sem a migração diz isso',
  mensagemDeFalhaAoGuardar({ code: '42501', message: 'This playlist is no longer available on this profile' }),
  'Saving playlists from chats needs the latest server update.');
eq('uma que deixou de estar partilhada', mensagemDeFalhaAoGuardar({ code: '42501', message: 'This playlist is no longer available' }),
  'This playlist is no longer shared with you.');
eq('outra falha qualquer', mensagemDeFalhaAoGuardar({ message: 'Failed to fetch' }), 'Could not save this playlist. Please try again.');

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

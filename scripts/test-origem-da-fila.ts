import {
  comecaListaNova,
  origemAoTocar,
  rotuloDaOrigem,
  type OrigemDaFila,
} from '../src/lib/origemDaFila.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

const playlist: OrigemDaFila = { tipo: 'playlist', nome: 'Chill Vibes', id: 'p1' };
const artista: OrigemDaFila = { tipo: 'artista', nome: 'Dillaz' };
const listaNova = { interno: false, mesmaFila: false };
const next = { interno: true, mesmaFila: true };
const upNext = { interno: false, mesmaFila: true };
const shuffleDeLista = { interno: true, mesmaFila: false };

console.log('\nquando a origem muda');
check('uma lista nova com origem fica com ela', origemAoTocar(null, playlist, listaNova)?.nome === 'Chill Vibes');
check('o next nao apaga a origem', origemAoTocar(playlist, undefined, next) === playlist);
check('tocar numa linha do Up next nao apaga a origem', origemAoTocar(playlist, undefined, upNext) === playlist);
// Um ecra que ainda nao diz de onde vem nao pode herdar a lista anterior.
check('uma lista nova sem origem nao herda a anterior', origemAoTocar(playlist, undefined, listaNova) === null);
// O Shuffle de uma lista chama o playTrack como interno, com uma fila nova.
check('o shuffle de uma lista traz a origem dela', origemAoTocar(playlist, artista, shuffleDeLista)?.nome === 'Dillaz');
check('null dito e mesmo nenhuma', origemAoTocar(playlist, null, shuffleDeLista) === null);
check('um nome vazio nao e origem', origemAoTocar(null, { tipo: 'playlist', nome: '   ', id: 'p' }, listaNova) === null);
check('o nome chega aparado', origemAoTocar(null, { tipo: 'artista', nome: '  Dillaz ' }, listaNova)?.nome === 'Dillaz');

console.log('\nquando as marcas do radio caem');
check('numa lista nova', comecaListaNova(undefined, listaNova));
check('no shuffle de uma lista', comecaListaNova(playlist, shuffleDeLista));
check('nao no next', !comecaListaNova(undefined, next));
check('nao ao tocar no Up next', !comecaListaNova(undefined, upNext));

console.log('\no que se diz');
const normal = { sugerida: false, doRadio: false };
const daPlaylist = rotuloDaOrigem(playlist, normal);
check('From e o nome da playlist', daPlaylist?.antes === 'From' && daPlaylist?.nome === 'Chill Vibes');
check('o nome leva a playlist', daPlaylist?.alvo?.id === 'p1');
check('sem origem nao se diz nada', rotuloDaOrigem(null, normal) === null);
check('uma faixa do radio nao diz que veio da playlist',
  rotuloDaOrigem(playlist, { sugerida: false, doRadio: true })?.nome === 'Radio');
const sugestao = rotuloDaOrigem(playlist, { sugerida: true, doRadio: false });
check('uma sugestao diz que e do Smart shuffle',
  !!sugestao && sugestao.antes.includes('Smart shuffle') && sugestao.nome === 'Chill Vibes');
check('uma sugestao sem origem diz na mesma de onde veio',
  rotuloDaOrigem(null, { sugerida: true, doRadio: false })?.nome === 'Smart shuffle');
const pesquisa = rotuloDaOrigem({ tipo: 'pesquisa', nome: '6:30' }, normal);
check('a pesquisa vai entre aspas e nao leva a lado nenhum',
  pesquisa?.antes === 'From search' && pesquisa?.nome === '“6:30”' && pesquisa?.alvo === null);
check('uma playlist sem id nao e clicavel', rotuloDaOrigem({ tipo: 'playlist', nome: 'X' }, normal)?.alvo === null);
check('uma prateleira nao e clicavel', rotuloDaOrigem({ tipo: 'prateleira', nome: 'Discover weekly' }, normal)?.alvo === null);
check('um album nao e clicavel', rotuloDaOrigem({ tipo: 'album', nome: 'Kenny' }, normal)?.alvo === null);
check('um artista e clicavel', rotuloDaOrigem(artista, normal)?.alvo?.nome === 'Dillaz');

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

import {
  comecaListaNova,
  origemAoTocar,
  fraseDeVoltar,
  rotuloDaOrigem,
  valeGuardarAFilaDeixada,
  type OrigemDaFila,
} from '../src/lib/origemDaFila.ts';
import { readFileSync } from 'node:fs';

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

console.log('\nvoltar à fila que se deixou (9/11)');
{
  const gostadas: OrigemDaFila = { tipo: 'guardadas', nome: 'Liked Songs' };
  const lista = (origem: OrigemDaFila | null, tamanho = 80, primeira = 'a', ultima = 'z') => ({ origem, tamanho, primeira, ultima });
  check('outra lista, com músicas por ouvir: guarda-se',
    valeGuardarAFilaDeixada({ ...lista(gostadas), faltam: 43 }, lista({ tipo: 'pesquisa', nome: 'x' }, 20)));
  check('sem músicas por ouvir não há para onde voltar',
    !valeGuardarAFilaDeixada({ ...lista(gostadas), faltam: 0 }, lista({ tipo: 'pesquisa', nome: 'x' }, 20)));
  check('outra música da mesma lista não é sair dela',
    !valeGuardarAFilaDeixada({ ...lista(gostadas), faltam: 43 }, lista({ ...gostadas })));
  check('duas playlists com o mesmo nome e outro id são listas diferentes',
    valeGuardarAFilaDeixada({ ...lista({ tipo: 'playlist', nome: 'Mix', id: 'p1' }), faltam: 3 }, lista({ tipo: 'playlist', nome: 'Mix', id: 'p2' })));
  check('sem origem dos dois lados, a mesma lista (tamanho e pontas) não se guarda',
    !valeGuardarAFilaDeixada({ ...lista(null), faltam: 5 }, lista(null)));
  check('sem origem dos dois lados, outra lista guarda-se',
    valeGuardarAFilaDeixada({ ...lista(null), faltam: 5 }, lista(null, 12, 'b', 'c')));
  check('a frase diz para onde, e quantas faltam', fraseDeVoltar(gostadas, 43).rotulo === 'Back to Liked Songs' && fraseDeVoltar(gostadas, 43).detalhe === '43 left');
  check('de uma pesquisa', fraseDeVoltar({ tipo: 'pesquisa', nome: '6:30' }, 3).rotulo === 'Back to search “6:30”');
  check('sem origem', fraseDeVoltar(null, 1).rotulo === 'Back to your last queue' && fraseDeVoltar(null, 1).acessivel === 'Back to your last queue, 1 song left');

  // A linha vive na fila, nas duas plataformas, com a mesma frase; só na fila de cada um.
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const hook = ler('src/desktop/useFilaDoLeitor.web.ts');
  check('PC: só com a fila de cada um (nem num Jam, nem a seguir um amigo)',
    /const anterior = podeEditar && filaAnterior \? fraseDeVoltar\(filaAnterior\.origem, filaAnterior\.faltam\) : null;/.test(hook));
  check('PC: a linha fica por baixo da cabeça da fila, e nas abas só na "Up next"',
    /\{fila\.anterior && \(!abas \|\| abas\.aba === 'fila'\) \? <Pressable accessibilityRole="button" accessibilityLabel=\{fila\.anterior\.acessivel\}/.test(ler('src/desktop/FilaDoLeitor.web.tsx')));
  const folha = ler('src/components/QueueSheet.tsx');
  check('iPhone: a mesma frase, entre a que toca e as próximas',
    /const voltar = !emSessao && !seguido && filaAnterior \? fraseDeVoltar\(filaAnterior\.origem, filaAnterior\.faltam\) : null;/.test(folha)
    && /usePlayer\.getState\(\)\.voltarAFilaAnterior\(\); \}\}/.test(folha));
  const loja = ler('src/state/player.ts');
  check('voltar usa o caminho do "Continue here" (retoma no segundo certo nos dois motores)',
    /get\(\)\.adoptSession\(\{ track: f\.faixa, queue: f\.queue, queueIndex: f\.queueIndex, positionMs: f\.posicaoMs \}\);/.test(loja));
  check('fechar o leitor larga a fila guardada', /if \(!await get\(\)\.prepararFecho\(\)\) return;\n\s+set\(\{ filaAnterior: null \}\);/.test(loja));
}

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

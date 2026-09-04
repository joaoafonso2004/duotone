/**
 * O que o widget mostra.
 *
 * A vista é Swift e não corre aqui, mas a decisão toda -- quem entra, por que
 * ordem, quantos cabem, quando vale a pena redesenhar -- é deste lado, e é
 * isso que se testa.
 */
import { amigosAOuvir, MAXIMO_DE_AMIGOS, montarEstado, mudou } from '../src/lib/estadoDoWidget.ts';
import type { Friendship } from '../src/api/social.ts';
import type { Track } from '../src/types.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

const amigo = (over: Partial<Friendship> & { friendId: string }): Friendship => ({
  username: 'u_' + over.friendId,
  name: 'Amigo ' + over.friendId,
  avatarUrl: null,
  status: 'accepted',
  isSender: false,
  lastSeenAt: null,
  online: true,
  ...over,
} as Friendship);

const aOuvir = (id: string, titulo: string, artista: string | null, over: Partial<Friendship> = {}) =>
  amigo({
    friendId: id,
    currentlyPlaying: { source: 'youtube', sourceId: 'v' + id, title: titulo, artist: artista } as any,
    ...over,
  });

const faixa: Track = {
  source: 'youtube', sourceId: 'abc', title: 'Uma Musica', artist: 'Artista - Topic',
  album: null, artworkUrl: 'https://exemplo/capa.jpg', durationSeconds: 200,
};

// --- Quem entra ------------------------------------------------------------
const todos = [
  aOuvir('c', 'Terceira', 'Artista C'),
  aOuvir('a', 'Primeira', 'Artista A'),
  aOuvir('b', 'Segunda', 'Artista B'),
];
check('só quem está a ouvir', amigosAOuvir(todos).length === 3);

check('offline não entra', amigosAOuvir([aOuvir('x', 'T', 'A', { online: false })]).length === 0);
check('sem música não entra', amigosAOuvir([amigo({ friendId: 'y' })]).length === 0);
check('pedido por aceitar não entra',
  amigosAOuvir([aOuvir('z', 'T', 'A', { status: 'pending' })]).length === 0);

// --- A ordem ---------------------------------------------------------------
// A presença chega por ordem variável; se o widget seguisse essa ordem, as
// pessoas trocavam de sítio sozinhas e parecia avariado.
const nomes = amigosAOuvir(todos).map((a) => a.nome);
const nomesOutraOrdem = amigosAOuvir([...todos].reverse()).map((a) => a.nome);
check('a ordem não depende da chegada', JSON.stringify(nomes) === JSON.stringify(nomesOutraOrdem),
  nomes.join(', '));
check('e é por nome', JSON.stringify(nomes) === JSON.stringify([...nomes].sort()));

// Nomes iguais desempatam pelo id, senão a ordem ficava ao acaso na mesma.
const iguais = [
  aOuvir('2', 'A', 'X', { name: 'Igual' }),
  aOuvir('1', 'B', 'Y', { name: 'Igual' }),
];
check('nomes iguais desempatam pelo id', amigosAOuvir(iguais)[0]!.id === '1');

// --- Quantos cabem ---------------------------------------------------------
const muitos = Array.from({ length: 12 }, (_, i) => aOuvir(String(i).padStart(2, '0'), 'T' + i, 'A' + i));
check(`nunca mais de ${MAXIMO_DE_AMIGOS}`, amigosAOuvir(muitos).length === MAXIMO_DE_AMIGOS);

// --- O nome ----------------------------------------------------------------
check('sem nome usa o utilizador',
  amigosAOuvir([aOuvir('n', 'T', 'A', { name: '  ' })])[0]!.nome === 'u_n');
check('sem nome nem utilizador não fica vazio',
  amigosAOuvir([aOuvir('m', 'T', 'A', { name: '', username: '' })])[0]!.nome === 'Someone');

// O canal do YouTube traz "- Topic" colado; o widget não pode mostrar isso.
check('o artista vem limpo',
  !amigosAOuvir([aOuvir('t', 'T', 'Artista - Topic')])[0]!.artista.includes('Topic'),
  amigosAOuvir([aOuvir('t', 'T', 'Artista - Topic')])[0]!.artista);

// --- O estado --------------------------------------------------------------
const tocando = montarEstado({ faixa, aTocar: true, cor: '#DB4949', amigos: todos, agora: 1000 });
check('a faixa entra quando toca', tocando.faixa?.titulo === 'Uma Musica');
check('o artista da faixa vem limpo', !tocando.faixa!.artista.includes('Topic'), tocando.faixa!.artista);
check('a cor passa', tocando.cor === '#DB4949');
check('o relógio passa', tocando.quando === 1000);

// Um widget a anunciar uma música em pausa há duas horas mente.
const parado = montarEstado({ faixa, aTocar: false, cor: '#DB4949', amigos: todos });
check('em pausa não há faixa', parado.faixa === null);
check('mas os amigos continuam lá', parado.amigos.length === 3);

const vazio = montarEstado({ faixa: null, aTocar: false, cor: null, amigos: [] });
check('sem nada, o estado é válido', vazio.faixa === null && vazio.amigos.length === 0 && vazio.cor === null);

// --- Quando redesenhar -----------------------------------------------------
// Cada escrita acorda o WidgetKit. A presença republica-se de 45 em 45
// segundos mesmo sem nada mudar, e a cor interpola durante a transição.
check('o primeiro estado escreve-se sempre', mudou(null, tocando));
check('o mesmo estado não se reescreve',
  !mudou(tocando, montarEstado({ faixa, aTocar: true, cor: '#DB4949', amigos: todos, agora: 999999 })));
check('só o relógio a mudar não conta',
  !mudou(tocando, { ...tocando, quando: tocando.quando + 60000 }));
check('outra cor conta', mudou(tocando, { ...tocando, cor: '#28C878' }));
check('outra faixa conta',
  mudou(tocando, montarEstado({ faixa: { ...faixa, title: 'Outra' }, aTocar: true, cor: '#DB4949', amigos: todos })));
// Um quarto amigo que nem cabe não deve acordar o widget; uma mudança numa
// das três linhas visíveis, sim.
check('um amigo que fica fora não força redesenho',
  !mudou(tocando, montarEstado({ faixa, aTocar: true, cor: '#DB4949', amigos: [...todos, aOuvir('d', 'Quarta', 'D')] })));
check('uma linha visível diferente conta',
  mudou(tocando, montarEstado({ faixa, aTocar: true, cor: '#DB4949', amigos: [aOuvir('a', 'Outra', 'Artista A'), ...todos.slice(0, 2)] })));

console.log(mau ? `\n  ${mau} falha(s)` : '\n  Todos os casos passaram.');
process.exit(mau ? 1 : 0);

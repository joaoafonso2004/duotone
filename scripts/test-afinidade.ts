import {
  alvosDeProcura,
  ARTISTAS_DO_RETRATO,
  artistasVizinhos,
  retratoDoContexto,
  vizinhosPorPlaylist,
  type FaixaComArtista,
} from '../src/lib/afinidade.ts';
import { chaveDeArtista } from '../src/lib/artistName.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado "${esperado}", veio "${veio}"`);

const f = (artista: string, playlistId?: string | null): FaixaComArtista => ({ artista, playlistId });

console.log('\no retrato do contexto');
const contexto = [
  f('Juice WRLD'), f('juice wrld'), f('JUICE WRLD'), f('Juice WRLD'),
  f('Lil Peep'), f('Lil Peep'),
  f('Fado Tradicional'),
];
const retrato = retratoDoContexto(contexto, chaveDeArtista);
eq('as grafias diferentes contam como um', retrato.size, 3);
check('o mais ouvido pesa mais',
  retrato.get('juice wrld')! > retrato.get('lil peep')!);
check('e o que aparece uma vez pesa menos que os outros',
  retrato.get('fado tradicional')! < retrato.get('lil peep')!);
// O peso e a RAIZ da contagem: sem isso um artista com 40 faixas numa
// biblioteca de 60 abafava tudo e as sugestoes eram sempre dele.
check('o peso cresce mais devagar que a contagem',
  retrato.get('juice wrld')! / retrato.get('fado tradicional')! < 4 / 1,
  (retrato.get('juice wrld')! / retrato.get('fado tradicional')!).toFixed(2));
check('nao passa do teto de artistas',
  retratoDoContexto(
    Array.from({ length: 30 }, (_, i) => f(`Artista ${i}`)), chaveDeArtista,
  ).size === ARTISTAS_DO_RETRATO);
eq('sem faixas da um retrato vazio', retratoDoContexto([], chaveDeArtista).size, 0);

console.log('\nquem anda com quem');
const biblioteca = [
  f('Juice WRLD', 'p1'), f('Lil Peep', 'p1'), f('XXXTentacion', 'p1'),
  f('Juice WRLD', 'p2'), f('Lil Peep', 'p2'),
  f('Amalia Rodrigues', 'p3'), f('Carlos do Carmo', 'p3'),
  // Faixas soltas, sem playlist: nao dizem nada uma sobre a outra.
  f('Solto A', null), f('Solto B', null),
];
const vizinhos = vizinhosPorPlaylist(biblioteca, chaveDeArtista);
check('quem partilha playlist fica ligado',
  vizinhos.get('juice wrld')?.has('lil peep') === true);
check('duas playlists juntas pesam mais do que uma',
  vizinhos.get('juice wrld')!.get('lil peep')! > vizinhos.get('juice wrld')!.get('xxxtentacion')!);
check('quem nunca partilhou playlist NAO fica ligado',
  !vizinhos.get('juice wrld')?.has('amalia rodrigues'));
check('faixas sem playlist nao criam ligacoes', !vizinhos.has('solto a'));
// Uma playlist gigante ligaria toda a gente a toda a gente, o que nao diz nada.
const gigante = Array.from({ length: 80 }, (_, i) => f(`A${i}`, 'enorme'));
check('uma playlist enorme e ignorada', vizinhosPorPlaylist(gigante, chaveDeArtista).size === 0);
check('uma playlist de um so artista nao liga nada',
  vizinhosPorPlaylist([f('So Eu', 'p9')], chaveDeArtista).size === 0);

console.log('\nos artistas vizinhos');
const retrato2 = retratoDoContexto([f('Juice WRLD'), f('Juice WRLD')], chaveDeArtista);
const pontuados = artistasVizinhos(retrato2, vizinhos);
check('encontra quem anda com o do retrato',
  pontuados.some((p) => p.chave === 'lil peep'));
check('quem esta NO retrato nao entra',
  !pontuados.some((p) => p.chave === 'juice wrld'));
check('quem partilha mais playlists vem a frente',
  pontuados[0]?.chave === 'lil peep', pontuados.map((p) => p.chave).join());
check('sem vizinhos devolve lista vazia',
  artistasVizinhos(retrato2, new Map()).length === 0);
// O ponto da funcionalidade: puxado por VARIOS do retrato vale mais.
const retrato3 = retratoDoContexto([f('Juice WRLD'), f('XXXTentacion')], chaveDeArtista);
const pontuados3 = artistasVizinhos(retrato3, vizinhos);
check('um artista puxado por dois do retrato lidera',
  pontuados3[0]?.chave === 'lil peep', pontuados3.map((p) => `${p.chave}:${p.pontos.toFixed(2)}`).join(' '));

console.log('\npor onde procurar');
// Determinista para o teste: o sorteio fica sempre com o primeiro.
const semSorte = () => 0;
const alvos = alvosDeProcura(retrato2, pontuados, 3, semSorte);
check('devolve alvos', alvos.length > 0, alvos.join());
check('nao repete', new Set(alvos).size === alvos.length);
// A rede de seguranca: uma biblioteca SEM playlists nao tem co-ocorrencia
// nenhuma, e sem isto o modo ficava mudo -- que foi o defeito anterior.
const semPlaylists = alvosDeProcura(retrato2, [], 3, semSorte);
check('sem vizinhos usa os proprios artistas do retrato',
  semPlaylists.length > 0 && semPlaylists.includes('juice wrld'),
  semPlaylists.join());
eq('sem retrato nem vizinhos nao rebenta',
  alvosDeProcura(new Map(), [], 3, semSorte).length, 0);
check('pedir mais do que existe nao repete nem rebenta',
  alvosDeProcura(retrato2, pontuados, 99, Math.random).length <= 1 + pontuados.length);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

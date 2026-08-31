import {
  apenasDeConfianca,
  chaveDeArtista,
  FAIXAS_PARA_CONFIAR,
  nomesDeConfianca,
  type FaixaParaAprender,
} from '../src/lib/artistName.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado "${esperado}", veio "${veio}"`);

/** Uma faixa do YouTube: o `artist` e o CANAL, que e como a app as recebe. */
const yt = (title: string, canal: string): FaixaParaAprender =>
  ({ source: 'youtube', title, artist: canal });

console.log('\num canal oficial confirma o nome');
// Um canal "- Topic" e gerado pelo YouTube a partir dos metadados da editora.
const comTopic = nomesDeConfianca([yt('Lucid Dreams', 'Juice WRLD - Topic')]);
check('uma so faixa de um canal - Topic ja chega',
  comTopic.has(chaveDeArtista('Juice WRLD')), [...comTopic].join());
const comVevo = nomesDeConfianca([yt('Circles', 'PostMaloneVEVO')]);
check('e um VEVO tambem', comVevo.has(chaveDeArtista('Post Malone')), [...comVevo].join());

console.log('\nsem canal oficial, e preciso peso');
const umaSo = nomesDeConfianca([yt('Juice WRLD - Righteous', 'Canal Qualquer')]);
check('uma faixa de um canal qualquer NAO chega',
  !umaSo.has(chaveDeArtista('Juice WRLD')), [...umaSo].join());

const varias = nomesDeConfianca([
  yt('Juice WRLD - Righteous', 'Canal A'),
  yt('Juice WRLD - Robbery', 'Canal B'),
  yt('Juice WRLD - Wishing Well', 'Canal C'),
]);
check(`${FAIXAS_PARA_CONFIAR} faixas distintas ja chegam`,
  varias.has(chaveDeArtista('Juice WRLD')), [...varias].join());

// A mesma musica em varias playlists chega aqui repetida. Se contasse linhas
// em vez de faixas, uma so musica bastava para dar confianca a um nome.
const repetida = nomesDeConfianca([
  yt('Juice WRLD - Righteous', 'Canal A'),
  yt('Juice WRLD - Righteous', 'Canal A'),
  yt('Juice WRLD - Righteous', 'Canal A'),
  yt('Juice WRLD - Righteous', 'Canal A'),
]);
check('a mesma faixa repetida conta UMA vez',
  !repetida.has(chaveDeArtista('Juice WRLD')), [...repetida].join());

console.log('\no caso real: o 999');
// O "999" e a tag do Juice WRLD e anda nos titulos. Num catalogo de musica
// resolve para uma banda punk inglesa de 1977 -- com 3097 fas e VINTE artistas
// semelhantes. Nenhuma verificacao feita ao nome ou ao catalogo o apanha:
// so a biblioteca sabe que aquilo nunca foi musica que alguem ouviu.
const comLixo = nomesDeConfianca([
  yt('Lucid Dreams', 'Juice WRLD - Topic'),
  yt('Righteous', 'Juice WRLD - Topic'),
  yt('999 - Legends', 'Canal Qualquer'),
  yt('999 - Hear Me Calling', 'Outro Canal'),
]);
check('o Juice WRLD e de confianca', comLixo.has(chaveDeArtista('Juice WRLD')));
check('e o "999" NAO e', !comLixo.has('999'), [...comLixo].join());

console.log('\na filtragem dos candidatos');
const candidatos = ['juice wrld', '999', 'lil peep'];
const confianca = new Set(['juice wrld', 'lil peep']);
const passaram = apenasDeConfianca(candidatos, (c) => c, confianca);
eq('so passam os de confianca', passaram.join(), 'juice wrld,lil peep');

// Sem biblioteca lida nao ha por onde decidir, e filtrar por um conjunto vazio
// deixava a descoberta muda sem razao nenhuma.
eq('sem informacao nenhuma nao se filtra',
  apenasDeConfianca(candidatos, (c) => c, new Set()).join(), candidatos.join());

// Mas com informacao, ninguem passar E a resposta -- nao uma falha para
// contornar. Ceder aqui repunha o defeito todo.
eq('com informacao, nenhum de confianca -> nenhum sai',
  apenasDeConfianca(['999'], (c) => c, confianca).length, 0);

eq('sem candidatos nao rebenta', apenasDeConfianca([], (c: string) => c, confianca).length, 0);

console.log('\nnao rebenta com dados estranhos');
eq('biblioteca vazia', nomesDeConfianca([]).size, 0);
check('titulo vazio nao cria artista nenhum',
  !nomesDeConfianca([yt('', 'Canal')]).has(''));
check('sem canal nao rebenta',
  nomesDeConfianca([{ source: 'youtube', title: 'Alguma coisa', artist: null }]) instanceof Set);
// Faixas do Spotify trazem o artista ja fiavel no campo `artist`.
const doSpotify = nomesDeConfianca([
  { source: 'spotify', title: 'Circles', artist: 'Post Malone' },
]);
check('artista vindo do Spotify e de confianca',
  doSpotify.has(chaveDeArtista('Post Malone')), [...doSpotify].join());

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

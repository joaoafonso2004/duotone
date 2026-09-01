import {
  candidatosPlausiveis,
  chaveDeCatalogo,
  ordenarPorGosto,
  repartir,
  type ArtistaDoCatalogo,
} from '../src/lib/catalogo.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado "${esperado}", veio "${veio}"`);

const a = (id: number, nome: string, fas: number): ArtistaDoCatalogo => ({ id, nome, fas });

console.log('\na chave com que se casa um nome a um artista do catalogo');
// O caso real que obrigou a esta chave existir: procurar "Xutos e Pontapes" e
// o catalogo ter "Xutos & Pontapes". Com uma chave estrita nao casavam.
eq('o & e o e sao a mesma coisa',
  chaveDeCatalogo('Xutos & Pontapés'), chaveDeCatalogo('Xutos e Pontapes'));
eq('o "and" tambem', chaveDeCatalogo('Simon and Garfunkel'), chaveDeCatalogo('Simon & Garfunkel'));
eq('o "the" inicial nao conta', chaveDeCatalogo('The Weeknd'), chaveDeCatalogo('Weeknd'));
eq('maiusculas nao contam', chaveDeCatalogo('JUICE WRLD'), chaveDeCatalogo('Juice Wrld'));
eq('acentos nao contam',
  chaveDeCatalogo('Amália Rodrigues'), chaveDeCatalogo('Amalia Rodrigues'));
eq('o $ e um s', chaveDeCatalogo('A$AP Rocky'), chaveDeCatalogo('ASAP Rocky'));
eq('a virgula nao parte o nome',
  chaveDeCatalogo('Tyler, The Creator'), 'tyler creator');
// E o que NAO pode fundir-se: dois artistas diferentes ficam diferentes.
check('artistas diferentes continuam diferentes',
  chaveDeCatalogo('Lil Peep') !== chaveDeCatalogo('Lil Pump'));
check('um nome que so tem ligacoes nao fica vazio', chaveDeCatalogo('The The') !== '');
eq('nome vazio da chave vazia', chaveDeCatalogo('   '), '');

console.log('\nqual dos homonimos e o artista');
// Real: procurar "Radiohead" no Deezer devolve PRIMEIRO um homonimo de 502
// fas, e so depois os Radiohead com quatro milhoes. A ordem do catalogo nao
// serve; a audiencia serve.
const radio = candidatosPlausiveis('Radiohead', [
  a(1, 'Radiohead', 502),
  a(2, 'Radiohead', 4082648),
  a(3, 'DJ Radiohead', 63),
]);
eq('escolhe o de mais audiencia entre os que casam', radio[0]?.id, 2);
check('quem nao casa pelo nome nao entra', !radio.some((x) => x.id === 3));
eq('e devolve os dois, por ordem', radio.length, 2);

// Real: os Xutos verdadeiros (70 mil fas) so casam se o & e o e forem iguais.
const xutos = candidatosPlausiveis('Xutos e Pontapes', [
  a(1, 'Xutos & Pontapés', 70291),
  a(2, 'Xutos E Pontapes', 1732),
  a(3, 'Tim (Xutos e Pontapés)', 58),
  a(4, 'Xutos & Pontapés, Orquestra Filarmónica Portuguesa', 8),
]);
eq('a banda verdadeira vem a frente do homonimo', xutos[0]?.id, 1);
eq('e as participacoes ficam de fora', xutos.length, 2);

eq('sem candidatos nao rebenta', candidatosPlausiveis('Seja Quem For', []).length, 0);
eq('procurar por nada nao casa com nada',
  candidatosPlausiveis('', [a(1, 'Qualquer', 10)]).length, 0);
check('nenhum casa -> nenhum sai',
  candidatosPlausiveis('Juice WRLD', [a(1, 'Lil Peep', 999999)]).length === 0);

console.log('\no catalogo propoe, o gosto escolhe');
const semelhantes = [
  a(1, 'Trippie Redd', 725352),   // 1o do catalogo
  a(2, 'Future', 3981769),
  a(3, 'Bispo', 40000),           // 3o do catalogo, mas e das playlists dele
  a(4, 'Lil Tecca', 715585),
];
const semGosto = ordenarPorGosto([semelhantes], new Map());
eq('sem afinidade fica a ordem do catalogo', semGosto[0]?.nome, 'Trippie Redd');
eq('e ate ao fim', semGosto[3]?.nome, 'Lil Tecca');

const comGosto = ordenarPorGosto([semelhantes], new Map([['bispo', 10]]));
eq('quem ele ja anda a ouvir sobe', comGosto[0]?.nome, 'Bispo');
check('mas os outros nao desaparecem', comGosto.length === 4);

// O ponto de "descobrir": quem ele ja ouve nao e descoberta nenhuma.
const semOsDele = ordenarPorGosto([semelhantes], new Map(), new Set(['future', 'lil tecca']));
check('quem esta na exclusao sai',
  !semOsDele.some((x) => x.nome === 'Future' || x.nome === 'Lil Tecca'),
  semOsDele.map((x) => x.nome).join());
eq('e sobram os outros', semOsDele.length, 2);

// A afinidade nao pode mandar sozinha: a escala dela depende do tamanho da
// biblioteca, e sem normalizar um numero grande apagava a ordem do catalogo.
const escalaEnorme = ordenarPorGosto([semelhantes], new Map([['bispo', 1e6], ['future', 999999]]));
// Empatados no gosto, ganha quem o catalogo poe mais acima -- que e o Future.
eq('com afinidades quase iguais o catalogo desempata', escalaEnorme[0]?.nome, 'Future');
eq('e o outro vem logo atras', escalaEnorme[1]?.nome, 'Bispo');
// E a prova de que a normalizacao serve para alguma coisa: numeros da ordem
// do milhao nao apagam a ordem do catalogo, so a inclinam.
eq('quem o catalogo poe em 1o mas ele nao ouve nao desaparece',
  escalaEnorme[2]?.nome, 'Trippie Redd');

// O defeito apanhado a correr isto de ponta a ponta: partindo de "Juice WRLD"
// E de "Dillaz", as doze sugestoes sairam TODAS do lado do Juice WRLD. As duas
// listas vinham coladas numa so, e quem estava na segunda metade herdava uma
// posicao pior so por ter sido acrescentado depois.
const doJuice = [a(10, 'Trippie Redd', 7e5), a(11, 'Future', 4e6),
  a(12, 'YNW Melly', 6e5), a(13, 'Lil Tecca', 7e5)];
const doDillaz = [a(20, 'Bispo', 40000), a(21, '9 Miller', 12000)];
const dosDois = ordenarPorGosto([doJuice, doDillaz], new Map());
check('o 1o do segundo alvo bate o 2o do primeiro',
  dosDois.indexOf(dosDois.find((x) => x.nome === 'Bispo')!)
    < dosDois.indexOf(dosDois.find((x) => x.nome === 'Future')!),
  dosDois.map((x) => x.nome).join());
check('e o rap portugues nao fica de fora do top',
  dosDois.slice(0, 3).some((x) => x.nome === 'Bispo'),
  dosDois.slice(0, 3).map((x) => x.nome).join());
eq('ninguem se perde pelo caminho', dosDois.length, 6);

// Estar nas listas de dois alvos vale a MELHOR posicao, e nao a soma: somar
// premiava quem e semelhante de toda a gente em vez de quem e semelhante dele.
const repetido = ordenarPorGosto(
  [[a(1, 'Comum', 100), a(2, 'So Do A', 100)], [a(3, 'Outro', 100), a(1, 'Comum', 100)]],
  new Map(),
);
eq('quem aparece nas duas listas aparece uma vez', repetido.length, 3);
eq('e fica com a melhor posicao que teve', repetido[0]?.nome, 'Comum');

eq('lista vazia devolve vazia', ordenarPorGosto([], new Map()).length, 0);

console.log('\ncomo se repartem os lugares da prateleira');
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
// O pedido dele: "se eu tenho ouvido mais juice wrld deve aparecer mais
// juice wrld ... mas mantendo um pouco de tudo". Antes cada artista de
// partida contribuia o mesmo, e uma prateleira de doze era seis de cada.
const doze = repartir([9, 3], 12);
eq('reparte 12 entre 9 e 3 na proporcao', doze.join(), '9,3');
eq('e nao perde nem inventa lugares', soma(doze), 12);
check('quem ele ouve mais leva mais', doze[0] > doze[1], doze.join());

// A outra metade da frase. Sem minimo, o de peso 1 num universo de 100
// levava zero e um lado inteiro do gosto desaparecia da prateleira.
const esmagado = repartir([100, 1], 12);
check('quem ele ouve pouco leva sempre pelo menos um', esmagado[1] >= 1, esmagado.join());
eq('e o total continua certo', soma(esmagado), 12);

// Menos lugares do que artistas: um a cada, pela ordem do peso.
const apertado = repartir([5, 3, 1], 2);
eq('com menos lugares que artistas nao se corta ninguem para dar dois a outro',
  apertado.join(), '1,1,0');
eq('total certo mesmo apertado', soma(apertado), 2);

eq('um artista so leva tudo', repartir([7], 12).join(), '12');
eq('sem artistas nao rebenta', repartir([], 12).length, 0);
eq('sem lugares da tudo a zero', repartir([5, 5], 0).join(), '0,0');
// Pesos todos a zero nao podem partir a conta.
eq('sem pesos reparte por igual', repartir([0, 0, 0], 9).join(), '3,3,3');
// Os minimos podem pedir mais do que ha: a conta tem de fechar na mesma.
const muitos = repartir([10, 1, 1, 1, 1], 6);
eq('com muitos artistas e poucos lugares o total fecha', soma(muitos), 6);
check('e ninguem fica a zero quando ha lugares para todos',
  muitos.every((x) => x >= 1), muitos.join());

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

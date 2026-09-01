import {
  agruparPorArtista,
  aprenderComABiblioteca,
  aprenderVocabulario,
  artistaPrincipal,
  canonizar,
  chaveDeArtista,
  displayArtist,
  extractArtist,
  limparPrefixoDeUpload,
  VOCABULARIO_VAZIO,
} from '../src/lib/artistName.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = veio === esperado;
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado "${esperado}", veio "${veio}"`}`);
};
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

console.log('\na chave que agrupa');
eq('ignora maiusculas', chaveDeArtista('JUICE WRLD'), chaveDeArtista('juice wrld'));
eq('ignora acentos', chaveDeArtista('Beyoncé'), 'beyonce');
eq('ignora pontuacao', chaveDeArtista('J. Cole'), 'j cole');
eq('a virgula nao parte o nome', chaveDeArtista('Tyler, The Creator'), 'tyler the creator');
// O cifrao e estilizacao, nao pontuacao: sem isto ficavam dois artistas.
eq('A$AP e ASAP sao o mesmo', chaveDeArtista('A$AP Rocky'), chaveDeArtista('ASAP Rocky'));
eq('vazio nao rebenta', chaveDeArtista(null), '');
check('NAO junta artistas diferentes', chaveDeArtista('Drake') !== chaveDeArtista('Drakeo'));

console.log('\ncolaboracoes: fica o principal');
eq('& corta', artistaPrincipal('Juice Wrld & Trippie Redd'), 'Juice Wrld');
eq('x corta', artistaPrincipal('Lil Tjay x Lil Durk'), 'Lil Tjay');
eq('feat corta', artistaPrincipal('Drake feat. Future'), 'Drake');
// O risco desta funcao: partir um nome que leva o separador dentro.
eq('a virgula NAO corta', artistaPrincipal('Tyler, The Creator'), 'Tyler, The Creator');
eq('um x no meio de uma palavra nao corta', artistaPrincipal('Rex Orange County'), 'Rex Orange County');
eq('um & sem espacos nao corta', artistaPrincipal('AC&DC'), 'AC&DC');

console.log('\nprefixos de quem faz upload');
eq('(LEAK)', limparPrefixoDeUpload('(LEAK) Lil Tjay x Lil Durk - No Talking'), 'Lil Tjay x Lil Durk - No Talking');
eq('[FREE]', limparPrefixoDeUpload('[FREE] Artista - Musica'), 'Artista - Musica');
eq('NEW solto', limparPrefixoDeUpload('NEW Artista - Musica'), 'Artista - Musica');
eq('dois seguidos', limparPrefixoDeUpload('(LEAK) [HQ] Artista - Musica'), 'Artista - Musica');
eq('um titulo normal fica igual', limparPrefixoDeUpload('Artista - Musica'), 'Artista - Musica');
// Nao pode comer um titulo que SEJA so um parentesis.
eq('nao devolve vazio', limparPrefixoDeUpload('(Interlude)'), '(Interlude)');

console.log('\nas 17 faixas reais da biblioteca');
// Estes titulos sao mesmo da biblioteca do Joao — foi neles que se mediram os
// 6 erros e os quatro grupos onde devia haver um.
const biblioteca = [
  { source: 'youtube', title: 'juice wrld - wishing well', artist: 'JuiceWRLDVEVO' },
  { source: 'youtube', title: 'JUICE WRLD - ROBBERY', artist: 'Some Uploader' },
  { source: 'youtube', title: 'Juice Wrld & Trippie Redd - Tell Me U Luv Me', artist: 'Rap Nation' },
  { source: 'youtube', title: 'Juice WRLD - Lucid Dreams', artist: 'Juice WRLD - Topic' },
  { source: 'youtube', title: 'Juice WRLD - Orlando', artist: 'Juice WRLD - Topic' },
  { source: 'youtube', title: '(LEAK) Lil Tjay x Lil Durk - No Talking', artist: 'Leak Channel' },
  { source: 'youtube', title: 'Lil Tjay - Calling My Phone', artist: 'Lil Tjay - Topic' },
  { source: 'youtube', title: 'Meus planos - BrazzaOg', artist: 'Uploads' },
  { source: 'youtube', title: 'Brazza Og - Outra', artist: 'Brazza Og - Topic' },
  { source: 'youtube', title: 'The Weeknd - Blinding Lights', artist: 'TheWeekndVEVO' },
  { source: 'youtube', title: 'Drake - Passionfruit', artist: 'Drake - Topic' },
  { source: 'youtube', title: 'Eminem - Lose Yourself', artist: 'EminemMusic' },
  { source: 'youtube', title: 'Kendrick Lamar - Poetic Justice', artist: 'Random' },
  { source: 'youtube', title: 'Travis Scott - SICKO MODE', artist: 'TravisScottVEVO' },
  { source: 'youtube', title: 'XXXTENTACION - what are you so afraid of', artist: 'Uploader' },
  { source: 'youtube', title: 'Future - Married to the Game', artist: 'Future - Topic' },
  { source: 'youtube', title: 'ZillaKami - THREATS', artist: 'ZillaKami' },
  // Caso real que criava um artista falso: o canal aparecia no fim do título
  // e, por ser mais comprido, ganhava ao artista verdadeiro.
  { source: 'youtube', title: 'Juice Wrld-Backspinn Prod.by Xan-Wrld999', artist: 'Xan-Wrld999' },
];

const vocabulario = aprenderVocabulario(biblioteca);
const grupos = agruparPorArtista(biblioteca);
const nomes = grupos.map((g) => g.nome);

// O ponto da funcionalidade: um so Juice WRLD, e escrito como deve ser.
const juice = grupos.filter((g) => chaveDeArtista(g.nome) === 'juice wrld');
check('ha UM so grupo de Juice WRLD', juice.length === 1, `${juice.length} grupos`);
eq('e escreve-se Juice WRLD', juice[0]?.nome, 'Juice WRLD');
check('com as seis faixas dele', juice[0]?.faixas.length === 6, String(juice[0]?.faixas.length));
check('o uploader Xan-Wrld999 NAO vira artista', !nomes.includes('Xan-Wrld999'));
eq('o caso exato da screenshot encontra Juice WRLD',
  displayArtist(biblioteca[biblioteca.length - 1], vocabulario), 'Juice WRLD');

const tjay = grupos.filter((g) => chaveDeArtista(g.nome) === 'lil tjay');
check('o (LEAK) x colaboracao junta-se ao Lil Tjay', tjay.length === 1 && tjay[0].faixas.length === 2,
  `${tjay.length} grupos, ${tjay[0]?.faixas.length} faixas`);

// O titulo ao contrario, que so o vocabulario resolve.
eq('titulo ao contrario, com o vocabulario',
  extractArtist('Meus planos - BrazzaOg', 'Uploads', vocabulario), 'Brazza Og');
eq('e SEM vocabulario nao se inventa',
  extractArtist('Meus planos - BrazzaOg', 'Uploads', VOCABULARIO_VAZIO), 'Meus planos');

console.log('\nos nomes ficam escritos como deve ser');
eq('do VEVO sai o nome separado', extractArtist('x', 'TheWeekndVEVO'), 'The Weeknd');
eq('o - Topic manda', extractArtist('seja o que for', 'Juice WRLD - Topic'), 'Juice WRLD');
eq('minusculas no titulo sao corrigidas',
  extractArtist('juice wrld - wishing well', 'qualquer', vocabulario), 'Juice WRLD');
eq('maiusculas tambem',
  extractArtist('JUICE WRLD - ROBBERY', 'qualquer', vocabulario), 'Juice WRLD');

console.log('\no que NAO se deve fazer');
// Fundir dois artistas diferentes e pior do que os separar: um desaparece.
check('Drake e Drakeo ficam separados',
  chaveDeArtista('Drake') !== chaveDeArtista('Drakeo the Ruler'));
check('nenhum grupo tem o nome vazio', grupos.every((g) => g.nome.trim().length > 0));
check('as faixas nao se perdem no agrupamento',
  grupos.reduce((n, g) => n + g.faixas.length, 0) === biblioteca.length,
  `${grupos.reduce((n, g) => n + g.faixas.length, 0)} de ${biblioteca.length}`);
check('nao ha duas chaves iguais', new Set(grupos.map((g) => g.chave)).size === grupos.length);
// Um titulo que nao diz o artista em lado nenhum NAO se adivinha.
eq('sem pistas, fica o canal', extractArtist('When It Rains It Pours', 'LusiEntertainment'), 'LusiEntertainment');
eq('um hifen de Remix nao inventa um artista',
  extractArtist('When It Rains-Remix', 'LusiEntertainment'), 'LusiEntertainment');
eq('Artista-Musica sem espacos funciona para nomes compostos',
  extractArtist('Brazza Og-Nova Musica', 'Uploads', vocabulario), 'Brazza Og');
eq('Artista-Musica sem espacos funciona quando o canal confirma um nome curto',
  extractArtist('ZillaKami-THREATS', 'ZillaKami', VOCABULARIO_VAZIO), 'ZillaKami');

console.log('\no Spotify nao passa pela extracao');
eq('o artista do Spotify e fiavel',
  displayArtist({ source: 'spotify', title: 'x', artist: 'Radiohead' }), 'Radiohead');
eq('mas a colaboracao continua a cortar-se',
  displayArtist({ source: 'spotify', title: 'x', artist: 'Drake feat. Future' }), 'Drake');

console.log('\ncompatibilidade: quem chama sem vocabulario continua a funcionar');
eq('dois argumentos ainda chegam', extractArtist('Drake - Passionfruit', 'Random'), 'Drake');
eq('displayArtist com um argumento',
  displayArtist({ source: 'youtube', title: 'Drake - Passionfruit', artist: 'Random' }), 'Drake');
eq('nada de nada da null', extractArtist(null, null), null);
eq('canonizar sem vocabulario da null', canonizar('Juice WRLD', VOCABULARIO_VAZIO), null);


console.log('\ntitulos ao contrario com sufixo de versao');
// Caso real, reportado com um print: a app abriu a pagina do artista
// chamada "poster boy" -- que e a MUSICA. O titulo era
// `poster boy - Zhollis (Perfectly Slowed)`, e o lado direito ficava
// `Zhollis (Perfectly Slowed)`, que nunca casava com `Zhollis` no
// vocabulario. O catalogo confirma quem e quem: "poster boy" e uma faixa
// do 2hollis.
{
  const vocab = aprenderVocabulario([
    { source: 'youtube', title: 'crush', artist: 'Zhollis - Topic' },
    { source: 'youtube', title: 'poster boy - Zhollis (Perfectly Slowed)', artist: 'Um Canal' },
  ]);
  const artista = (t: string) =>
    displayArtist({ source: 'youtube', title: t, artist: 'Um Canal' }, vocab);

  eq('destroca o titulo apesar do (Perfectly Slowed)',
    artista('poster boy - Zhollis (Perfectly Slowed)'), 'Zhollis');
  eq('e com dois sufixos colados',
    artista('poster boy - Zhollis (Perfectly Slowed) (Lyrics)'), 'Zhollis');
  eq('e com parentesis rectos',
    artista('poster boy - Zhollis [Official Audio]'), 'Zhollis');
  // O que NAO pode partir: um titulo na ordem certa fica na ordem certa.
  eq('a ordem normal continua a dar o artista',
    artista('Zhollis - poster boy'), 'Zhollis');
  eq('e um artista desconhecido de ambos os lados nao se troca',
    artista('alguma musica - alguem sem nome'), 'alguma musica');
}

console.log('\no vocabulario que a app usa por omissao');
// A razao de fundo do bug: o `displayArtist` sabia destrocar, mas a app
// chamava-o SEM vocabulario em 17 dos 19 sitios -- a maquinaria estava
// escrita e morta. Agora ha um vocabulario aprendido da biblioteca.
{
  const semNada = displayArtist({
    source: 'youtube', title: 'poster boy - Zhollis (Perfectly Slowed)', artist: 'Um Canal',
  });
  eq('antes de aprender fica o que o titulo diz', semNada, 'poster boy');

  aprenderComABiblioteca([
    { source: 'youtube', title: 'crush', artist: 'Zhollis - Topic' },
  ]);
  const depois = displayArtist({
    source: 'youtube', title: 'poster boy - Zhollis (Perfectly Slowed)', artist: 'Um Canal',
  });
  eq('depois de aprender, sem lhe passar nada, ja acerta', depois, 'Zhollis');

  // Aprender com uma lista vazia nao pode APAGAR o que ja se sabia.
  aprenderComABiblioteca([]);
  eq('uma leitura vazia nao desaprende', displayArtist({
    source: 'youtube', title: 'poster boy - Zhollis (Perfectly Slowed)', artist: 'Um Canal',
  }), 'Zhollis');
}

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

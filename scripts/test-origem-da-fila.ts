import {
  comecaListaNova,
  origemAoTocar,
  fraseDeVoltar,
  origemDoPerfil,
  ROTULO_DO_JAM,
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
  check('o X tira a linha nas duas plataformas e esquece a fila deixada (28/11)',
    /accessibilityLabel="Dismiss" onPress=\{fila\.esquecerAnterior\}/.test(ler('src/desktop/FilaDoLeitor.web.tsx'))
    && /usePlayer\.getState\(\)\.esquecerFilaAnterior\(\); \}\}/.test(folha)
    && /esquecerFilaAnterior: \(\) => \{ if \(get\(\)\.filaAnterior\) set\(\{ filaAnterior: null \}\); \}/.test(loja));
}

console.log('\no perfil, o Jam e os ecrãs que tocavam sem dizer de onde (24/11)');
{
  const lerFicheiro = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const minha = origemDoPerfil('momento', { proprio: true, userId: 'eu', nome: 'João Afonso', username: 'joao' });
  check('a tua música do momento diz "Your" e leva ao teu perfil (sem id)',
    minha.tipo === 'perfil' && minha.nome === 'Your song of the moment' && minha.id === undefined, JSON.stringify(minha));
  const dela = origemDoPerfil('mais-tocadas', { proprio: false, userId: 'u2', nome: 'Ana Sofia Reis', username: 'ana' });
  check('a de um amigo diz o primeiro nome e leva ao perfil dele',
    dela.nome === 'Ana’s most played' && dela.id === 'u2', JSON.stringify(dela));
  check('sem nome, o @', origemDoPerfil('recentes', { proprio: false, userId: 'u3', nome: '  ', username: 'rui' }).nome === 'rui’s recent plays');
  check('o que o amigo ouve e o que vem a seguir',
    origemDoPerfil('a-ouvir', { proprio: false, userId: 'u2', nome: 'Ana' }).nome === 'What Ana’s playing'
      && origemDoPerfil('a-seguir', { proprio: false, userId: 'u2', nome: 'Ana' }).nome === 'Ana’s up next');
  const r = rotuloDaOrigem(dela, normal);
  check('o perfil tem página: o topo do leitor leva lá', r?.antes === 'From' && r?.alvo?.tipo === 'perfil', JSON.stringify(r));
  check('o Jam diz "Jam" e não tem página (o toque abre o painel)', ROTULO_DO_JAM.nome === 'Jam' && ROTULO_DO_JAM.alvo === null);
  const topo = lerFicheiro('src/components/PlayerRoot.tsx');
  check('no leitor do iPhone, num Jam o topo é o do Jam (era só o símbolo)', /const origemNoTopo = temSessao \? ROTULO_DO_JAM : rotuloDaOrigem\(/.test(topo));
  check('e tocar nele abre o painel do Jam', /if \(temSessao\) \{ setSessaoAberta\(true\); return; \}/.test(topo));
  const home = lerFicheiro('src/screens/SearchScreen.tsx');
  check('as prateleiras da Home tocam com a origem (a mesma do "See all")',
    /const origem:OrigemDaFila=\{tipo:'prateleira',nome:title,id:nome\};/.test(home)
      && (home.match(/tocarMusica\(track, data, true, contextoDe\(track\), origem\)/g) ?? []).length === 3);
  check('a pesquisa toca com o "From search"',
    (home.match(/tocarMusica\((?:t, naBiblioteca|item, undefined), true, undefined, origemDaPesquisa\)/g) ?? []).length === 2);
}

console.log('\no "Play now" dos menus, o Radio e o PC (25/11)');
{
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const radio = rotuloDaOrigem({ tipo: 'radio', nome: 'Radio' }, normal);
  check('a semente de um Radio diz "Radio", como as que ele mete, e não tem página',
    radio?.antes === 'From' && radio?.nome === 'Radio' && radio?.alvo === null, JSON.stringify(radio));
  check('e o Radio começa-a com essa origem (era só o símbolo)',
    /playTrack\(track, \[track\], false, false, undefined, \{ tipo: 'radio', nome: 'Radio' \}\)/.test(ler('src/state/radioDaFaixa.ts')));
  for (const ecra of ['src/screens/ConversaScreen.tsx', 'src/screens/SocialScreen.tsx']) {
    const s = ler(ecra);
    check(`${ecra.split('/').pop()}: o menu de uma música da conversa leva a conversa ao "Play now"`,
      s.includes('aoMenuDaFaixa={(track,o)=>setMenu({track,de:o?.de})}') && s.includes('origem={menu?.de??null}'));
  }
  const menus: [string, RegExp][] = [
    ['src/screens/SongsScreen.tsx', /track=\{actionTrack\}\n\s+origem=\{ORIGEM_GUARDADAS\}/],
    ['src/screens/PlaylistDetailScreen.tsx', /track=\{actionTrack\}\n\s+origem=\{origem\}/],
    ['src/screens/LibraryGroupScreen.tsx', /track=\{actionTrack\}\n\s+origem=\{origemDaPagina\}/],
    ['src/screens/PrateleiraScreen.tsx', /origem=\{origemDaPrateleira\(fonte, titulo\)\}/],
    ['src/components/MusicasDoArtistaSheet.tsx', /<TrackActionsSheet visible=\{!!acao\} track=\{acao\} origem=\{origem\}/],
  ];
  for (const [f, re] of menus) check(`${f.split('/').pop()}: o menu de uma música diz de onde ela é`, re.test(ler(f)));
  const prateleira = ler('src/desktop/ui.web.tsx');
  check('PC: o botão direito numa prateleira leva o nome dela (os dois desenhos)',
    (prateleira.match(/onMore\?\.\(t, contexto\?\.\(t\), \{ de: \{ tipo: 'prateleira', nome: titulo \} \}\)/g) ?? []).length === 2);
  const biblioteca = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  // As prateleiras passam o `more` tal e qual: é a Shelf que lhe junta o nome (o caso de cima).
  check('PC: as tabelas da biblioteca (pesquisa, Liked Songs, mistura, artista, álbum) abrem o menu a dizer de onde',
    (biblioteca.match(/more\(t, c, \{ de: /g) ?? []).length === 6
      && (biblioteca.match(/onMore=\{more\}/g) ?? []).length === (biblioteca.match(/<Shelf /g) ?? []).length
      && !/onMore=\{props\.more\}/.test(biblioteca));
  check('PC: a playlist também', /podeEditar: canEdit \}, de: \{ tipo: 'playlist', nome: playlistTitle, id \}/.test(ler('src/desktop/paginas/PlaylistPages.web.tsx')));
  const soltos: [string, RegExp][] = [
    ['src/desktop/paginas/ProfilePage.web.tsx', /nome: userId && userId !== ownId \? 'Listening stats' : 'Your listening'/],
    ['src/desktop/paginas/RetrospetivaPage.web.tsx', /nome: 'Year in review'/],
    ['src/desktop/paginas/VocesOsDoisPage.web.tsx', /nome: nome \? `You and \$\{primeiro\}` : 'You two'/],
    ['src/desktop/paginas/LibraryCheckPage.web.tsx', /nome: 'Library check'[\s\S]*nome: 'Library check'/],
    ['src/desktop/PesquisaNaLinha.web.tsx', /tocarLista\(\[faixa\], false, false, \{ tipo: 'pesquisa', nome: procurado\.trim\(\) \}\)/],
    ['src/desktop/MenuDoAmigo.web.tsx', /origemDoPerfil\('a-ouvir'[\s\S]*nome: `You and /],
    ['src/desktop/AtalhosNaLateral.web.tsx', /\{ tipo: 'prateleira', nome: 'Pinned' \}/],
    ['src/desktop/SobreAMusica.web.tsx', /temArtista \? \{ tipo: 'artista', nome: d\.nome \} : null/],
    ['src/components/MenuDaMensagem.web.tsx', /opcoes\.deDaConversa\?\.\(\)/],
    ['src/components/NotificationBanner.web.tsx', /origemDaConversa\(\{ tipo: 'amigo', nome: item\.title \}\)/],
    ['src/components/SocialOverview.web.tsx', /props\.onTrack\(t, origemDoPerfil\('a-ouvir'/],
  ];
  for (const [f, re] of soltos) check(`PC, ${f.split('/').pop()}: toca a dizer de onde`, re.test(ler(f)));
}

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

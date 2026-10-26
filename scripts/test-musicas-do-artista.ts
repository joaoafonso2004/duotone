/**
 * A página de um artista com uma lista só, "Songs" (src/lib/musicasDoArtista.ts,
 * 20/10): as tuas primeiro e marcadas, depois as outras dele, e o cabeçalho sem
 * "0 songs". E o álbum da biblioteca sem "Album · 0 songs". Depois a variante A
 * de docs/artista-maquete.html: uma página por secções, com os fãs, as músicas
 * à vista e "See all songs", a discografia partida e os "Fans also like".
 *
 * Correr: node --experimental-strip-types scripts/test-musicas-do-artista.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  discografia, fasDoArtista, legendaDoDisco, metaDoAlbum, metaDoArtista, musicasAVista, musicasDoArtista,
  MUSICAS_A_VISTA, MUSICAS_NA_GRELHA, parecidosAVista,
} from '../src/lib/musicasDoArtista.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const t = (id: string) => ({ source: 'youtube', sourceId: id });

console.log('\nas regras');
caso('as tuas primeiro, pela ordem delas, e depois as dele', () => {
  const lista = musicasDoArtista([t('b'), t('a')], [t('z'), t('y')]);
  assert.deepEqual(lista.map((x) => x.sourceId), ['b', 'a', 'z', 'y']);
});
caso('uma que é tua e também está nas dele aparece uma vez, no sítio das tuas', () => {
  const lista = musicasDoArtista([t('a')], [t('z'), t('a'), t('a')]);
  assert.deepEqual(lista.map((x) => x.sourceId), ['a', 'z']);
});
caso('o cabeçalho só diz quantas são tuas, e só quando se sabe e são', () => {
  assert.equal(metaDoArtista(0, false), null, 'nada de "0 songs"');
  assert.equal(metaDoArtista(5, true), null, 'ainda a ler a biblioteca');
  assert.equal(metaDoArtista(1, false), '1 song in your library');
  assert.equal(metaDoArtista(12, false), '12 songs in your library');
});
caso('os fãs leem-se curtos, e juntam-se às tuas por baixo do nome', () => {
  assert.equal(fasDoArtista(5_100_000), '5.1M fans');
  assert.equal(fasDoArtista(2_000_000), '2M fans');
  assert.equal(fasDoArtista(820_400), '820K fans');
  assert.equal(fasDoArtista(1_540), '1.5K fans');
  assert.equal(fasDoArtista(940), '940 fans');
  for (const nada of [0, -3, null, undefined, NaN]) assert.equal(fasDoArtista(nada), null, String(nada));
  assert.equal(metaDoArtista(3, false, 5_100_000), '5.1M fans · 3 songs in your library');
  assert.equal(metaDoArtista(0, false, 5_100_000), '5.1M fans', 'sem "0 songs" mesmo com fãs');
  assert.equal(metaDoArtista(3, true, 940), '940 fans', 'a ler a biblioteca: só os fãs');
});
caso('cinco à vista, e todas depois de "See all songs"', () => {
  const lista = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(MUSICAS_A_VISTA, 5);
  assert.deepEqual(musicasAVista(lista, false), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(musicasAVista(lista, true), lista);
  assert.deepEqual(musicasAVista(lista, false, 10), lista, 'o PC mostra dez');
  assert.notEqual(musicasAVista(lista, true), lista, 'uma cópia, não a mesma lista');
});
caso('a discografia: álbuns de um lado, singles e EPs do outro, cada um pela ordem', () => {
  const d = (id: string, tipo: string, ano: string | null = null) => ({ id, tipo, ano });
  const { albuns, singles } = discografia([d('a', 'Album', '2024'), d('s', 'Single', '2023'), d('e', ' EP '), d('b', ''), d('m', 'Mixtape')]);
  assert.deepEqual(albuns.map((x) => x.id), ['a', 'b', 'm'], 'o que não diz Single nem EP conta como álbum');
  assert.deepEqual(singles.map((x) => x.id), ['s', 'e']);
  assert.equal(legendaDoDisco(d('a', 'Album', '2024')), '2024 · Album');
  assert.equal(legendaDoDisco(d('s', 'Single')), 'Single', 'sem ano, só o tipo');
  assert.equal(legendaDoDisco(d('b', '  ', '2020')), '2020 · Album', 'sem tipo, "Album"');
});
caso('"Fans also like": sem o próprio, sem repetidos nem vazios, e no máximo seis', () => {
  const chave = (n: string) => n.trim().toLowerCase();
  const nomes = ['Isak', 'Bon Iver', 'bon iver', '', 'Sufjan', 'A', 'B', 'C', 'D', 'E'].map((nome) => ({ nome }));
  assert.deepEqual(parecidosAVista(nomes, 'ISAK', chave), ['Bon Iver', 'Sufjan', 'A', 'B', 'C', 'D']);
  assert.deepEqual(parecidosAVista(nomes, 'Isak', chave, 2), ['Bon Iver', 'Sufjan']);
  assert.deepEqual(parecidosAVista([], 'Isak', chave), []);
});
caso('o álbum diz "Album" até haver músicas, e o singular conta', () => {
  assert.equal(metaDoAlbum(0, false), 'Album');
  assert.equal(metaDoAlbum(7, true), 'Album');
  assert.equal(metaDoAlbum(1, false), 'Album · 1 song');
  assert.equal(metaDoAlbum(9, false), 'Album · 9 songs');
});

console.log('\nligado nas duas páginas');
const iphone = ler('src/screens/LibraryGroupScreen.tsx');
const pc = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
caso('uma página por secções, sem separadores, nos dois lados', () => {
  // iPhone (23/10, docs/artista-ios-maquete.html): Top Songs numa grelha, o
  // último lançamento em destaque, a discografia, os parecidos e o About.
  assert.match(iphone, /<CabecalhoDaSeccao titulo=\{semDiscografia \? 'Songs' : 'Top Songs'\} aoCarregar=/);
  assert.match(iphone, /<GrelhaDeMusicas musicas=\{musicasAVista\(musicas, false, MUSICAS_NA_GRELHA\)\} renderLinha=\{linhaDaGrelha\} \/>/);
  assert.match(iphone, /<LancamentoEmDestaque album=\{pagina\.maisRecente\} aoAbrir=\{abrirDisco\} \/>/);
  assert.match(iphone, /<DiscosDoArtista titulo="Albums" discos=\{discos\.albuns\}/);
  assert.match(iphone, /<DiscosDoArtista titulo="Singles & EPs" discos=\{discos\.singles\} aoAbrir=\{abrirDisco\} lado=\{136\} \/>/);
  assert.match(iphone, /<ParecidosDoArtista nomes=\{vizinhanca\.parecidos\}/);
  assert.match(iphone, /\{fas \? <SobreOArtista foto=\{capaDoArtista\} fas=\{fas\} numeros=\{numerosDoArtista\} \/> : null\}/, 'o About só com os fãs');
  assert.doesNotMatch(iphone, /UltimoLancamento|See all songs|setTodas/, 'iPhone: a caixa colada aos botões e o botão grande saíram');
  // Sem discografia, as músicas vão todas numa lista (23/10, a página acabava nas Top Songs).
  assert.match(iphone, /const semDiscografia = !loadingYtAlbums && !pagina\?\.maisRecente && !discos\.albuns\.length && !discos\.singles\.length;/);
  assert.match(iphone, /: semDiscografia \? musicas\.map\(\(t\) => <React\.Fragment key=\{`\$\{t\.source\}:\$\{t\.sourceId\}`\}>\{linhaDaGrelha\(t\)\}<\/React\.Fragment>\)/);
  // PC (23/10, variante A de docs/artista-pc-maquete.html): todas as músicas e
  // uma coluna parada com o último lançamento, a discografia e os parecidos.
  assert.match(pc, /<Text style=\{artistStyles\.tituloDaSeccao\}>Songs<\/Text>/);
  assert.match(pc, /\{discos\.albuns\.map\(\(a\) => <Pressable key=\{a\.id\} onPress=\{\(\) => void abrirAlbum\(a\)\}/);
  assert.match(pc, /\{discos\.singles\.map\(\(a\) => <Pressable key=\{a\.id\} onPress=\{\(\) => void abrirAlbum\(a\)\}/);
  assert.match(pc, />Fans also like<\/Text>/);
  assert.match(pc, /coluna: \{\n\s+width: 330, flexShrink: 0, position: 'sticky', top: ESP\.lg,/, 'a coluna fica parada ao rolar');
  assert.doesNotMatch(pc, /<Page title="Artist"/, 'sem o título por cima da foto');
  for (const [nome, s] of [['iPhone', iphone], ['PC', pc]] as const) {
    assert.doesNotMatch(s, /'In your library', 'heart|\['library', 'In your library'\]|More songs'|More tracks'/, `${nome}: separador antigo`);
    assert.doesNotMatch(s, /\['songs', 'Songs'|\['albums', 'Albums'|setSeparador|setActiveTab/, `${nome}: os separadores Songs/Albums`);
  }
});
caso('doze na grelha do iPhone (todas no "›") e todas no PC, e o Play toca a página toda', () => {
  assert.equal(MUSICAS_NA_GRELHA, 12);
  // O "›" das Top Songs abre a folha com todas, com a ordem e a pesquisa.
  assert.match(iphone, /setVerTodas\(true\)/);
  assert.match(iphone, /<MusicasDoArtistaSheet[\s\S]{0,120}musicas=\{musicas\}/);
  const folha = ler('src/components/MusicasDoArtistaSheet.tsx');
  assert.match(folha, /correspondeAPesquisa\(q, tituloDaFaixa\(t\), displayArtist\(t\), t\.album\)/, 'a pesquisa é em memória');
  assert.match(folha, /`In your library · \$\{tuas\.length\}`/);
  assert.match(folha, /<TrackActionsSheet visible=\{!!acao\}/, 'o menu de uma música abre dentro da folha');
  assert.match(iphone, /const tocarDaPagina = useCallback\(\(t: Track\) => tocarMusica\(t, musicas, true, undefined, origemDaPagina\)/,
    'iPhone: uma linha (da grelha ou da folha) toca a página toda');
  // No PC estão todas na tabela (que monta ao rolar), sem "See all", com um
  // filtro em memória e uma linha entre as tuas e as dele.
  assert.match(pc, /<TrackTable plain colunaDoArtista=\{false\} showSavedBadge tracks=\{musicasFiltradas\}/);
  assert.match(pc, /correspondeAPesquisa\(q, tituloDaFaixa\(t\), displayArtist\(t\), t\.album\)/);
  assert.match(pc, /divisoria=\{\{ antesDe: tuasNaLista, rotulo: `More from \$\{name\}` \}\}/);
  assert.doesNotMatch(pc, /See all \$\{musicas\.length\} songs|MUSICAS_A_VISTA_NO_PC|setTodas/);
  assert.match(pc, /props\.tocarMusica\(t, musicas, undefined, \{ tipo: 'artista', nome: name \}\)/, 'PC: uma linha toca a página toda');
});
caso('os fãs e os parecidos pela vizinhança confirmada, e os parecidos abrem a página deles', () => {
  const hook = ler('src/hooks/useVizinhancaDoArtista.ts');
  assert.match(hook, /vizinhancaConfirmada\(nome, provas\)/, 'com as tuas como prova, e não só pelo nome');
  assert.match(hook, /if \(!pronta \|\| !nome\) return;/, 'espera pela biblioteca');
  assert.match(iphone, /useVizinhancaDoArtista\(name, tracks, type === 'artist' && !loading\)/);
  assert.match(pc, /useVizinhancaDoArtista\(name, tracks, !data\.loading\)/);
  assert.match(iphone, /navigation\.push\('LibraryGroup', \{ type: 'artist', name: n, capa: f \}\)/, 'com a foto que se tocou');
  assert.match(pc, /irPara\(\{ tipo: 'artista', nome: n \}\)/);
});
caso('a lista é a das tuas mais as dele, e as dele só quando a fonte certa responde', () => {
  assert.match(iphone, /musicasDoArtista\(tracksDaAba, aCarregarOutras \? \[\] : otherTracks\)/);
  assert.match(pc, /musicasDoArtista\(guardadasPorOrdem, aProcurarMusicas \? \[\] : outrasPorOrdem\)/);
  assert.match(iphone, /<TrackRow track=\{t\} showSavedBadge acompanharATocar mostrarDuracao=\{false\}/, 'iPhone: as tuas marcadas');
  assert.match(pc, /<TrackTable plain colunaDoArtista=\{false\} showSavedBadge tracks=\{musicasFiltradas\}/, 'PC: as tuas marcadas');
});
caso('nenhum cabeçalho diz "0 songs" ou "0 saved tracks"', () => {
  assert.match(iphone, /const tuas = !loading && tracks\.length > 0 \? `\$\{tracks\.length\} in your library` : null;/);
  assert.match(iphone, /<CapaDoArtista nome=\{name\} foto=\{capaDoArtista\} fas=\{fas\} tuas=\{tuas\}/);
  assert.match(iphone, /subtitle=\{metaDoAlbum\(tracks\.length, loading\)\}/);
  assert.match(pc, /metaDoArtista\(tracks\.length, data\.loading, vizinhanca\.fas\)/);
  assert.doesNotMatch(pc, /saved \{tracks\.length === 1 \? 'track' : 'tracks'\}/);
  assert.doesNotMatch(iphone, /`Album · \$\{tracks\.length\} songs`/);
  assert.match(ler('src/components/CabecalhoDaPlaylist.tsx'), /\{meta === null \? null : <Text style=\{styles\.meta\}>/);
});

caso('a foto do cabeçalho abre a cobrir, e não num quadrado ao centro (26/10)', () => {
  // A foto pequena da grelha segura o lugar enquanto a grande chega; o
  // `placeholderContentFit` do expo-image é 'scale-down' de origem, e ela
  // ficava um quadrado ao centro até a grande "ampliar".
  const capa = ler('src/components/SeccoesDoArtista.tsx');
  const imagem = capa.slice(capa.indexOf('placeholder={{ uri: fotoNoTamanho(foto, 250) }}'));
  assert.match(imagem.slice(0, 300), /contentFit="cover"[\s\S]*placeholderContentFit="cover"/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

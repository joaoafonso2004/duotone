/**
 * Os Artists do PC (30/10, passo 4 de `docs/PLANO-ELEVAR-PC.md`): a ordem da
 * grelha, o artista que mais ouves à frente dela, o retrato redondo a dois tons
 * com o vinil, a viagem do retrato para a foto da página, e a cor da foto do
 * artista na janela inteira (a MESMA camada do Now Playing, sem afinações
 * próprias). A conta é pura (`lib/grelhaDeArtistas.ts`); o resto lê o código
 * como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-artistas-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  artistaEmDestaque, horasDoArtista, jogadasEmCurto, OPCOES_DOS_ARTISTAS, ordenarGrelhaDeArtistas, posicoesDaBiblioteca, resumoDosArtistas,
} from '../src/lib/grelhaDeArtistas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const PAGINAS = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const RETRATOS = ler('src/desktop/RetratosDosArtistas.web.tsx');
const CASCA = ler('src/desktop/casca.web.tsx');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
const grelha = PAGINAS.slice(PAGINAS.indexOf('export function ArtistsPage('), PAGINAS.indexOf('export function MisturaPage('));
const paginaDoArtista = PAGINAS.slice(PAGINAS.indexOf('export function ArtistPage('));

const F = (id: string, seg: number | null = 200) => ({ source: 'youtube', sourceId: id, durationSeconds: seg });
const G = (nome: string, chave: string, ...faixas: ReturnType<typeof F>[]) => ({ nome, chave, faixas });
// Por escuta já vem assim da página (`ordenarArtistas`).
const lista = [G('Juice WRLD', 'juice wrld', F('a'), F('b')), G('Éden', 'eden', F('c')), G('Drake', 'drake', F('d'), F('e'), F('f')), G('Zeca', 'zeca', F('g'))];
// A biblioteca como a loja a dá: a guardada há menos tempo primeiro.
const biblioteca = [F('g'), F('c'), F('a'), F('d'), F('b'), F('e'), F('f')];

console.log('\na ordem da grelha');
caso('as três opções são as da maquete, por esta ordem', () => {
  assert.deepEqual(OPCOES_DOS_ARTISTAS.map((o) => o.rotulo), ['Most played', 'A–Z', 'Recently added']);
  assert.deepEqual(OPCOES_DOS_ARTISTAS.map((o) => o.id), ['plays', 'az', 'recent']);
});
caso('"Most played" é a ordem por escuta que a página já tinha, sem a mexer, e é uma cópia', () => {
  const copia = ordenarGrelhaDeArtistas(lista, 'plays', posicoesDaBiblioteca(biblioteca));
  assert.deepEqual(copia.map((g) => g.nome), lista.map((g) => g.nome));
  assert.notEqual(copia, lista as unknown);
  ordenarGrelhaDeArtistas(lista, 'az', new Map());
  assert.equal(lista[0].nome, 'Juice WRLD', 'a lista de entrada não se reordena');
});
caso('"A–Z" ignora maiúsculas e acentos', () => {
  assert.deepEqual(ordenarGrelhaDeArtistas(lista, 'az', new Map()).map((g) => g.nome), ['Drake', 'Éden', 'Juice WRLD', 'Zeca']);
});
caso('"Recently added" põe primeiro quem teve uma música guardada há menos tempo', () => {
  assert.deepEqual(ordenarGrelhaDeArtistas(lista, 'recent', posicoesDaBiblioteca(biblioteca)).map((g) => g.nome), ['Zeca', 'Éden', 'Juice WRLD', 'Drake']);
});
caso('"Recently added" com uma faixa que a biblioteca não conhece vai para o fim, pelo nome', () => {
  const com = [...lista, G('Aaa', 'aaa', F('zzz'))];
  assert.equal(ordenarGrelhaDeArtistas(com, 'recent', posicoesDaBiblioteca(biblioteca)).at(-1)!.nome, 'Aaa');
});

console.log('\nas contas do cartão em destaque');
caso('o destaque é o primeiro por escuta que tem reproduções e músicas', () => {
  const d = artistaEmDestaque(lista, new Map([['eden', 12], ['drake', 90]]));
  assert.equal(d!.grupo.nome, 'Éden');
  assert.equal(d!.jogadas, 12);
});
caso('sem nenhuma reprodução não há destaque (nada de "o mais ouvido" sem ouvir)', () => {
  assert.equal(artistaEmDestaque(lista, new Map()), null);
  assert.equal(artistaEmDestaque([], new Map([['a', 5]])), null);
});
caso('as horas: minutos, uma casa e inteiras', () => {
  assert.equal(horasDoArtista([F('a', 600), F('b', 1200)]), '30 min');
  assert.equal(horasDoArtista([F('a', 9000)]), '2.5 h');
  assert.equal(horasDoArtista([F('a', 3600 * 18)]), '18 h');
  assert.equal(horasDoArtista([F('a', null)]), '1 min', 'sem duração, o mínimo é 1 min e não 0');
});
caso('as reproduções: o número, e "6.1k" a partir de mil', () => {
  assert.equal(jogadasEmCurto(247), '247');
  assert.equal(jogadasEmCurto(6100), '6.1k');
  assert.equal(jogadasEmCurto(18400), '18k');
});
caso('a linha por baixo do título diz como está ordenado', () => {
  assert.equal(resumoDosArtistas(332, 'plays'), '332 artists · by how much you listen');
  assert.equal(resumoDosArtistas(332, 'az'), '332 artists · A to Z');
  assert.equal(resumoDosArtistas(332, 'recent'), '332 artists · newest first');
  assert.equal(resumoDosArtistas(1, 'plays'), '1 artist');
});

console.log('\na grelha');
caso('a barra tem as opções de ordem, e o título diz como está ordenado', () => {
  assert.match(grelha, /<Chips rotulo="Sort artists" valor=\{ordemDaGrelha\} opcoes=\{OPCOES_DOS_ARTISTAS\} aoMudar=\{setOrdemDaGrelha\} \/>/);
  assert.match(grelha, /subtitle=\{data\.semLista \? undefined : resumoDosArtistas\(artists\.length, ordemDaGrelha\)\}/);
});
caso('a ordem por escuta é a que já havia (favoritos primeiro), e as outras partem dela', () => {
  assert.match(grelha, /const porEscuta = useMemo\(\s*\(\) => ordenarArtistas\(gruposDaBiblioteca\(data\.tracks, versaoDoCatalogo\), ranking, favoritos\)/);
  assert.match(grelha, /ordenarGrelhaDeArtistas\(porEscuta, ordemDaGrelha, posicoes\)/);
});
caso('as reproduções vêm do MESMO pedido do ranking: nenhum pedido novo', () => {
  assert.equal((grelha.match(/getTopArtists\(/g) ?? []).length, 1);
  assert.match(grelha, /const plays = new Map\(tops\.map\(\(a\) => \[chaveDeArtista\(a\.name\), a\.plays\] as \[string, number\]\)\);/);
  assert.match(grelha, /rankingGuardado = \{ conta, mapa, jogadas: plays, em: Date\.now\(\) \};/);
});
caso('o cartão em destaque só com a ordem por escuta e sem pesquisa, e antes da grelha', () => {
  assert.match(grelha, /\{!query && ordemDaGrelha === 'plays' && destaque \? <ArtistaEmRepeticao /);
  assert.ok(grelha.indexOf('<ArtistaEmRepeticao') < grelha.indexOf('<View style={styles.playlistGrid}>'));
});
caso('o Play do destaque toca as músicas dele da biblioteca, com a origem "artista"', () => {
  assert.match(grelha, /void leitor\.tocarLista\(\[\.\.\.faixas\], leitor\.shuffle, leitor\.shuffleInteligente, \{ tipo: 'artista', nome \}\);/);
});
caso('cada cartão é um retrato que viaja para a página, e o coração e o ponto de novidade ficam lá dentro', () => {
  assert.match(grelha, /<Pressable key=\{chave\} onPress=\{\(\) => viajar\(retratoDe\(RETRATO\.artista\(chave\)\), \(\) => navigate\(\{ name: 'artist', value: nome \}\)\)\}/);
  assert.match(grelha, /<RetratoDoArtista nome=\{nome\} faixas=\{faixas\} aoMontar=\{guardarRetrato\(RETRATO\.artista\(chave\)\)\}>/);
  assert.match(grelha, /<\/RetratoDoArtista>/);
  assert.match(grelha, /\{\.\.\.\(favorito \? marcar\('coracaoDoCartao', 'fixo'\) : marcar\('coracaoDoCartao'\)\)\}/);
});
caso('o botão direito, o menu e o "com-menu" do cartão ficam como estavam', () => {
  assert.match(grelha, /onContextMenu: \(e: any\) => abrirMenuDoArtista\(\{ nome, capa: faixas\[0\]\?\.artworkUrl \?\? null \}, e\)/);
  assert.match(grelha, /\.\.\.\(artistaDoMenu === chave \? \['com-menu'\] : \[\]\)/);
});
caso('a foto do cartão é a do catálogo, e sem ela a capa de uma música dele (a regra de 23/10)', () => {
  assert.match(RETRATOS, /return foto \? fotoNoTamanho\(foto, 250\) : faixa \? capaDaFaixa\(faixa\) : null;/);
  assert.ok(!/function FotoDoCartao/.test(PAGINAS), 'a FotoDoCartao ficou como código morto');
});

console.log('\no retrato e o vinil');
caso('o retrato é redondo e a dois tons com o brilho; por trás, um vinil com a capa de outra música dele', () => {
  assert.match(RETRATOS, /<CapaDuotone uri=\{imagem\} brilho style=\{\{ borderRadius: LADO \/ 2 \}\} \/>/);
  assert.match(RETRATOS, /<View \{\.\.\.marcar\('vinil'\)\}/);
  assert.match(RETRATOS, /const disco = faixas\[1\] \? capaDaFaixa\(faixas\[1\]\) : faixas\[0\] \? capaDaFaixa\(faixas\[0\]\) : null;/);
});
caso('o vinil sai para o lado e roda só com transform (um por cartão), e o retrato fica à frente', () => {
  assert.match(CASCA, /\[data-dt~="vinil"\]\{ transition: transform 800ms var\(--dt-curva\); \}/);
  assert.match(CASCA, /\[data-dt~="cartao"\]:hover \[data-dt~="vinil"\], \[data-dt~="cartao"\]:focus-within \[data-dt~="vinil"\]\{ transform: translateX\(38%\) rotate\(120deg\); \}/);
  assert.match(RETRATOS, /retrato: \{[^}]*zIndex: 2/);
  assert.match(RETRATOS, /vinil: \{[^}]*zIndex: 1/);
});
caso('o destaque leva o brilho, a cor da foto por trás e três capas em leque', () => {
  assert.match(RETRATOS, /<View \{\.\.\.marcar\('cartao', 'brilho'\)\} style=\{\[estilos\.destaque, fundo as any\]\}>/);
  assert.match(RETRATOS, /color-mix\(in oklab, \$\{cor\} 38%, transparent\)/);
  assert.match(RETRATOS, /faixas\.slice\(0, 3\)/);
});
caso('nada de className nem de backdrop-filter', () => {
  assert.ok(!/className\s*[=:]/.test(RETRATOS.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!/backdrop-?[fF]ilter/.test(RETRATOS));
});

console.log('\na viagem do retrato para a foto da página');
caso('a foto da página é onde o retrato chega: leva o mesmo nome, e o CSS faz a imagem cobrir o grupo', () => {
  assert.match(PAGINAS, /import \{ guardarRetrato, NOME_DO_RETRATO, retratoDe, viajar \} from '\.\.\/viagem\.web';/);
  assert.match(PAGINAS, /pointerEvents: 'none', viewTransitionName: NOME_DO_RETRATO,/);
  assert.match(CASCA, /::view-transition-old\(portrait\), ::view-transition-new\(portrait\)\{ height: 100%; object-fit: cover; \}/);
});
caso('o destaque também viaja, com o retrato dele', () => {
  assert.match(grelha, /aoAbrir=\{\(\) => viajar\(retratoDe\(RETRATO\.artistaEmDestaque\(destaque\.grupo\.chave\)\), \(\) => navigate\(\{ name: 'artist', value: destaque\.grupo\.nome \}\)\)\}/);
});

console.log('\na cor do artista na janela inteira');
caso('é a MESMA camada do Now Playing (o mesmo véu e a mesma intensidade), com a foto do catálogo', () => {
  assert.match(NAVEGADOR, /\{corDoArtistaMontada && fotoDaCor && <FundoDaCapa onde="janela" aApagar=\{corDoArtistaApaga\} uri=\{fotoNoTamanho\(fotoDaCor, 250\)\} \/>\}/);
  assert.equal((NAVEGADOR.match(/<FundoDaCapa /g) ?? []).length, 2, 'só duas camadas: a do leitor e a do artista');
});
caso('só com a preferência "Whole window", só na página do artista, e só se a foto se souber', () => {
  assert.match(NAVEGADOR, /const corDoArtista = useSaida\(corDoLeitor === 'janela' && route\.name === 'artist' && !leitorAberto && !!fotoDaCor, SAIDA_DO_LEITOR_MS\);/);
});
caso('a do Now Playing manda: com a cor do leitor na janela, a do artista não se monta', () => {
  assert.match(NAVEGADOR, /const corDoArtistaMontada = corDoArtista\.montado && !corNaJanela;/);
  assert.match(NAVEGADOR, /const corDoArtistaApaga = corDoArtista\.aSair && !corNaJanela;/);
});
caso('ao sair da página a cor apaga-se (como a do Now Playing) e a superfície volta ao mesmo passo', () => {
  assert.match(NAVEGADOR, /\(corNaJanela && !aApagarACor\) \|\| \(corDoArtistaMontada && !corDoArtistaApaga\) \? \{ backgroundColor: 'transparent' \} : bgStyle/);
  assert.match(NAVEGADOR, /\{\.\.\.\(aApagarACor \|\| corDoArtistaApaga \? marcar\('main-a-voltar'\) : \{\}\)\}/);
  assert.match(NAVEGADOR, /if \(route\.name === 'artist' && artistaDaCor !== route\.value\) setArtistaDaCor\(route\.value\);/);
});
caso('o véu e a camada são os de sempre: nenhuma afinação nova da cor', () => {
  const estilos = ler('src/desktop/estilos.web.ts');
  assert.match(estilos, /janelaCorVeu: \{[^}]*rgba\(6,6,8,\.46\) 0px,rgba\(6,6,8,\.40\) 240px,rgba\(6,6,8,\.30\) 34%,rgba\(6,6,8,\.46\) 55%,rgba\(6,6,8,\.72\) 72%,rgba\(6,6,8,\.82\) 100%/);
  assert.match(estilos, /filter: 'blur\(70px\) saturate\(1\.2\) brightness\(\.62\)'/);
});
caso('com a cor na janela, a mancha local do cabeçalho não se repete', () => {
  assert.match(paginaDoArtista, /corNaJanela = false, \.\.\.props \}: \{ name: string; back: \(\) => void; corNaJanela\?: boolean \}/);
  assert.match(paginaDoArtista, /const cor = useCorDoAmbiente\(corNaJanela \? null : foto\);/);
  assert.match(NAVEGADOR, /<ArtistPage name=\{route\.value\} back=\{back\} corNaJanela=\{corDoArtistaMontada && !corDoArtistaApaga\} \{\.\.\.common\} \/>/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

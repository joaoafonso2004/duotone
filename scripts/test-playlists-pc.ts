/**
 * As Playlists do PC (30/10, passo 2 de `docs/PLANO-ELEVAR-PC.md`): a pesquisa e a
 * ordem da grelha, uma porta só para importar, e a viagem partilhada (o mosaico
 * voa da grelha para o cabeçalho da playlist). A conta é pura
 * (`lib/ordemDasPlaylists.ts`); o resto lê o código como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-playlists-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filtrarPlaylists, OPCOES_DE_ORDEM, ordenarPlaylists, resumoDasPlaylists } from '../src/lib/ordemDasPlaylists.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const PAGINA = ler('src/desktop/paginas/PlaylistPages.web.tsx');
const VIAGEM = ler('src/desktop/viagem.web.ts');
const CASCA = ler('src/desktop/casca.web.tsx');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
const grelha = PAGINA.slice(PAGINA.indexOf('export function PlaylistsPage('), PAGINA.indexOf('export function PlaylistPage('));

const L = (name: string, trackCount: number, colaborativa = false) => ({ name, trackCount, colaborativa });
const lista = [L('Moradia', 50), L('Juice WRLD', 25, true), L('álbum favorito', 37), L('Gym', 37, true), L('Zeca', 12)];

console.log('\na ordem da grelha');
caso('"Recent" é a ordem da loja, sem a mexer, e uma cópia nunca altera a original', () => {
  const copia = ordenarPlaylists(lista, 'recent');
  assert.deepEqual(copia.map((p) => p.name), lista.map((p) => p.name));
  assert.notEqual(copia, lista as unknown);
  ordenarPlaylists(lista, 'az');
  assert.equal(lista[0].name, 'Moradia', 'a lista da loja não se reordena');
});
caso('"A–Z" ignora maiúsculas e acentos', () => {
  assert.deepEqual(ordenarPlaylists(lista, 'az').map((p) => p.name), ['álbum favorito', 'Gym', 'Juice WRLD', 'Moradia', 'Zeca']);
});
caso('"Most tracks" põe as maiores primeiro e desempata pelo nome', () => {
  assert.deepEqual(ordenarPlaylists(lista, 'most').map((p) => p.name), ['Moradia', 'álbum favorito', 'Gym', 'Juice WRLD', 'Zeca']);
});
caso('as três opções são as da maquete, por esta ordem', () => {
  assert.deepEqual(OPCOES_DE_ORDEM.map((o) => o.rotulo), ['Recent', 'A–Z', 'Most tracks']);
  assert.deepEqual(OPCOES_DE_ORDEM.map((o) => o.id), ['recent', 'az', 'most']);
});

console.log('\na pesquisa e o resumo');
caso('a pesquisa é pelo nome, sem acentos nem maiúsculas, e vazia dá todas', () => {
  assert.deepEqual(filtrarPlaylists(lista, 'album').map((p) => p.name), ['álbum favorito']);
  assert.deepEqual(filtrarPlaylists(lista, 'GYM').map((p) => p.name), ['Gym']);
  assert.equal(filtrarPlaylists(lista, '   ').length, 5);
  assert.equal(filtrarPlaylists(lista, 'zzz').length, 0);
});
caso('o resumo conta as playlists e as colaborativas', () => {
  assert.equal(resumoDasPlaylists(lista), '5 playlists · 2 collaborative');
  assert.equal(resumoDasPlaylists([L('A', 1)]), '1 playlist');
  assert.equal(resumoDasPlaylists([L('A', 1, true)]), '1 playlist · 1 collaborative');
  assert.equal(resumoDasPlaylists([]), '');
});

console.log('\na grelha');
caso('o título leva o resumo, e a barra tem pesquisa e as opções de ordem', () => {
  assert.match(grelha, /<Page title="Playlists" subtitle=\{items\.length \? resumoDasPlaylists\(items\) : undefined\}/);
  assert.match(grelha, /<Field icon="search" placeholder="Search playlists" value=\{consulta\} onChangeText=\{setConsulta\} \/>/);
  assert.match(grelha, /<Chips rotulo="Sort playlists" valor=\{ordemDaGrelha\} opcoes=\{OPCOES_DE_ORDEM\} aoMudar=\{setOrdemDaGrelha\} \/>/);
});
caso('a grelha mostra as visíveis (filtradas e ordenadas), e a pesquisa diz "N of M"', () => {
  assert.match(grelha, /const visiveis = useMemo\(\(\) => ordenarPlaylists\(filtrarPlaylists\(items, consulta\), ordemDaGrelha\), \[items, consulta, ordemDaGrelha\]\);/);
  assert.match(grelha, /\{visiveis\.map\(\(item\) => <Pressable key=\{item\.id\}/);
  assert.match(grelha, /\{visiveis\.length\} of \{items\.length\}/);
});
caso('uma porta só para importar: abre um menu com o YouTube e o Spotify (a exceção da regra)', () => {
  assert.ok(!/>YouTube<\/Button>/.test(grelha) && !/>Spotify<\/Button>/.test(grelha), 'sobraram os dois botões');
  assert.match(grelha, /<Button secondary icon="download-outline" onPress=\{\(\) => \{ setOndeImportar\(ultimoClique\(\)\); setImportarAberto\(true\); \}\}>Import<\/Button>/);
  assert.match(grelha, /\{ id: 'youtube', rotulo: 'From YouTube', icone: 'logo-youtube' \}, \{ id: 'spotify', rotulo: 'From Spotify', icone: 'musical-notes-outline' \}/);
  assert.match(grelha, /navigate\(\{ name: id === 'youtube' \? 'import' : 'spotify-import' \}\)/);
});
caso('os cartões continuam a ser alvos de largar e a levar o menu do botão direito', () => {
  assert.match(grelha, /ref=\{refDoAlvo\(`cartao-playlist:\$\{item\.id\}`, alvoDaPlaylist\(/);
  assert.match(grelha, /onContextMenu=\{\(\(e: any\) => \{ e\.preventDefault\(\); setOndeMenu\(pontoDoEvento\(e\)\); setMenuAlvo\(item\); \}\) as any\}/);
});

console.log('\na viagem partilhada');
caso('o cartão abre a playlist com o mosaico a viajar, e o cabeçalho é onde ele chega', () => {
  assert.match(grelha, /onPress=\{\(\) => viajar\(retratoDe\(RETRATO\.playlist\(item\.id\)\), \(\) => navigate\(\{ name: 'playlist', id: item\.id, title: item\.name \}\)\)\}/);
  assert.match(grelha, /<View ref=\{guardarRetrato\(RETRATO\.playlist\(item\.id\)\) as any\}><PlaylistArtwork/);
  assert.match(PAGINA, /<View style=\{\{ viewTransitionName: NOME_DO_RETRATO \} as any\}><PlaylistArtwork artworks=\{artworks\} lado=\{176\} \/><\/View>/);
});
caso('só viaja com a API, com a janela à vista e sem "menos movimento"; senão navega como sempre', () => {
  assert.match(VIAGEM, /typeof \(document as ComViagem\)\.startViewTransition !== 'function'\) return false;/);
  assert.match(VIAGEM, /document\.visibilityState !== 'visible'\) return false;/);
  assert.match(VIAGEM, /return !window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches;/);
  assert.match(VIAGEM, /if \(!origem \|\| aChegar \|\| !podeViajar\(\)\) \{ mudar\(\); return; \}/);
});
caso('a promessa da viagem espera pela rota nova (a transição do React é assíncrona), com um prazo', () => {
  assert.match(VIAGEM, /export const ESPERA_MAXIMA_MS = 2500;/);
  assert.match(VIAGEM, /const prazo = setTimeout\(cumprir, ESPERA_MAXIMA_MS\);/);
  assert.match(NAVEGADOR, /useEffect\(\(\) => \{ viagemChegou\(\); \}, \[route\]\);/);
  assert.match(NAVEGADOR, /import \{ viagemChegou, voltarViajando \} from '\.\.\/desktop\/viagem\.web';/);
});
caso('o nome sai do cartão e a marca da raiz também, aconteça o que acontecer', () => {
  assert.match(VIAGEM, /origem\.style\.removeProperty\('view-transition-name'\); raiz\.removeAttribute\('data-viagem'\); aChegar = null;/);
  assert.match(VIAGEM, /void t\.finished\.then\(limpar, limpar\);/);
  assert.match(VIAGEM, /\} catch \{\n\s+limpar\(\);\n\s+mudar\(\);/);
});
caso('o CSS: 560 ms no mosaico, a raiz esbate-se depressa, e a página nova não entra a subir', () => {
  assert.match(CASCA, /::view-transition-group\(portrait\)\{ animation-duration: 560ms; animation-timing-function: var\(--dt-curva\); \}/);
  assert.match(CASCA, /::view-transition-old\(root\), ::view-transition-new\(root\)\{ animation-duration: 220ms; \}/);
  assert.match(CASCA, /html\[data-viagem\] \[data-dt~="pagina"\]\{ animation: none; \}/);
  assert.match(CASCA, /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\)\{ animation: none !important; \}/);
});
caso('nada de backdrop-filter, e o `viewTransitionName` só no cabeçalho da playlist', () => {
  assert.ok(!/backdrop-?[fF]ilter/.test(VIAGEM));
  assert.equal((PAGINA.match(/viewTransitionName/g) ?? []).length, 1);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

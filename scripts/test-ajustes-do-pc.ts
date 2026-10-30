/**
 * Os ajustes do PC de 30/10, depois de o João usar a app: uma playlist fixada
 * não herda as faixas da anterior, o efeito a dois tons é opção (desligado de
 * origem), e as sugestões no fim de uma playlist. A conta das sugestões é pura
 * (`lib/sugestoesDaPlaylist.ts`); o resto lê o código como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-ajustes-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_SUGESTOES, sugestoesParaAPlaylist } from '../src/lib/sugestoesDaPlaylist.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
const PLAYLISTS = ler('src/desktop/paginas/PlaylistPages.web.tsx');
const SUGESTOES = ler('src/desktop/SugestoesDaPlaylist.web.tsx');
const CAPA = ler('src/desktop/duotone.web.tsx');
const DOIS_TONS = ler('src/desktop/doisTons.web.ts');
const PREFS = ler('src/lib/prefs.ts');
const DEFINICOES = ler('src/desktop/paginas/SettingsPage.web.tsx');

const T = (id: string, artist: string, title = id) => ({ source: 'youtube', sourceId: id, title, artist });

console.log('\numa playlist fixada não herda as faixas da anterior');
caso('a página de uma playlist recria-se por playlist (a chave é o id), como a de uma mistura', () => {
  assert.match(NAVEGADOR, /page = <PlaylistPage key=\{route\.id\} id=\{route\.id\}/);
  assert.match(NAVEGADOR, /case 'mistura': page = <MisturaPage key=\{route\.id\}/);
});

console.log('\nas sugestões no fim de uma playlist');
caso('as que já estão na playlist não voltam, e uma repetida entre prateleiras conta uma vez', () => {
  const lista = [T('a', 'Drake')];
  const r = sugestoesParaAPlaylist(lista, [[T('a', 'Drake'), T('b', 'Morad')], [T('b', 'Morad'), T('c', 'Yeat')]]);
  assert.deepEqual(r.map((t) => t.sourceId), ['b', 'c']);
});
caso('quem tem o artista que já está na playlist sobe, e o resto fica pela ordem das prateleiras', () => {
  const lista = [T('a', 'Morad'), T('b', 'Morad'), T('c', 'Drake')];
  const r = sugestoesParaAPlaylist(lista, [[T('x', 'Yeat'), T('y', 'Drake'), T('z', 'Morad')], [T('w', 'Ken Carson')]]);
  assert.deepEqual(r.map((t) => t.sourceId), ['z', 'y', 'x', 'w'], 'o artista com mais músicas na playlist primeiro');
});
caso('no máximo cinco, e sem nada à volta devolve vazio', () => {
  const muitas = Array.from({ length: 12 }, (_, i) => T(`m${i}`, `Artista ${i}`));
  assert.equal(sugestoesParaAPlaylist([], [muitas]).length, MAX_SUGESTOES);
  assert.equal(MAX_SUGESTOES, 5);
  assert.deepEqual(sugestoesParaAPlaylist([T('a', 'Drake')], [[], []]), []);
});
caso('uma playlist vazia recebe as primeiras das prateleiras', () => {
  assert.deepEqual(sugestoesParaAPlaylist([], [[T('p', 'A'), T('q', 'B')], [T('r', 'C')]]).map((t) => t.sourceId), ['p', 'q', 'r']);
});
caso('a lista de entrada e as prateleiras não se alteram', () => {
  const prateleira = [T('x', 'Yeat'), T('y', 'Drake')];
  sugestoesParaAPlaylist([T('a', 'Drake')], [prateleira]);
  assert.deepEqual(prateleira.map((t) => t.sourceId), ['x', 'y']);
});
caso('só se mostram numa playlist em que se pode mexer, sem pesquisa, depois da tabela', () => {
  assert.match(PLAYLISTS, /\{canEdit && !query\.trim\(\) \? <SugestoesDaPlaylist faixas=\{tracks\} aoJuntar=\{juntarSugestao\} \/> : null\}<\/>\}<\/ContentScroll>/);
  assert.ok(PLAYLISTS.indexOf('<SugestoesDaPlaylist') > PLAYLISTS.indexOf('<TrackTable'));
});
caso('juntar é o `addTracksToPlaylist` de sempre, e relê-se por baixo (a lista e a contagem acertam)', () => {
  assert.match(PLAYLISTS, /await addTracksToPlaylist\(id, \[t\]\);/);
  assert.match(PLAYLISTS, /await refresh\(\{ silencioso: true \}\);/);
  assert.match(PLAYLISTS, /catch \(e\) \{ avisarErro\(mensagemDeErro\(e, 'playlist'\)\); \}/);
});
caso('nenhum pedido novo: vêm das prateleiras que a Home já tem, e a página não as manda buscar', () => {
  assert.match(SUGESTOES, /useRecomendacoes\(\(s\) => s\.descobrir\)/);
  assert.ok(!/carregar\(|fetch\(|supabase|pesquisar/.test(SUGESTOES), 'esta secção não pede nada');
  assert.match(SUGESTOES, /if \(!sugestoes\.length\) return null;/);
});
caso('um clique de cada vez, e nada de className nem de backdrop-filter', () => {
  assert.match(SUGESTOES, /if \(aJuntar\) return;/);
  assert.ok(!/className\s*[=:]/.test(SUGESTOES.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!/backdrop-?[fF]ilter/.test(SUGESTOES));
});

console.log('\no efeito a dois tons é opção, desligado de origem');
caso('a preferência começa desligada: só "1" liga', () => {
  assert.match(PREFS, /export async function getDoisTons\(\): Promise<boolean> \{\n  try \{ return \(await AsyncStorage\.getItem\(KEY_DOIS_TONS\)\) === '1'; \} catch \{ return false; \}/);
  assert.match(PREFS, /const KEY_DOIS_TONS = 'pref:doisTons';/);
});
caso('antes de ler a preferência está desligado, e mudar avisa quem assina', () => {
  assert.match(DOIS_TONS, /let ligado = false;/);
  assert.match(DOIS_TONS, /if \(v === ligado\) return;/);
  assert.match(DOIS_TONS, /return useSyncExternalStore\(assinar, ler, ler\);/);
});
caso('desligado, toda a capa é a cores e nem se monta a camada a cinzentos (uma imagem em vez de duas)', () => {
  assert.match(CAPA, /const aCores = viva \|\| !doisTons;/);
  assert.match(CAPA, /if \(aCores\) return <View \{\.\.\.marcas\} style=\{quadro as any\}><Image source=\{\{ uri \}\} style=\{imagem as any\} \/><\/View>;/);
  assert.ok(CAPA.indexOf('if (aCores) return') < CAPA.indexOf("marcar('duo-tom')"), 'a camada fica depois da saída');
});
caso('a casca lê-a ao arrancar, e as Definições mudam-na ao vivo e guardam-na', () => {
  assert.match(NAVEGADOR, /useEffect\(\(\) => \{ void getDoisTons\(\)\.then\(definirDoisTons\); \}, \[\]\);/);
  assert.match(DEFINICOES, /<ToggleLine label="Two-tone covers" description="[^"]+" value=\{doisTons\} onChange=\{\(v\) => \{ setDoisTonsState\(v\); definirDoisTons\(v\); void setDoisTons\(v\); \}\} \/>/);
  assert.match(DEFINICOES, /useEffect\(\(\) => \{ void getDoisTons\(\)\.then\(setDoisTonsState\); \}, \[\]\);/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

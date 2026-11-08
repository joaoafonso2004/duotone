/**
 * O menu de um lançamento novo no PC (src/lib/menuDoLancamento.ts, 20/10): o
 * clique direito num cartão dos "New releases" não fazia nada. E as pesquisas
 * recentes da Home do PC, que passaram a aparecer só com a caixa em foco.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-menu-do-lancamento.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuDoLancamento } from '../src/lib/menuDoLancamento.ts';
import { MOTIVOS } from '../src/lib/menuDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('\no menu');
caso('abrir, tocar, baralhar, pôr na fila, guardar e ir ao artista, por esta ordem', () => {
  const m = menuDoLancamento({ tipo: 'Album' }, { semRede: false });
  assert.deepEqual(m.map((l) => l.id), ['abrir', 'tocar', 'baralhar', 'fila', 'guardar', 'artista']);
  assert.deepEqual(m.map((l) => l.rotulo), ['Open album', 'Play', 'Shuffle', 'Add to queue', 'Save as playlist', 'View artist']);
  assert.ok(m.every((l) => !l.motivo), 'com rede nada está apagado');
  assert.deepEqual(m.filter((l) => l.inicioDeGrupo).map((l) => l.id), ['tocar', 'guardar']);
});
caso('o tipo diz-se como numa frase', () => {
  assert.equal(menuDoLancamento({ tipo: 'EP' }, { semRede: false })[0]!.rotulo, 'Open EP');
  assert.equal(menuDoLancamento({ tipo: 'Single' }, { semRede: false })[0]!.rotulo, 'Open single');
  assert.equal(menuDoLancamento({ tipo: '' }, { semRede: false })[0]!.rotulo, 'Open release');
});
caso('sem rede as linhas ficam à vista a dizer porquê, menos ir ao artista', () => {
  const m = menuDoLancamento({ tipo: 'Album' }, { semRede: true });
  assert.equal(m.length, 6, 'o menu sem rede não perde linhas');
  for (const l of m) assert.equal(l.motivo ?? null, l.id === 'artista' ? null : MOTIVOS.semRede, l.id);
});
caso('sem artista para onde ir (a página dele, uma playlist da pesquisa), sem "View artist" (24/10)', () => {
  const m = menuDoLancamento({ tipo: 'Playlist' }, { semRede: false, temArtista: false });
  assert.deepEqual(m.map((l) => l.id), ['abrir', 'tocar', 'baralhar', 'fila', 'guardar']);
  assert.equal(m[0]!.rotulo, 'Open playlist');
});
caso('tocar, baralhar e pôr na fila dizem-se como no menu de uma playlist', () => {
  const playlist = ler('src/lib/menuDaPlaylist.ts');
  for (const r of ['Play', 'Shuffle', 'Add to queue']) assert.match(playlist, new RegExp(`rotulo: '${r}'`), r);
});

console.log('\nligado no PC');
const ui = ler('src/desktop/ui.web.tsx');
const home = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
caso('o cartão de um lançamento abre o menu no clique direito', () => {
  const prateleira = ui.slice(ui.indexOf('export function ShelfDeLancamentos('), ui.indexOf('export function PrateleiraDeMisturas('));
  assert.match(prateleira, /onContextMenu=\{\(\(e: any\) => \{ if \(!onMenu\) return; e\.preventDefault\(\); onMenu\(it\.id, e\); \}\) as any\}/);
  assert.match(home, /onMenu=\{\(id, e\) => \{ const l = lancamentos\.find\([^\n]+abrirMenuDoDisco\(\{ id: l\.id, titulo: l\.titulo, legenda: legendaDoLancamento\(l\), capa: l\.capa, tipo: l\.tipo, artista: l\.artista \}, e\)/);
  assert.match(home, /linhas=\{menuDoLancamento\(menu\.d, \{ semRede, temArtista: !!menu\.d\.artista \}\)/);
  assert.match(home, /aoEscolher=\{\(id\) => fazer\(menu\.d, id as AcaoDoLancamento\)\}/);
});
caso('o que o menu faz é o mesmo da pré-visualização do álbum', () => {
  assert.match(home, /const faixasDe = async \(album: YtRecommendedPlaylist\): Promise<Track\[\]> =>/);
  assert.match(home, /const faixas = await faixasDe\(album\);\n\s+if \(pedido !== pedidoDeAlbum\.current\) return;/, 'a pré-visualização usa as mesmas faixas');
  assert.match(home, /if \(modo === 'baralhar'\) await leitor\.playShuffled\(/, 'baralhar é o playShuffled (Fisher-Yates)');
});
caso('as pesquisas recentes só aparecem com a caixa em foco', () => {
  assert.match(home, /onFocus=\{\(\) => setComFoco\(true\)\} onBlur=\{\(\) => setComFoco\(false\)\}/);
  assert.match(home, /\{comFoco && query\.trim\(\)\.length < 2 && !loading && history\.length > 0 && <View style=\{styles\.history\} \{\.\.\.\(\{ onMouseDown: \(e: any\) => e\.preventDefault\(\) \} as any\)\}>/,
    'e carregar numa etiqueta não lhe tira o foco antes do clique');
});

console.log('\no toque longo no iPhone (8/11: segurar um disco ou uma música do álbum não fazia nada)');
caso('os discos da página do artista: o toque longo abre o menu, com a vibração e os 350 ms das músicas', () => {
  const seccoes = ler('src/components/SeccoesDoArtista.tsx');
  assert.match(seccoes, /\? \{ onLongPress: \(\) => \{ hapticSelection\(\); aoSegurar\(d\); \}, delayLongPress: 350 \}/);
  assert.match(seccoes, /onPress=\{\(\) => aoAbrir\(album\)\} \{\.\.\.segurar\(aoSegurar, album\)\}/, 'o lançamento em destaque');
  assert.match(seccoes, /onPress=\{\(\) => aoAbrir\(d\)\} \{\.\.\.segurar\(aoSegurar, d\)\}/, 'os carrosséis de álbuns e singles');
  const artista = ler('src/screens/LibraryGroupScreen.tsx');
  assert.equal((artista.match(/aoSegurar=\{setDiscoComMenu\}/g) ?? []).length, 3, 'o destaque, os álbuns e os singles');
  // As mesmas linhas do PC, sem "View artist" (já se está na página dele), e sem as que pedem rede quando não há.
  assert.match(artista, /menuDoLancamento\(discoComMenu, \{ semRede: offline, temArtista: false \}\)\n\s+\.filter\(\(a\) => !a\.motivo\)/);
  assert.match(artista, /if \(acao === 'abrir'\) abrirDisco\(d\);\n\s+else if \(acao === 'guardar'\) void guardarDiscoComoPlaylist\(d\);\n\s+else if \(acao === 'tocar' \|\| acao === 'baralhar' \|\| acao === 'fila'\) void discoSemAbrir\(d, acao\);/);
  assert.equal(menuDoLancamento({ tipo: 'Album' }, { semRede: false, temArtista: false }).some((l) => l.id === 'artista'), false);
});
caso('o que o menu faz no iPhone: as faixas como as lê a folha do álbum, e o jeito das playlists do iPhone', () => {
  const acoes = ler('src/state/acoesDoDisco.ts');
  assert.match(acoes, /const r = await fetchYouTubePlaylistById\(id\);/);
  assert.match(acoes, /if \(modo === 'fila'\) \{ leitor\.addManyToQueue\(faixas\); hapticNotification\(\); return; \}/);
  assert.match(acoes, /if \(modo === 'baralhar'\) await leitor\.playShuffled\(faixas, leitor\.shuffleInteligente, origem\);/);
  assert.match(acoes, /const origem = \{ tipo: 'album' as const, nome: d\.title \};/, 'com a origem: entra no "Jump back in"');
  assert.match(acoes, /const playlist = await createPlaylist\(d\.title\);\n\s+await addTracksToPlaylist\(playlist\.id, faixas\);/);
});
caso('segurar uma música dentro do álbum abre o menu da música, dentro da folha', () => {
  const folha = ler('src/components/YtPlaylistRecommendationSheet.tsx');
  assert.match(folha, /onAction=\{\(\) => setAcao\(item\)\}/);
  assert.match(folha, /<TrackActionsSheet visible=\{!!acao\} track=\{acao\} onClose=\{\(\) => setAcao\(null\)\} \/>\n\s+<\/BottomSheet>/,
    'dentro da BottomSheet: uma folha ao lado desta não aparecia por cima dela');
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

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

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

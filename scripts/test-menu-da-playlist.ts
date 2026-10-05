/**
 * O menu de uma playlist (src/lib/menuDaPlaylist.ts), e que os quatro menus o usam.
 *
 * Correr: node --experimental-strip-types scripts/test-menu-da-playlist.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuDaPlaylist, type SituacaoDaPlaylist } from '../src/lib/menuDaPlaylist.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ids = (s: SituacaoDaPlaylist) => menuDaPlaylist(s).map((a) => a.id);
const base: SituacaoDaPlaylist = { plataforma: 'ios', onde: 'cartao', temFaixas: true, minha: true };

caso('no cartão toca-se sem abrir, nos dois lados', () => {
  assert.deepEqual(ids(base).slice(0, 3), ['tocar', 'baralhar', 'fila']);
  assert.deepEqual(ids({ ...base, plataforma: 'pc' }).slice(0, 3), ['tocar', 'baralhar', 'fila']);
});
caso('uma playlist vazia não oferece tocar', () => {
  assert.ok(!ids({ ...base, temFaixas: false }).includes('tocar'));
});
caso('dentro dela não se repetem os botões grandes, mas há o juntar', () => {
  const r = ids({ ...base, onde: 'pagina' });
  assert.ok(!r.includes('tocar'));
  assert.ok(r.includes('juntar'));
});
caso('a de outra pessoa só se partilha', () => {
  assert.deepEqual(ids({ ...base, minha: false, onde: 'pagina' }), ['partilhar', 'partilhar-link']);
  assert.deepEqual(ids({ ...base, minha: false, onde: 'pagina', plataforma: 'pc' }), ['partilhar', 'fixar']);
});
caso('fixar só no PC, e diz o estado', () => {
  assert.ok(!ids(base).includes('fixar'));
  const pc = menuDaPlaylist({ ...base, plataforma: 'pc', fixada: true });
  assert.equal(pc.find((a) => a.id === 'fixar')?.rotulo, 'Unpin from sidebar');
});
caso('apagar é o último e é destrutivo', () => {
  const r = menuDaPlaylist({ ...base, onde: 'pagina' });
  assert.equal(r.at(-1)?.id, 'apagar');
  assert.equal(r.at(-1)?.destrutiva, true);
});
caso('os nomes são os mesmos nos dois lados, menos o editar', () => {
  const ios = menuDaPlaylist({ ...base, onde: 'pagina' });
  const pc = menuDaPlaylist({ ...base, onde: 'pagina', plataforma: 'pc' });
  for (const a of pc) {
    const b = ios.find((x) => x.id === a.id);
    if (b && a.id !== 'editar') assert.equal(a.rotulo, b.rotulo, a.id);
  }
});
caso('os quatro menus usam esta decisão (nenhum escreve rótulos à mão)', () => {
  for (const f of ['src/screens/PlaylistsScreen.tsx', 'src/screens/PlaylistDetailScreen.tsx', 'src/desktop/paginas/PlaylistPages.web.tsx']) {
    const texto = readFileSync(f, 'utf8');
    assert.match(texto, /menuDaPlaylist\(/, f);
    assert.ok(!/label: 'Delete playlist'|>Delete playlist</.test(texto), `${f}: rótulo escrito à mão`);
  }
});

if (falhas) { console.log(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\n  Todos os casos passaram.');

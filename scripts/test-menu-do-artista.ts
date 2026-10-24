/**
 * Os menus novos do botão direito no PC (24/10, fase 1 de
 * docs/botao-direito-pc-maquete.html): o de um artista (src/lib/menuDoArtista.ts)
 * e o de uma mistura e das Liked Songs (src/lib/menuDaMistura.ts).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-menu-do-artista.ts
 */
import assert from 'node:assert/strict';
import { legendaDoMenuDoArtista, menuDoArtista } from '../src/lib/menuDoArtista.ts';
import { menuDaMistura, menuDasGostadas } from '../src/lib/menuDaMistura.ts';
import { menuDoLancamento } from '../src/lib/menuDoLancamento.ts';
import { MOTIVOS } from '../src/lib/menuDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\num artista');
const artista = (o: Partial<Parameters<typeof menuDoArtista>[0]> = {}) =>
  menuDoArtista({ semRede: false, tuas: 14, favorito: false, fixado: false, ...o });
caso('abrir, o Mix, baralhar as tuas, favorito e fixar, por esta ordem', () => {
  assert.deepEqual(artista().map((l) => l.id), ['abrir', 'mix', 'baralhar', 'favorito', 'fixar']);
  assert.deepEqual(artista().map((l) => l.rotulo),
    ['Open artist', 'Play Mix', 'Shuffle your songs', 'Add to favourite artists', 'Pin to sidebar']);
  assert.deepEqual(artista().filter((l) => l.inicioDeGrupo).map((l) => l.id), ['mix', 'favorito']);
});
caso('sem músicas dele na biblioteca, não há "Shuffle your songs"', () => {
  assert.ok(!artista({ tuas: 0 }).some((l) => l.id === 'baralhar'));
});
caso('o favorito e o fixar dizem o contrário quando já são', () => {
  const m = artista({ favorito: true, fixado: true });
  assert.equal(m.find((l) => l.id === 'favorito')!.rotulo, 'Remove from favourite artists');
  assert.equal(m.find((l) => l.id === 'favorito')!.icone, 'heart');
  assert.equal(m.find((l) => l.id === 'fixar')!.rotulo, 'Unpin from sidebar');
});
caso('sem rede, só tocar fica apagado (a dizer porquê)', () => {
  for (const l of artista({ semRede: true })) {
    assert.equal(l.motivo ?? null, l.id === 'mix' || l.id === 'baralhar' ? MOTIVOS.semRede : null, l.id);
  }
});
caso('a legenda conta as dele, e sem nenhuma diz só "Artist"', () => {
  assert.equal(legendaDoMenuDoArtista(14), 'Artist · 14 songs');
  assert.equal(legendaDoMenuDoArtista(1), 'Artist · 1 song');
  assert.equal(legendaDoMenuDoArtista(0), 'Artist');
});

console.log('\numa mistura e as Liked Songs');
caso('uma mistura: Play, Shuffle, Add to queue e Save as playlist', () => {
  const m = menuDaMistura({ semRede: false });
  assert.deepEqual(m.map((l) => l.rotulo), ['Play', 'Shuffle', 'Add to queue', 'Save as playlist']);
  assert.ok(m.every((l) => !l.motivo));
});
caso('com as mesmas palavras do menu de um disco', () => {
  const disco = menuDoLancamento({ tipo: 'Album' }, { semRede: false });
  for (const l of menuDaMistura({ semRede: false })) {
    assert.equal(disco.find((d) => d.id === l.id)?.rotulo, l.rotulo, l.id);
  }
});
caso('as Liked Songs só tocam e baralham', () => {
  assert.deepEqual(menuDasGostadas({ semRede: false }).map((l) => l.rotulo), ['Play', 'Shuffle']);
});
caso('sem rede, tudo apagado a dizer porquê (no PC tocar precisa dela)', () => {
  assert.ok(menuDaMistura({ semRede: true }).every((l) => l.motivo === MOTIVOS.semRede));
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

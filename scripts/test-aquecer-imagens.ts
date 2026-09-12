/**
 * O que se pede primeiro quando a app abre -- src/lib/aquecerImagens.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-aquecer-imagens.ts
 */
import assert from 'node:assert/strict';
import {
  POR_LISTA, TETO, capaDoPerfil, capasDeFaixas, capasDePlaylists, imagensAAquecer,
} from '../src/lib/aquecerImagens.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const u = (n: string) => `https://i.ytimg.com/vi/${n}/hqdefault.jpg`;

console.log('\nprimeiro a primeira de cada prateleira');
caso('alterna entre listas em vez de esvaziar a primeira', () => {
  const r = imagensAAquecer([
    [u('a1'), u('a2'), u('a3')],
    [u('b1'), u('b2'), u('b3')],
    [u('c1'), u('c2'), u('c3')],
  ]);
  assert.deepEqual(r.slice(0, 3), [u('a1'), u('b1'), u('c1')], 'a fila visivel de cada uma vem primeiro');
  assert.deepEqual(r.slice(3, 6), [u('a2'), u('b2'), u('c2')]);
});
caso('leva no maximo POR_LISTA de cada uma', () => {
  const dez = Array.from({ length: 10 }, (_, i) => u(`x${i}`));
  const r = imagensAAquecer([dez]);
  assert.equal(r.length, POR_LISTA);
});
caso('e nunca mais do que o teto, por muitas prateleiras que haja', () => {
  const listas = Array.from({ length: 20 }, (_, i) => [u(`p${i}a`), u(`p${i}b`), u(`p${i}c`)]);
  assert.equal(imagensAAquecer(listas).length, TETO);
});

console.log('\no que nao se pede');
caso('a mesma capa em duas prateleiras pede-se uma vez', () => {
  const r = imagensAAquecer([[u('igual'), u('a2')], [u('igual'), u('b2')]]);
  assert.deepEqual(r, [u('igual'), u('a2'), u('b2')]);
});
caso('vazios, nulos e coisas que nao sao endereços ficam de fora', () => {
  // Tudo isto esta DENTRO das tres primeiras posicoes, que e o que se le.
  assert.deepEqual(imagensAAquecer([['emoji:🎧:steel', 'ficheiro.jpg', u('boa')]]), [u('boa')]);
  assert.deepEqual(imagensAAquecer([[null, undefined, u('boa')]]), [u('boa')]);
  assert.deepEqual(imagensAAquecer([['', '   ', 'javascript:alert(1)']]), []);
});
caso('listas vazias nao partem nada', () => {
  assert.deepEqual(imagensAAquecer([]), []);
  assert.deepEqual(imagensAAquecer([[], []]), []);
});

console.log('\nler o que as APIs devolvem, sem confiar na forma');
caso('as capas das faixas', () => {
  assert.deepEqual(capasDeFaixas([{ artworkUrl: u('a') }, { artworkUrl: null }, {}, null]), [u('a'), null, null, null]);
  assert.deepEqual(capasDeFaixas(undefined), []);
  assert.deepEqual(capasDeFaixas('nao e uma lista' as unknown as unknown[]), []);
});
caso('a primeira capa de cada playlist', () => {
  assert.deepEqual(capasDePlaylists([{ artworks: [u('p1'), u('p2')] }, { artworks: [] }, {}]), [u('p1'), null, null]);
});
caso('o avatar so quando e mesmo uma imagem', () => {
  assert.equal(capaDoPerfil({ avatar_url: u('eu') }), u('eu'));
  // O `avatar_url` tambem guarda `emoji:<emoji>:<gradiente>`, que se desenha.
  assert.equal(capaDoPerfil({ avatar_url: 'emoji:🎧:steel' }), null);
  assert.equal(capaDoPerfil({}), null);
  assert.equal(capaDoPerfil(null), null);
});

console.log('\no tamanho do pedido');
caso('no arranque pede-se pouco: tres por lista, vinte e quatro ao todo', () => {
  assert.ok(POR_LISTA <= 4, `${POR_LISTA} por prateleira e muito para o arranque`);
  assert.ok(TETO <= 32, `${TETO} imagens de uma vez e muito para o arranque`);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

/**
 * Os atalhos fixados na lateral do PC -- src/lib/atalhosDaLateral.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-atalhos-da-lateral.ts
 */
import assert from 'node:assert/strict';
import {
  MAXIMO_DE_ATALHOS, chaveDoAtalho, estaFixado, fixar, lerAtalhos, mover, tirar, type Atalho,
} from '../src/lib/atalhosDaLateral.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const pl = (id: string): Atalho => ({ tipo: 'playlist', id, nome: `Lista ${id}` });
const faixa: Atalho = {
  tipo: 'faixa',
  faixa: { source: 'youtube', sourceId: 'abc', title: 'Nana', artist: 'Bispo', artworkUrl: null, durationSeconds: 200 },
};

console.log('\nler o que está guardado');

caso('lê os cinco tipos e deita fora o que não reconhece', () => {
  const lidos = lerAtalhos([
    pl('1'), faixa, { tipo: 'artista', nome: 'Dillaz' }, { tipo: 'amigo', id: 'u1', nome: 'juj' }, { tipo: 'mistura-do-dia' },
    { tipo: 'podcast', id: 'x' }, { tipo: 'playlist', id: '' }, null, 'lixo', { tipo: 'faixa', faixa: { source: 'vimeo', sourceId: 'x', title: 'y' } },
  ]);
  assert.deepEqual(lidos.map((a) => a.tipo), ['playlist', 'faixa', 'artista', 'amigo', 'mistura-do-dia']);
});

caso('um valor estragado dá uma lista vazia, sem rebentar', () => {
  assert.deepEqual(lerAtalhos(null), []);
  assert.deepEqual(lerAtalhos({ tipo: 'playlist' }), []);
});

caso('repetidos ficam uma vez, e nunca passa do máximo', () => {
  assert.equal(lerAtalhos([pl('1'), pl('1')]).length, 1);
  const muitos = Array.from({ length: MAXIMO_DE_ATALHOS + 5 }, (_, i) => pl(String(i)));
  assert.equal(lerAtalhos(muitos).length, MAXIMO_DE_ATALHOS);
});

caso('o mesmo artista com outra grafia de maiúsculas é o mesmo atalho', () => {
  assert.equal(chaveDoAtalho({ tipo: 'artista', nome: 'Juice WRLD' }), chaveDoAtalho({ tipo: 'artista', nome: 'juice wrld ' }));
});

console.log('\nfixar, tirar e mudar de sítio');

caso('fixar vai para o fim, e fixar outra vez não duplica', () => {
  let lista = fixar([pl('1')], pl('2')).lista;
  assert.deepEqual(lista.map(chaveDoAtalho), ['playlist:1', 'playlist:2']);
  lista = fixar(lista, pl('1')).lista;
  assert.equal(lista.length, 2);
  assert.ok(estaFixado(lista, 'playlist:2'));
});

caso('com a lista cheia não entra, e diz porquê', () => {
  const cheia = Array.from({ length: MAXIMO_DE_ATALHOS }, (_, i) => pl(String(i)));
  const r = fixar(cheia, faixa);
  assert.equal(r.cheia, true);
  assert.equal(r.lista.length, MAXIMO_DE_ATALHOS);
});

caso('tirar e mover, presos às pontas', () => {
  const lista = [pl('a'), pl('b'), pl('c')];
  assert.deepEqual(tirar(lista, 'playlist:b').map(chaveDoAtalho), ['playlist:a', 'playlist:c']);
  assert.deepEqual(mover(lista, 'playlist:c', -1).map(chaveDoAtalho), ['playlist:a', 'playlist:c', 'playlist:b']);
  assert.deepEqual(mover(lista, 'playlist:a', -1).map(chaveDoAtalho), ['playlist:a', 'playlist:b', 'playlist:c']);
  assert.deepEqual(mover(lista, 'playlist:x', 1).map(chaveDoAtalho), ['playlist:a', 'playlist:b', 'playlist:c']);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

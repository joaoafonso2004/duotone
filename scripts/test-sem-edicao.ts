// A prateleira das faixas sem edicao comercial, em Node puro.
import assert from 'node:assert/strict';
import { ID, MINIMO, misturaSemEdicao, POR_PRATELEIRA } from '../src/lib/semEdicao.ts';
import type { Track } from '../src/types.ts';

const f = (id: string, rara: boolean): Track & { rara: boolean } => ({
  source: 'youtube', sourceId: id, title: id, artist: 'A', album: null,
  artworkUrl: null, durationSeconds: null, rara,
});
const rara = (t: Track) => (t as any).rara === true;
const chave = (t: Track) => `${t.source}:${t.sourceId}`;
const muitas = (n: number, r: boolean, prefixo = 'x') =>
  Array.from({ length: n }, (_, i) => f(`${prefixo}${i}`, r));

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('so entram as que nao tem edicao', () => {
  const lib = [...muitas(MINIMO, true, 'r'), ...muitas(20, false, 'c')];
  const m = misturaSemEdicao(lib, rara, chave);
  assert.equal(m.length, 1);
  assert.equal(m[0].faixas.length, MINIMO);
  assert.ok(m[0].faixas.every(rara));
});

verificar('abaixo do minimo nao ha prateleira', () => {
  assert.deepEqual(misturaSemEdicao(muitas(MINIMO - 1, true), rara, chave), []);
});

verificar('e o minimo e BAIXO -- cinco raridades ja sao cinco raridades', () => {
  // Ao contrario dos generos e das decadas, aqui a quantidade nao e o que faz
  // a prateleira valer. Ver o cabecalho do lib/semEdicao.ts.
  assert.ok(MINIMO <= 5);
});

verificar('sem nenhuma, nao rebenta e nao inventa', () => {
  assert.deepEqual(misturaSemEdicao(muitas(30, false), rara, chave), []);
  assert.deepEqual(misturaSemEdicao([], rara, chave), []);
});

verificar('a mesma faixa duas vezes conta uma', () => {
  const lib = [...muitas(MINIMO, true), ...muitas(MINIMO, true)];
  assert.equal(misturaSemEdicao(lib, rara, chave)[0].faixas.length, MINIMO);
});

verificar('nao passa do tecto', () => {
  const m = misturaSemEdicao(muitas(POR_PRATELEIRA + 20, true), rara, chave);
  assert.equal(m[0].faixas.length, POR_PRATELEIRA);
});

verificar('as mais ouvidas vem a frente', () => {
  const lib = muitas(10, true);
  // A ultima e a mais ouvida de todas.
  const peso = (t: Track) => (t.sourceId === 'x9' ? 100 : 1);
  const m = misturaSemEdicao(lib, rara, chave, peso);
  assert.equal(m[0].faixas[0].sourceId, 'x9');
});

verificar('o id e estavel, para a navegacao o poder guardar', () => {
  assert.equal(misturaSemEdicao(muitas(MINIMO, true), rara, chave)[0].id, ID);
  assert.ok(ID.startsWith('raras:'), 'prefixo proprio, como as outras familias');
});

verificar('o nome diz o que e sem rodeios', () => {
  assert.equal(misturaSemEdicao(muitas(MINIMO, true), rara, chave)[0].nome, 'Not on Spotify');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

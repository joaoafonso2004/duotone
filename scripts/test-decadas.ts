// As misturas por decada, em Node puro.
import assert from 'node:assert/strict';
import {
  decadaDe, MINIMO_POR_DECADA, misturasPorDecada, nomeDaDecada, POR_DECADA,
} from '../src/lib/decadas.ts';
import type { Track } from '../src/types.ts';

const f = (id: string, ano: number | null): Track & { ano: number | null } => ({
  source: 'youtube', sourceId: id, title: id, artist: 'A', album: null,
  artworkUrl: null, durationSeconds: null, ano,
});
const anoDe = (t: Track) => (t as any).ano ?? null;
const chave = (t: Track) => `${t.source}:${t.sourceId}`;
/** N faixas de um ano. */
const muitas = (ano: number, n: number, prefixo = 'a') =>
  Array.from({ length: n }, (_, i) => f(`${prefixo}${ano}-${i}`, ano));

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('a decada e o ano com o ultimo digito a zero', () => {
  assert.equal(decadaDe(2019), 2010);
  assert.equal(decadaDe(2020), 2020);
  assert.equal(decadaDe(1999), 1990);
  assert.equal(nomeDaDecada(2010), '2010s mix');
});

verificar('agrupa por decada e nao por ano', () => {
  const lib = [...muitas(2021, 6), ...muitas(2027, 8, 'b')];
  const r = misturasPorDecada(lib, anoDe, chave);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, '2020s mix');
  assert.equal(r[0].faixas.length, 14);
});

verificar('uma decada com poucas faixas nao e uma era', () => {
  // Quase toda a gente tem duas musicas soltas dos anos 80.
  const lib = [...muitas(2021, MINIMO_POR_DECADA), ...muitas(1985, 2, 'b')];
  const r = misturasPorDecada(lib, anoDe, chave);
  assert.deepEqual(r.map((m) => m.nome), ['2020s mix']);
});

verificar('sem ano, a faixa nao entra -- e isso nao e um erro', () => {
  const lib = [...muitas(2021, MINIMO_POR_DECADA), f('sem-ano', null)];
  const r = misturasPorDecada(lib, anoDe, chave);
  assert.equal(r[0].faixas.length, MINIMO_POR_DECADA);
});

verificar('a decada mais OUVIDA vem a frente, e nao a mais recente', () => {
  const antigas = muitas(2011, MINIMO_POR_DECADA, 'x');
  const novas = muitas(2021, MINIMO_POR_DECADA, 'y');
  const peso = (t: Track) => (anoDe(t)! < 2020 ? 50 : 1);
  const r = misturasPorDecada([...novas, ...antigas], anoDe, chave, peso);
  assert.deepEqual(r.map((m) => m.nome), ['2010s mix', '2020s mix']);
});

verificar('sem pesos, desempata pela quantidade', () => {
  const poucas = muitas(2011, MINIMO_POR_DECADA, 'x');
  const muitasNovas = muitas(2021, MINIMO_POR_DECADA + 10, 'y');
  const r = misturasPorDecada([...poucas, ...muitasNovas], anoDe, chave);
  assert.equal(r[0].nome, '2020s mix');
});

verificar('a mesma faixa duas vezes conta uma', () => {
  const lib = [...muitas(2021, MINIMO_POR_DECADA), ...muitas(2021, MINIMO_POR_DECADA)];
  const r = misturasPorDecada(lib, anoDe, chave);
  assert.equal(r[0].faixas.length, MINIMO_POR_DECADA);
});

verificar('nao passa do tecto por mistura', () => {
  const r = misturasPorDecada(muitas(2021, POR_DECADA + 20), anoDe, chave);
  assert.equal(r[0].faixas.length, POR_DECADA);
});

verificar('nao devolve mais decadas do que o pedido', () => {
  const lib = [
    ...muitas(1991, MINIMO_POR_DECADA, 'a'),
    ...muitas(2001, MINIMO_POR_DECADA, 'b'),
    ...muitas(2011, MINIMO_POR_DECADA, 'c'),
  ];
  assert.equal(misturasPorDecada(lib, anoDe, chave, undefined, undefined, 2).length, 2);
});

verificar('o id e estavel, para a navegacao o poder guardar', () => {
  const lib = muitas(2021, MINIMO_POR_DECADA);
  assert.equal(misturasPorDecada(lib, anoDe, chave)[0].id, 'decada:2020');
});

verificar('biblioteca vazia nao rebenta', () => {
  assert.deepEqual(misturasPorDecada([], anoDe, chave), []);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

// O que os amigos mais ouvem, em Node puro.
import assert from 'node:assert/strict';
import {
  favoritasDosAmigos, quemOuve, type EscutaDeAmigo,
} from '../src/lib/favoritasDosAmigos.ts';
import type { Track } from '../src/types.ts';

const f = (id: string, count: number): Track & { count: number } => ({
  source: 'youtube', sourceId: id, title: id, artist: 'A', album: null,
  artworkUrl: null, durationSeconds: null, count,
});
const chave = (t: Track) => `${t.source}:${t.sourceId}`;
const amigo = (nome: string, faixas: (Track & { count: number })[]): EscutaDeAmigo => ({ nome, faixas });

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('tres amigos ganham a um amigo obcecado', () => {
  // A conta ingenua -- somar tudo -- poria a "so-um" a frente com 200
  // contra 6. E a prateleira passava a ser sobre um amigo, nao sobre eles.
  const r = favoritasDosAmigos([
    amigo('A', [f('so-um', 200), f('todos', 2)]),
    amigo('B', [f('todos', 2)]),
    amigo('C', [f('todos', 2)]),
  ], chave, 10);
  assert.equal(r[0].sourceId, 'todos');
  assert.equal(r[0].amigos, 3);
  assert.equal(r[1].sourceId, 'so-um');
});

verificar('com o mesmo numero de amigos, desempata o total', () => {
  const r = favoritasDosAmigos([
    amigo('A', [f('pouco', 1), f('muito', 50)]),
  ], chave, 10);
  assert.deepEqual(r.map((x) => x.sourceId), ['muito', 'pouco']);
});

verificar('um amigo conta uma vez por faixa, mesmo repetida na resposta', () => {
  const r = favoritasDosAmigos([amigo('A', [f('x', 5), f('x', 5)])], chave, 10);
  assert.equal(r[0].amigos, 1);
  assert.equal(r[0].total, 5, 'a segunda copia nao soma');
});

verificar('os nomes vem de quem mais ouve para quem menos', () => {
  const r = favoritasDosAmigos([
    amigo('Pouco', [f('x', 1)]),
    amigo('Muito', [f('x', 90)]),
    amigo('Medio', [f('x', 10)]),
  ], chave, 10);
  assert.deepEqual(r[0].nomes, ['Muito', 'Medio', 'Pouco']);
});

verificar('sem amigos nao ha prateleira', () => {
  assert.deepEqual(favoritasDosAmigos([], chave, 10), []);
  assert.deepEqual(favoritasDosAmigos([amigo('A', [])], chave, 10), []);
});

verificar('o limite corta, e um limite invalido nao rebenta', () => {
  const muitas = Array.from({ length: 40 }, (_, i) => f(`t${i}`, 40 - i));
  assert.equal(favoritasDosAmigos([amigo('A', muitas)], chave, 12).length, 12);
  assert.deepEqual(favoritasDosAmigos([amigo('A', muitas)], chave, -1), []);
});

verificar('uma contagem invalida vale um, e nao zero nem NaN', () => {
  const r = favoritasDosAmigos([
    amigo('A', [{ ...f('x', 0), count: NaN as unknown as number }]),
  ], chave, 10);
  assert.equal(r[0].total, 1);
});

verificar('a frase de quem ouve', () => {
  assert.equal(quemOuve([]), '');
  assert.equal(quemOuve(['Sampas']), 'Sampas');
  assert.equal(quemOuve(['Sampas', 'Basilio']), 'Sampas e Basilio');
  assert.equal(quemOuve(['Sampas', 'Basilio', 'Joint', 'bapcat']), 'Sampas, Basilio e mais 2');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

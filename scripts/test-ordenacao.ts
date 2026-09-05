import assert from 'node:assert/strict';
import { compararTexto, ordenarFaixas, ordenarArtistas } from '../src/lib/ordenacao.ts';

const f = (title: string, artist: string | null = null, durationSeconds: number | null = null) =>
  ({ title, artist, durationSeconds });

// --- comparar texto: era aqui que as duas plataformas divergiam ---
assert.equal(compararTexto('Ángel', 'angel'), 0, 'acentos e maiúsculas não separam');
assert.ok(compararTexto('abba', 'Beatles') < 0);

// --- faixas ---
assert.deepEqual(
  ordenarFaixas([f('Zebra'), f('ángel'), f('Beta')], 'title').map((t) => t.title),
  ['ángel', 'Beta', 'Zebra'],
);
assert.deepEqual(
  ordenarFaixas([f('B', 'Drake'), f('A', 'drake'), f('C', 'Adele')], 'artist').map((t) => t.title),
  ['C', 'A', 'B'],
  'mesmo artista com outra grafia fica junto, e desempata pelo título',
);
// Sem duração vai para o FIM: por medir não quer dizer curta.
assert.deepEqual(
  ordenarFaixas([f('longa', null, 300), f('sem', null, null), f('curta', null, 100)], 'duration').map((t) => t.title),
  ['curta', 'longa', 'sem'],
);
// Não altera a lista que recebe.
const original = [f('B'), f('A')];
ordenarFaixas(original, 'title');
assert.equal(original[0]!.title, 'B', 'ordenar não mexe na lista de origem');

// --- artistas ---
const g = (nome: string, chave: string, n: number) => ({ nome, chave, faixas: new Array(n).fill(0) });
const grupos = [g('Pequeno', 'pequeno', 1), g('Grande', 'grande', 50), g('Ouvido', 'ouvido', 2)];

// Sem histórico manda o peso na biblioteca.
assert.deepEqual(ordenarArtistas(grupos).map((x) => x.nome), ['Grande', 'Ouvido', 'Pequeno']);

// Com histórico, quem se ouve vem à frente mesmo com menos faixas.
const ranking = new Map([['ouvido', 0]]);
assert.deepEqual(ordenarArtistas(grupos, ranking).map((x) => x.nome), ['Ouvido', 'Grande', 'Pequeno']);

// Empate a tudo desempata pelo nome, sem acentos a atrapalhar.
assert.deepEqual(
  ordenarArtistas([g('Ómega', 'omega', 1), g('alfa', 'alfa', 1)]).map((x) => x.nome),
  ['alfa', 'Ómega'],
);

console.log('Ordenação: mesma regra de texto, faixas e artistas nas duas plataformas.');

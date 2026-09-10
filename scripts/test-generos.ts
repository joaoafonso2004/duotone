// As misturas por genero, em Node puro.
import assert from 'node:assert/strict';
import {
  chaveDoGenero, GENEROS, MINIMO_POR_GENERO, misturasPorGenero, nomeDoGenero, POR_GENERO,
} from '../src/lib/generos.ts';
import type { Track } from '../src/types.ts';

const f = (id: string, genero: string | null): Track & { genero: string | null } => ({
  source: 'youtube', sourceId: id, title: id, artist: 'A', album: null,
  artworkUrl: null, durationSeconds: null, genero,
});
const generoDe = (t: Track) => (t as any).genero ?? null;
const chave = (t: Track) => `${t.source}:${t.sourceId}`;
const muitas = (genero: string, n: number, prefixo = 'a') =>
  Array.from({ length: n }, (_, i) => f(`${prefixo}-${i}`, genero));

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('o nome mostrado e o genero mais "mix"', () => {
  assert.equal(nomeDoGenero('Rap/Hip Hop'), 'Rap/Hip Hop mix');
});

verificar('a mesma etiqueta escrita de outra maneira e a mesma gaveta', () => {
  // "Rap/Hip Hop" e "rap/hip hop" chegam os dois, conforme o album. Ve-los
  // como dois partia a prateleira ao meio.
  assert.equal(chaveDoGenero('Rap/Hip Hop'), chaveDoGenero('  rap/hip hop '));
  const lib = [
    ...muitas('Rap/Hip Hop', MINIMO_POR_GENERO, 'x'),
    ...muitas('rap/hip hop', 5, 'y'),
  ];
  const r = misturasPorGenero(lib, generoDe, chave);
  assert.equal(r.length, 1);
  assert.equal(r[0].faixas.length, MINIMO_POR_GENERO + 5);
});

verificar('o nome vem como se viu primeiro, nao em minusculas', () => {
  const lib = muitas('Rap/Hip Hop', MINIMO_POR_GENERO);
  assert.equal(misturasPorGenero(lib, generoDe, chave)[0].nome, 'Rap/Hip Hop mix');
});

verificar('tres faixas de jazz nao fazem de ninguem ouvinte de jazz', () => {
  const lib = [...muitas('Rap/Hip Hop', MINIMO_POR_GENERO), ...muitas('Jazz', 3, 'j')];
  assert.deepEqual(misturasPorGenero(lib, generoDe, chave).map((m) => m.nome), ['Rap/Hip Hop mix']);
});

verificar('sem genero a faixa nao entra -- e isso nao e um erro', () => {
  const lib = [...muitas('Rock', MINIMO_POR_GENERO), f('sem', null), f('vazio', '   ')];
  assert.equal(misturasPorGenero(lib, generoDe, chave)[0].faixas.length, MINIMO_POR_GENERO);
});

verificar('o genero mais OUVIDO vem a frente, e nao o que tem mais musica', () => {
  const muitoRock = muitas('Rock', MINIMO_POR_GENERO + 20, 'r');
  const poucoRap = muitas('Rap', MINIMO_POR_GENERO, 'p');
  const peso = (t: Track) => (generoDe(t) === 'Rap' ? 40 : 1);
  const r = misturasPorGenero([...muitoRock, ...poucoRap], generoDe, chave, peso);
  assert.deepEqual(r.map((m) => m.nome), ['Rap mix', 'Rock mix']);
});

verificar('sem pesos, desempata pela quantidade', () => {
  const lib = [...muitas('Rock', MINIMO_POR_GENERO + 9, 'r'), ...muitas('Rap', MINIMO_POR_GENERO, 'p')];
  assert.equal(misturasPorGenero(lib, generoDe, chave)[0].nome, 'Rock mix');
});

verificar('a mesma faixa duas vezes conta uma', () => {
  const lib = [...muitas('Rock', MINIMO_POR_GENERO), ...muitas('Rock', MINIMO_POR_GENERO)];
  assert.equal(misturasPorGenero(lib, generoDe, chave)[0].faixas.length, MINIMO_POR_GENERO);
});

verificar('nao passa do tecto por mistura', () => {
  const r = misturasPorGenero(muitas('Rock', POR_GENERO + 20), generoDe, chave);
  assert.equal(r[0].faixas.length, POR_GENERO);
});

verificar('nao devolve mais generos do que o pedido', () => {
  const lib = [
    ...muitas('Rock', MINIMO_POR_GENERO, 'a'),
    ...muitas('Rap', MINIMO_POR_GENERO, 'b'),
    ...muitas('Pop', MINIMO_POR_GENERO, 'c'),
    ...muitas('Jazz', MINIMO_POR_GENERO, 'd'),
  ];
  assert.equal(misturasPorGenero(lib, generoDe, chave).length, GENEROS);
  assert.equal(misturasPorGenero(lib, generoDe, chave, undefined, undefined, 2).length, 2);
});

verificar('o id e estavel, para a navegacao o poder guardar', () => {
  const lib = muitas('Rap/Hip Hop', MINIMO_POR_GENERO);
  assert.equal(misturasPorGenero(lib, generoDe, chave)[0].id, 'genero:rap/hip hop');
});

verificar('biblioteca vazia nao rebenta', () => {
  assert.deepEqual(misturasPorGenero([], generoDe, chave), []);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

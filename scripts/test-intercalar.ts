// Uma faixa de cada artista antes da segunda de qualquer um.
//
// O que interessa provar é que isto REORDENA e não corta: numa prateleira que
// promete "o que mais ouves", deitar fora a quarta mais ouvida seria mentir.
import assert from 'node:assert/strict';
import { intercalarPorArtista } from '../src/lib/intercalarPorArtista.ts';
import type { Track } from '../src/types.ts';

/** `id` diz quem canta; o número distingue as faixas dele. */
const f = (id: string, artista: string): Track => ({ source: 'youtube', sourceId: id,
  title: id, artist: artista, album: null, artworkUrl: null, durationSeconds: null });
const porArtista = (t: Track) => (t.artist ?? '').toLowerCase();
const ids = (t: Track[]) => t.map((x) => x.sourceId);

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('o caso que existe para apanhar', () => {
  // Três seguidas do mesmo artista, que é o que a base de dados devolve a
  // quem ouve muito duas pessoas.
  const entrada = [f('a1', 'A'), f('a2', 'A'), f('a3', 'A'), f('b1', 'B'), f('b2', 'B')];
  assert.deepEqual(ids(intercalarPorArtista(entrada, porArtista)),
    ['a1', 'b1', 'a2', 'b2', 'a3']);
});

verificar('não perde nem duplica nada', () => {
  const entrada = [f('a1', 'A'), f('a2', 'A'), f('b1', 'B'), f('c1', 'C'), f('a3', 'A')];
  const saida = intercalarPorArtista(entrada, porArtista);
  assert.equal(saida.length, entrada.length);
  assert.deepEqual([...ids(saida)].sort(), [...ids(entrada)].sort());
});

verificar('a ordem dentro do mesmo artista fica intacta', () => {
  // A mais ouvida dele continua a ser a primeira dele. Sem isto, "heavy
  // rotation" deixava de estar por ordem de audição.
  const entrada = [f('a1', 'A'), f('a2', 'A'), f('a3', 'A'), f('b1', 'B')];
  const saida = ids(intercalarPorArtista(entrada, porArtista));
  assert.ok(saida.indexOf('a1') < saida.indexOf('a2'), 'a1 antes de a2');
  assert.ok(saida.indexOf('a2') < saida.indexOf('a3'), 'a2 antes de a3');
});

verificar('quem estava no topo continua no topo', () => {
  const entrada = [f('b1', 'B'), f('a1', 'A'), f('b2', 'B')];
  assert.deepEqual(ids(intercalarPorArtista(entrada, porArtista))[0], 'b1');
});

verificar('um artista só fica exactamente como estava', () => {
  const entrada = [f('a1', 'A'), f('a2', 'A'), f('a3', 'A')];
  assert.deepEqual(ids(intercalarPorArtista(entrada, porArtista)), ['a1', 'a2', 'a3']);
});

verificar('listas curtas não se mexem', () => {
  const entrada = [f('a1', 'A'), f('a2', 'A')];
  assert.deepEqual(ids(intercalarPorArtista(entrada, porArtista)), ['a1', 'a2']);
  assert.deepEqual(intercalarPorArtista([], porArtista), []);
});

verificar('sem artista, todas contam como o mesmo e nada se mexe', () => {
  const entrada = [f('x1', ''), f('x2', ''), f('x3', '')];
  assert.deepEqual(ids(intercalarPorArtista(entrada, porArtista)), ['x1', 'x2', 'x3']);
});

verificar('nunca duas seguidas do mesmo enquanto houver alternativa', () => {
  const entrada = [
    f('a1', 'A'), f('a2', 'A'), f('a3', 'A'), f('a4', 'A'),
    f('b1', 'B'), f('b2', 'B'), f('c1', 'C'), f('c2', 'C'),
  ];
  const saida = intercalarPorArtista(entrada, porArtista);
  // Enquanto sobrar mais de um artista por servir, não pode haver vizinhas do
  // mesmo. No fim, quando só sobra o A, é inevitável e está certo.
  const nomes = saida.map(porArtista);
  const primeirasSeis = nomes.slice(0, 6);
  for (let i = 1; i < primeirasSeis.length; i++) {
    assert.notEqual(primeirasSeis[i], primeirasSeis[i - 1],
      `duas do mesmo artista seguidas na posição ${i}: ${primeirasSeis.join(',')}`);
  }
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nIntercalar: a prateleira deixa de parecer um álbum.');

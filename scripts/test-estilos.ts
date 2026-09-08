// Os estilos, descobertos pela vizinhanca do catalogo, em Node puro.
import assert from 'node:assert/strict';
import {
  agruparPorEstilo, MINIMO_DE_ARTISTAS, nomeDoEstilo, semelhanca, sobreposicao,
} from '../src/lib/estilos.ts';

const chaveN = (n: string) => n.toLowerCase();

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

/** Um mapa de vizinhos, em chaves ja canonicas. */
const vizinhanca = (mapa: Record<string, string[]>) =>
  (chave: string) => mapa[chave] ?? [];

verificar('dois conjuntos vazios nao sao iguais, sao desconhecidos', () => {
  assert.equal(sobreposicao(new Set(), new Set()), 0);
});

verificar('a sobreposicao e a de Jaccard', () => {
  // {a,b,c} e {b,c,d}: dois comuns em quatro distintos.
  assert.equal(sobreposicao(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd'])), 0.5);
});

verificar('estar na lista do outro vale mais do que a sobreposicao', () => {
  const a = { chave: 'a', vizinhos: new Set(['x']) };
  const b = { chave: 'b', vizinhos: new Set(['a', 'y']) };
  // Sobreposicao zero, mas o 'a' esta nos vizinhos do 'b'.
  assert.ok(semelhanca(a, b) >= 0.25);
});

verificar('dois mundos separados dao dois grupos', () => {
  const vizinhos = vizinhanca({
    isak: ['w1', 'w2', 'w3'],
    joint: ['w1', 'w2', 'w4'],
    carti: ['z1', 'z2', 'z3'],
    hollis: ['z1', 'z2', 'z4'],
  });
  const r = agruparPorEstilo(
    [
      { nome: 'Isak', escutas: 100 }, { nome: 'Joint', escutas: 80 },
      { nome: 'Carti', escutas: 60 }, { nome: 'Hollis', escutas: 40 },
    ],
    vizinhos, chaveN,
  );
  assert.equal(r.length, 2);
  // O grupo mais ouvido vem a frente, e da o nome ao proprio grupo.
  assert.equal(r[0].nome, 'Isak & Joint');
  assert.equal(r[1].nome, 'Carti & Hollis');
});

verificar('quem o catalogo nao conhece fica de fora', () => {
  const r = agruparPorEstilo(
    [{ nome: 'A', escutas: 10 }, { nome: 'B', escutas: 10 }, { nome: 'Ninguem', escutas: 999 }],
    vizinhanca({ a: ['x', 'y'], b: ['x', 'y'] }), chaveN,
  );
  assert.equal(r.length, 1);
  assert.ok(!r[0].nomes.includes('Ninguem'));
});

verificar('um artista sozinho nao e um estilo', () => {
  const r = agruparPorEstilo(
    [{ nome: 'A', escutas: 10 }, { nome: 'B', escutas: 10 }],
    // Sem nada em comum: ficam dois grupos de um, e nenhum passa o minimo.
    vizinhanca({ a: ['x'], b: ['y'] }), chaveN,
  );
  assert.equal(r.length, 0);
  assert.equal(MINIMO_DE_ARTISTAS, 2);
});

verificar('o peso e a raiz, para o mais ouvido nao levar tudo', () => {
  // Um grupo com um artista de 10.000 escutas contra um de dois com 2.500
  // cada: em bruto ganhava o primeiro (10.000 > 5.000); pela raiz perde
  // (100 < 100+... ), que e o que impede um so artista de dominar a pagina.
  const r = agruparPorEstilo(
    [
      { nome: 'Gigante', escutas: 10000 }, { nome: 'Amigo', escutas: 1 },
      { nome: 'M1', escutas: 2500 }, { nome: 'M2', escutas: 2500 },
    ],
    vizinhanca({
      gigante: ['g1', 'g2'], amigo: ['g1', 'g2'],
      m1: ['n1', 'n2'], m2: ['n1', 'n2'],
    }),
    chaveN,
  );
  assert.equal(r.length, 2);
  // 100 + 1 = 101 contra 50 + 50 = 100: por pouco, e e esse o ponto -- em
  // bruto a diferenca era de 10.001 contra 5.000.
  assert.equal(r[0].nomes[0], 'Gigante');
  assert.ok(r[0].peso - r[1].peso < 5);
});

verificar('nao devolve mais grupos do que o maximo', () => {
  const mapa: Record<string, string[]> = {};
  const artistas: { nome: string; escutas: number }[] = [];
  // Dez pares, cada um no seu mundo: dariam dez grupos sem o tecto.
  for (let i = 0; i < 10; i++) {
    mapa[`a${i}`] = [`w${i}`, `v${i}`];
    mapa[`b${i}`] = [`w${i}`, `v${i}`];
    artistas.push({ nome: `A${i}`, escutas: 10 }, { nome: `B${i}`, escutas: 10 });
  }
  const r = agruparPorEstilo(artistas, vizinhanca(mapa), chaveN, { maximo: 3 });
  assert.equal(r.length, 3);
});

verificar('o mesmo grupo da sempre o mesmo id', () => {
  const vizinhos = vizinhanca({ isak: ['w1', 'w2'], joint: ['w1', 'w2'] });
  const um = agruparPorEstilo([{ nome: 'Isak', escutas: 9 }, { nome: 'Joint', escutas: 4 }], vizinhos, chaveN);
  // A ordem da entrada muda; o id nao, porque sai do membro mais ouvido.
  const dois = agruparPorEstilo([{ nome: 'Joint', escutas: 4 }, { nome: 'Isak', escutas: 9 }], vizinhos, chaveN);
  assert.equal(um[0].id, dois[0].id);
  assert.equal(um[0].id, 'estilo:isak');
});

verificar('o nome fala dos dois primeiros', () => {
  assert.equal(nomeDoEstilo(['A', 'B', 'C']), 'A & B');
  assert.equal(nomeDoEstilo(['A']), 'Like A');
  assert.equal(nomeDoEstilo([]), 'Your mix');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

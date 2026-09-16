/**
 * A escolha do Smart Shuffle -- src/lib/escolhaDaSugestao.ts.
 *
 * node --experimental-strip-types scripts/test-escolha-da-sugestao.ts
 */
import assert from 'node:assert/strict';
import {
  confiante, intervaloDosPontos, ordenarParaInserir, POSICAO_MAXIMA_NO_CATALOGO,
  type Proveniencia,
} from '../src/lib/escolhaDaSugestao.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.log(`  FALHA - ${nome}\n    ${(e as Error).message}`); }
}

const p = (over: Partial<Proveniencia>): Proveniencia => ({
  ancora: 'a', propria: false, posicaoNoCatalogo: 1, pontos: 1, ronda: 0, ...over,
});
const ordenar = (lista: [string, Proveniencia | undefined][], contexto: string[] = []) => {
  const mapa = new Map(lista);
  return ordenarParaInserir(lista.map(([id]) => id), (id) => mapa.get(id), contexto);
};

verificar('o mínimo: a própria âncora ou até ao 10.º semelhante', () => {
  assert.equal(confiante(p({ posicaoNoCatalogo: POSICAO_MAXIMA_NO_CATALOGO })), true);
  assert.equal(confiante(p({ posicaoNoCatalogo: POSICAO_MAXIMA_NO_CATALOGO + 1 })), false);
  assert.equal(confiante(p({ propria: true, posicaoNoCatalogo: 30 })), true);
  assert.equal(confiante(undefined), false, 'sem proveniência não se confia');
});

verificar('sem nenhuma de confiança, não entra nada', () => {
  assert.deepEqual(ordenar([['x', p({ posicaoNoCatalogo: 15, pontos: 2 })], ['y', undefined]]), []);
});

verificar('a âncora da música que toca vem primeiro', () => {
  const r = ordenar([
    ['de-b', p({ ancora: 'b', pontos: 2 })],
    ['de-a', p({ ancora: 'a', pontos: 0.5 })],
  ], ['a', 'b']);
  assert.deepEqual(r, ['de-a', 'de-b']);
});

verificar('as âncoras alternam', () => {
  const r = ordenar([
    ['a1', p({ ancora: 'a', ronda: 0 })],
    ['a2', p({ ancora: 'a', ronda: 1 })],
    ['a3', p({ ancora: 'a', ronda: 2 })],
    ['b1', p({ ancora: 'b', ronda: 0 })],
  ]);
  assert.deepEqual(r, ['a1', 'b1', 'a2', 'a3']);
});

verificar('dentro da âncora: uma por artista antes da segunda, o de mais pontos primeiro', () => {
  const r = ordenar([
    ['melhor-2', p({ pontos: 2, ronda: 1 })],
    ['fraco-1', p({ pontos: 1, ronda: 0 })],
    ['melhor-1', p({ pontos: 2, ronda: 0 })],
  ]);
  assert.deepEqual(r, ['melhor-1', 'fraco-1', 'melhor-2']);
});

verificar('as de baixa confiança saem sem baralhar as outras', () => {
  const r = ordenar([
    ['longe', p({ posicaoNoCatalogo: 20, pontos: 2 })],
    ['perto', p({ posicaoNoCatalogo: 2 })],
  ]);
  assert.deepEqual(r, ['perto']);
});

verificar('pontos em intervalos para a analítica', () => {
  assert.equal(intervaloDosPontos(0.4), 'baixo');
  assert.equal(intervaloDosPontos(1.2), 'medio');
  assert.equal(intervaloDosPontos(1.8), 'alto');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

// Os artistas do primeiro dia, em Node puro.
import assert from 'node:assert/strict';
import {
  artistasParaRecomendar, HISTORICO_QUE_CHEGA, jaChegam, PESO_DA_SEMENTE,
} from '../src/lib/artistasSemente.ts';

const chave = (n: string) => n.trim().toLowerCase();
const h = (nome: string, plays: number) => ({ name: nome, plays });

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('conta nova: as sementes sao tudo o que ha', () => {
  const r = artistasParaRecomendar([], ['Isak', 'Carti', '2hollis'], chave);
  assert.deepEqual(r.map((a) => a.name), ['Isak', 'Carti', '2hollis']);
  assert.equal(r[0].plays, PESO_DA_SEMENTE);
});

verificar('o historico vem sempre a frente das sementes', () => {
  const r = artistasParaRecomendar([h('Ouvido', 40)], ['Semente'], chave);
  assert.deepEqual(r.map((a) => a.name), ['Ouvido', 'Semente']);
});

verificar('com historico que chegue, as sementes saem de cena', () => {
  const historico = Array.from({ length: HISTORICO_QUE_CHEGA }, (_, i) => h(`A${i}`, 10));
  const r = artistasParaRecomendar(historico, ['Semente'], chave);
  assert.equal(r.length, HISTORICO_QUE_CHEGA);
  assert.ok(!r.some((a) => a.name === 'Semente'), 'ninguem fica preso ao primeiro dia');
});

verificar('as sementes so completam ate ao minimo, nao empurram mais', () => {
  const r = artistasParaRecomendar([h('A', 5)], ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'], chave);
  assert.equal(r.length, HISTORICO_QUE_CHEGA);
});

verificar('uma semente que passou a ser ouvida nao entra duas vezes', () => {
  // Escrito de outra maneira, de proposito: a chave e que decide.
  const r = artistasParaRecomendar([h('isak', 30)], ['Isak', 'Outro'], chave);
  assert.deepEqual(r.map((a) => a.name), ['isak', 'Outro']);
  assert.equal(r[0].plays, 30, 'fica a linha com o peso verdadeiro');
});

verificar('uma semente vale UM e nao zero', () => {
  // O peso e a raiz da contagem em toda a app, e a raiz de zero e zero: uma
  // semente a zero era o mesmo que nao existir.
  assert.ok(PESO_DA_SEMENTE >= 1);
  const r = artistasParaRecomendar([], ['S'], chave);
  assert.ok(Math.sqrt(r[0].plays) > 0);
});

verificar('nomes vazios nao entram', () => {
  const r = artistasParaRecomendar([], ['', '   ', 'Bom'], chave);
  assert.deepEqual(r.map((a) => a.name), ['Bom']);
});

verificar('sem sementes nem historico devolve vazio, e nao rebenta', () => {
  assert.deepEqual(artistasParaRecomendar([], [], chave), []);
});

verificar('tres e o que chega para avancar', () => {
  assert.equal(jaChegam(['a', 'b']), false);
  assert.equal(jaChegam(['a', 'b', 'c']), true);
  assert.equal(jaChegam(['a', 'b', 'c', 'd']), true);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

// A mesma música só aparece numa prateleira.
//
// O que interessa provar é a INDEPENDÊNCIA DA ORDEM DE CHEGADA: as prateleiras
// aterram fora de ordem, e a página não pode mudar consoante a rede do dia.
import assert from 'node:assert/strict';
import { semRepetidas } from '../src/lib/prateleirasSemRepetidas.ts';
import type { Track } from '../src/types.ts';

/** A mesma identidade que o `trackKey` da app: origem mais id. */
const chave = (t: Track) => `${t.source}:${t.sourceId}`;

const f = (id: string): Track => ({ source: 'youtube', sourceId: id, title: id,
  artist: null, album: null, artworkUrl: null, durationSeconds: null });

const ORDEM = ['descobrir', 'nuncaLancado', 'ouvirDeNovo', 'flow', 'maisTocadas', 'esquecidas'] as const;
const ids = (t: Track[]) => t.map((x) => x.sourceId);

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('a faixa fica na prateleira mais acima', () => {
  const r = semRepetidas({
    descobrir: [f('a'), f('b')],
    flow: [f('b'), f('c')],
    maisTocadas: [f('a'), f('c'), f('d')],
  }, ORDEM, chave);
  assert.deepEqual(ids(r.descobrir), ['a', 'b']);
  assert.deepEqual(ids(r.flow), ['c'], 'o b já estava na descoberta');
  assert.deepEqual(ids(r.maisTocadas), ['d'], 'o a e o c também já saíram');
});

verificar('repetidas dentro da MESMA prateleira também caem', () => {
  const r = semRepetidas({ descobrir: [f('a'), f('a'), f('b')] }, ORDEM, chave);
  assert.deepEqual(ids(r.descobrir), ['a', 'b']);
});

verificar('quem chega primeiro não ganha nada', () => {
  // É este o teste que existe para apanhar um dedupe feito à chegada. As
  // prateleiras publicam-se fora de ordem -- a descoberta é sempre a última,
  // porque fala com o YouTube -- e um dedupe por chegada dava-lhe sempre a
  // sobra. Os dois objectos abaixo têm as chaves por ordem diferente.
  const cedo = semRepetidas({
    maisTocadas: [f('x')], flow: [f('x')], descobrir: [f('x')],
  }, ORDEM, chave);
  const tarde = semRepetidas({
    descobrir: [f('x')], flow: [f('x')], maisTocadas: [f('x')],
  }, ORDEM, chave);
  assert.deepEqual(ids(cedo.descobrir), ['x'], 'a descoberta fica com ela');
  assert.deepEqual(cedo.flow, []);
  assert.deepEqual(cedo.maisTocadas, []);
  assert.deepEqual(ids(cedo.descobrir), ids(tarde.descobrir), 'o resultado não muda com a ordem de chegada');
});

verificar('uma prateleira que ainda não aterrou não estraga as outras', () => {
  const r = semRepetidas({ flow: [f('a')] }, ORDEM, chave);
  assert.deepEqual(ids(r.flow), ['a']);
  assert.deepEqual(r.descobrir, [], 'ausente sai como vazia, não como undefined');
  for (const nome of ORDEM) assert.ok(Array.isArray(r[nome]), `${nome} é sempre um array`);
});

verificar('faixas iguais de fontes diferentes são faixas diferentes', () => {
  const yt = f('a');
  const sp: Track = { ...yt, source: 'spotify' };
  const r = semRepetidas({ descobrir: [yt], flow: [sp] }, ORDEM, chave);
  assert.deepEqual(ids(r.flow), ['a'], 'a chave inclui a origem');
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nPrateleiras: cada música num sítio só, e o mesmo sítio sempre.');

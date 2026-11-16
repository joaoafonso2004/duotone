/**
 * O AsyncStorage do iPhone por cima do MMKV (16/11, lib/armazenamento.ts): nada
 * do que estava no aparelho se perde (senão eram pedidos a mais ao Supabase no
 * dia da atualização), apagar apaga dos dois, os grandes ficam no antigo, e sem
 * o módulo nativo é o de sempre. E o desvio do Metro, lido como texto.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-armazenamento.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarArmazem, GRANDE, type CofreLento, type CofreRapido } from '../src/lib/armazenamento.ts';

let falhas = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

function rapido(): CofreRapido & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    getString: (k) => m.get(k),
    set: (k, v) => { m.set(k, v); },
    remove: (k) => m.delete(k),
    getAllKeys: () => [...m.keys()],
    clearAll: () => m.clear(),
  };
}
function lento(inicial: Record<string, string> = {}): CofreLento & { m: Map<string, string>; leituras: number } {
  const m = new Map(Object.entries(inicial));
  const c = {
    m, leituras: 0,
    getItem: async (k: string) => { c.leituras++; return m.get(k) ?? null; },
    setItem: async (k: string, v: string) => { m.set(k, v); },
    removeItem: async (k: string) => { m.delete(k); },
    getAllKeys: async () => [...m.keys()],
    clear: async () => { m.clear(); },
  };
  return c;
}

await caso('o que estava no AsyncStorage lê-se e passa para o MMKV, uma vez', async () => {
  const r = rapido(), l = lento({ 'duotone:track-catalog:v1': '{"a":1}' });
  const a = criarArmazem(r, l);
  assert.equal(await a.getItem('duotone:track-catalog:v1'), '{"a":1}');
  assert.equal(r.m.get('duotone:track-catalog:v1'), '{"a":1}', 'copiado');
  const antes = l.leituras;
  assert.equal(await a.getItem('duotone:track-catalog:v1'), '{"a":1}');
  assert.equal(l.leituras, antes, 'a segunda vez já não vai ao antigo');
});

await caso('escrever vai para o MMKV; apagar apaga dos dois (senão o antigo voltava)', async () => {
  const r = rapido(), l = lento({ x: 'velho' });
  const a = criarArmazem(r, l);
  await a.setItem('x', 'novo');
  assert.equal(await a.getItem('x'), 'novo');
  await a.removeItem('x');
  assert.equal(await a.getItem('x'), null);
  assert.ok(!l.m.has('x') && !r.m.has('x'));
});

await caso('os valores grandes ficam no AsyncStorage, e não ficam no MMKV', async () => {
  const r = rapido(), l = lento();
  const a = criarArmazem(r, l);
  const grande = 'x'.repeat(GRANDE + 1);
  await a.setItem('biblioteca', 'pequeno');
  await a.setItem('biblioteca', grande);
  assert.ok(!r.m.has('biblioteca'), 'o pequeno de antes saiu do MMKV');
  assert.equal(await a.getItem('biblioteca'), grande);
  assert.ok(!r.m.has('biblioteca'), 'e não se copia ao ler');
});

await caso('as várias de uma vez, e as chaves dos dois', async () => {
  const r = rapido(), l = lento({ a: '1' });
  const s = criarArmazem(r, l);
  await s.multiSet([['b', '2'], ['c', '3']]);
  assert.deepEqual(await s.multiGet(['a', 'b', 'z']), [['a', '1'], ['b', '2'], ['z', null]]);
  assert.deepEqual((await s.getAllKeys()).sort(), ['a', 'b', 'c']);
  await s.multiRemove(['a', 'b']);
  assert.deepEqual((await s.getAllKeys()).sort(), ['c']);
});

await caso('sem o módulo nativo, é o AsyncStorage de sempre', async () => {
  const l = lento({ k: 'v' });
  const a = criarArmazem(null, l);
  assert.equal(await a.getItem('k'), 'v');
  await a.setItem('k2', 'v2');
  assert.equal(l.m.get('k2'), 'v2');
});

await caso('o Metro desvia o AsyncStorage do código da app no iPhone, e só ele', () => {
  const metro = readFileSync(new URL('../metro.config.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(metro, /const ARMAZEM = path\.join\(__dirname, 'src', 'lib', 'armazenamento\.ts'\);/);
  assert.match(metro, /moduleName === '@react-native-async-storage\/async-storage' && platform === 'ios'/);
  assert.match(metro, /&& origem !== ARMAZEM/, 'o próprio armazém usa o verdadeiro');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-armazenamento: tudo certo');

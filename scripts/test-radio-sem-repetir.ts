/**
 * O Radio nunca devolve a mesma fila (16/11, lib/radioSemRepetir.ts): a memória
 * dos últimos lotes por semente, o que vai para o fim, e a garantia de que um
 * lote quase igual sai noutra ordem. E a ligação no `startRadio`, lida como texto.
 *
 * Correr: node --experimental-strip-types scripts/test-radio-sem-repetir.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aEvitar, lembrarLote, lerMemoriaDoRadio, LOTES_POR_SEMENTE, naoRepetir, SEMENTES_LEMBRADAS, sobreposicao, ultimoLote, VALE_MS,
} from '../src/lib/radioSemRepetir.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

caso('lembra os três últimos lotes de cada semente, e o último pela ordem', () => {
  let m = {};
  for (let i = 0; i < 5; i++) m = lembrarLote(m, 'youtube:x', [`y:${i}a`, `y:${i}b`], [`id:${i}`], 1000 + i);
  assert.equal((m as any)['youtube:x'].length, LOTES_POR_SEMENTE);
  assert.deepEqual(ultimoLote(m, 'youtube:x'), ['y:4a', 'y:4b']);
  const fora = aEvitar(m, 'youtube:x', 2000);
  assert.ok(fora.has('y:2a') && fora.has('id:4') && !fora.has('y:1a'), 'os três últimos, com as identidades');
  assert.equal(aEvitar(m, 'outra').size, 0);
});

caso('passada uma semana, esquece; e não guarda mais do que as sementes do teto', () => {
  const m = lembrarLote({}, 's', ['a'], [], 0);
  assert.equal(aEvitar(m, 's', VALE_MS + 1).size, 0);
  assert.deepEqual(lerMemoriaDoRadio(m, VALE_MS + 1), {});
  let muitas = {};
  for (let i = 0; i < SEMENTES_LEMBRADAS + 10; i++) muitas = lembrarLote(muitas, `s${i}`, ['a'], [], i);
  assert.equal(Object.keys(muitas).length, SEMENTES_LEMBRADAS);
  assert.ok(!('s0' in muitas) && `s${SEMENTES_LEMBRADAS + 9}` in muitas, 'saem as usadas há mais tempo');
});

caso('o que vem do disco estragado é uma memória vazia, e o bom fica', () => {
  assert.deepEqual(lerMemoriaDoRadio(null), {});
  assert.deepEqual(lerMemoriaDoRadio('lixo'), {});
  assert.deepEqual(lerMemoriaDoRadio({ s: [{ em: 'x', faixas: [1, 2] }] }, 10), {});
  assert.deepEqual(lerMemoriaDoRadio({ s: [{ em: 5, faixas: ['a'], identidades: ['i'] }] }, 10), { s: [{ em: 5, faixas: ['a'], identidades: ['i'] }] });
});

caso('um lote quase igual ao anterior sai noutra ordem; um diferente fica como veio', () => {
  const lote = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const id = (s: string) => s;
  let semente = 1;
  const aleatorio = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  const novo = naoRepetir(lote, lote, id, aleatorio);
  assert.notDeepEqual(novo, lote, 'a mesma fila nunca');
  assert.deepEqual([...novo].sort(), [...lote].sort(), 'as mesmas músicas, outra ordem');
  const outro = ['a', 'b', 'x', 'y', 'z', 'w', 'v', 'u'];
  assert.deepEqual(naoRepetir(outro, lote, id, aleatorio), outro, 'com outras, não se mexe');
  assert.deepEqual(naoRepetir(lote, lote, id, () => 0.999999), [...lote.slice(1), lote[0]], 'nem um aleatório teimoso a deixa igual');
  assert.equal(sobreposicao(['a', 'b'], ['b', 'c']), 0.5);
});

caso('o startRadio usa a memória da semente nas três tentativas e grava o lote', () => {
  const p = ler('src/state/player.ts');
  const inicio = p.indexOf('startRadio: async');
  const radio = p.slice(inicio, p.indexOf('stopRadio: () =>', inicio));
  assert.match(radio, /const semente = tipo === 'mix' \? 'mix' : trackKey\(current\);/);
  assert.match(radio, /const comMemoria = new Set\(\[\.\.\.discovered, \.\.\.evitar\]\);/);
  assert.match(radio, /tentativa\.semMemoria \? evitar : comMemoria/, 'mesmo "sem memória", a desta semente fica');
  assert.match(radio, /loteDaMix\(12, excluir, comMemoria, ouvidas\)/);
  assert.match(radio, /naoRepetir\(comNovo\.lote, ultimoLote\(memoria, semente\), trackKey\)/);
  assert.match(radio, /lembrarLoteDoRadio\(semente, tracks\);/);
  assert.match(p, /const CHAVE_DA_MEMORIA_DO_RADIO = 'duotone:radio-lotes:v1';/);
  // Só no aparelho: nenhum pedido ao Supabase por causa disto.
  const bloco = p.slice(p.indexOf('const CHAVE_DA_MEMORIA_DO_RADIO'), p.indexOf('async function chavesDasDescobertasRecentes'));
  assert.doesNotMatch(bloco, /supabase/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-radio-sem-repetir: tudo certo');

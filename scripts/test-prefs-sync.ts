import assert from 'node:assert/strict';
import { chavesAEscrever } from '../src/lib/prefsFusao.ts';

const fora = new Set(['pref:searchHistory']);

// O caso que isto existe para resolver: o aparelho foi limpo e não tem nada.
assert.deepEqual(
  chavesAEscrever({}, { 'pref:audioQuality': 'high', 'pref:glitchMode': 'reactive' }, fora),
  [['pref:audioQuality', 'high'], ['pref:glitchMode', 'reactive']],
);

// Uma escolha feita AQUI nunca é sobreposta pela que veio de lá.
assert.deepEqual(
  chavesAEscrever({ 'pref:audioQuality': 'low' }, { 'pref:audioQuality': 'high' }, fora),
  [],
  'o local manda sobre o remoto',
);

// O que tem tabela própria não passa por aqui.
assert.deepEqual(chavesAEscrever({}, { 'pref:searchHistory': '[]' }, fora), []);

// Lixo no saco remoto não entra: nem chaves de fora, nem valores que não são texto.
assert.deepEqual(chavesAEscrever({}, { outraCoisa: 'x' }, fora), []);
assert.deepEqual(chavesAEscrever({}, { 'pref:eqGanhos': 12 as any }, fora), []);
assert.deepEqual(chavesAEscrever({}, {}, fora), []);

// Uma preferência vazia GRAVADA no aparelho continua a ser uma escolha.
assert.deepEqual(chavesAEscrever({ 'pref:notifications': '' }, { 'pref:notifications': 'on' }, fora), []);

console.log('Preferências na conta: enche o que falta e nunca sobrepõe o que já cá está.');

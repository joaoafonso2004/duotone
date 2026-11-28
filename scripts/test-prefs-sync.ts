import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAVE_DO_DONO, chavesAEscrever, chavesDeOutraConta, DA_CONTA, DE_FORA } from '../src/lib/prefsFusao.ts';

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

// As preferências da CONTA não passam para outra conta no mesmo aparelho (28/11: os
// "Pinned" da conta principal apareciam numa conta nova no PC).
const noDisco = ['pref:atalhosDaLateral', 'pref:gaveta', 'pref:boasVindas', 'pref:audioQuality', 'pref:eqGanhos', 'conta-das-prefs'];
assert.deepEqual(
  chavesDeOutraConta('conta-a', 'conta-b', noDisco).sort(),
  ['pref:atalhosDaLateral', 'pref:boasVindas', 'pref:gaveta'],
  'ao trocar de conta saem as da conta anterior, e só essas',
);
assert.deepEqual(chavesDeOutraConta('conta-a', 'conta-a', noDisco), [], 'a mesma conta não perde nada');
assert.deepEqual(chavesDeOutraConta(null, 'conta-a', noDisco), [], 'sem dono guardado (antes desta regra), fica tudo');
for (const chave of DA_CONTA) {
  assert.ok(chave.startsWith('pref:'), `${chave} é uma preferência que viaja`);
  assert.ok(!DE_FORA.has(chave), `${chave} não pode estar de fora da conta`);
}
assert.ok(!CHAVE_DO_DONO.startsWith('pref:'), 'o dono é do aparelho e não viaja');

// Ligado: o prefsSync tira-as antes de ler a conta, e a lateral e a gaveta largam-nas.
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sync = ler('src/lib/prefsSync.ts');
assert.ok(sync.indexOf('chavesDeOutraConta(') > 0 && sync.indexOf('chavesDeOutraConta(') < sync.indexOf("from('user_prefs')"),
  'as da outra conta saem antes de se ler a conta nova');
assert.match(ler('App.tsx'), /\}, reporOQueEDaConta\);/);
assert.match(ler('App.tsx'), /reporOQueEDaConta\(chaves\);/);
const repor = ler('src/state/prefsDaConta.ts');
assert.match(repor, /pref:atalhosDaLateral[\s\S]*esquecer\(\)/);
assert.match(repor, /pref:gaveta[\s\S]*carregarGaveta\(\)/);

console.log('Preferências na conta: enche o que falta, nunca sobrepõe o que já cá está, e o que é de uma conta não passa para outra.');

// O que fazer com um erro de reprodução.
import assert from 'node:assert/strict';
import { apresentarErro } from '../src/lib/erroDeReproducao.ts';
import type { EstadoDeReproducao } from '../src/lib/playbackMachine.ts';

const aTocar: EstadoDeReproducao = { intencao: 'tocar', fase: 'a-tocar' };
const parado: EstadoDeReproducao = { intencao: 'parar', fase: 'falhou' };

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('Erros de reprodução:');

verificar('sem mensagem não há nada a mostrar', () => {
  assert.equal(apresentarErro({ mensagem: null, estado: aTocar, temSeguinte: true }), null);
  assert.equal(apresentarErro({ mensagem: '   ', estado: parado, temSeguinte: true }), null);
});

verificar('um aviso com a música a tocar some-se sozinho e não pede nada', () => {
  const r = apresentarErro({ mensagem: 'using embed', estado: aTocar, temSeguinte: true })!;
  assert.equal(r.temporario, true);
  assert.deepEqual(r.accoes, [], 'pediu uma decisão sobre algo que já se resolveu');
});

verificar('uma falha FICA no ecrã', () => {
  const r = apresentarErro({ mensagem: 'failed to load', estado: parado, temSeguinte: true })!;
  assert.equal(r.temporario, false, 'o toast fugia e levava o botão de repetir com ele');
});

verificar('uma falha oferece repetir e seguinte', () => {
  const r = apresentarErro({ mensagem: 'x', estado: parado, temSeguinte: true })!;
  assert.deepEqual(r.accoes, ['repetir', 'seguinte']);
});

verificar('sem faixa a seguir não se oferece o que não existe', () => {
  const r = apresentarErro({ mensagem: 'x', estado: parado, temSeguinte: false })!;
  assert.deepEqual(r.accoes, ['repetir']);
});

verificar('repetir vem sempre antes de saltar', () => {
  const r = apresentarErro({ mensagem: 'x', estado: parado, temSeguinte: true })!;
  assert.equal(r.accoes[0], 'repetir', 'a saída fácil não pode ser a primeira');
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nErros de reprodução: todos os casos passaram.');

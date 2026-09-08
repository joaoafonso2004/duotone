// A rede que desprende o convidado dos 0:00.
//
// O que se prova aqui é sobretudo quando é que ela NÃO deve disparar: um
// watchdog que salta de mais é pior do que não haver nenhum, porque passa a
// dar seeks numa música que estava a tocar bem.
import assert from 'node:assert/strict';
import {
  precisaDeEmpurrao, PARADO_DEMAIS_MS, EMPURROES_POR_FAIXA,
} from '../src/lib/arranqueTravado.ts';

const base = {
  autorizadoATocar: true,
  querTocar: true,
  pronta: true,
  posicaoMs: 0,
  paradoMs: PARADO_DEMAIS_MS,
  empurroesDados: 0,
};

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('o caso que existe para apanhar', () => {
  assert.equal(precisaDeEmpurrao(base), true);
});

verificar('não se empurra antes de tempo', () => {
  assert.equal(precisaDeEmpurrao({ ...base, paradoMs: PARADO_DEMAIS_MS - 1 }), false);
});

verificar('uma faixa que ARRANCOU não se empurra', () => {
  // Parou a meio? Isso é fim de faixa ou buffer vazio, e tem dono noutro
  // sítio. Dois watchdogs sobre o mesmo sintoma dão seeks a discutir.
  assert.equal(precisaDeEmpurrao({ ...base, posicaoMs: 45_000 }), false);
  assert.equal(precisaDeEmpurrao({ ...base, posicaoMs: 1001 }), false);
  assert.equal(precisaDeEmpurrao({ ...base, posicaoMs: 999 }), true, 'ainda no arranque');
});

verificar('em pausa não se empurra nada', () => {
  assert.equal(precisaDeEmpurrao({ ...base, autorizadoATocar: false }), false,
    'quem manda diz pausa: parado é o que se espera');
  assert.equal(precisaDeEmpurrao({ ...base, querTocar: false }), false,
    'o utilizador pausou: parado é o que ele pediu');
});

verificar('sem o ficheiro cá não há nada a empurrar', () => {
  assert.equal(precisaDeEmpurrao({ ...base, pronta: false }), false);
});

verificar('desiste ao fim de três, e não fica a saltar para sempre', () => {
  for (let n = 0; n < EMPURROES_POR_FAIXA; n++) {
    assert.equal(precisaDeEmpurrao({ ...base, empurroesDados: n }), true, `tentativa ${n}`);
  }
  assert.equal(precisaDeEmpurrao({ ...base, empurroesDados: EMPURROES_POR_FAIXA }), false);
  assert.equal(precisaDeEmpurrao({ ...base, empurroesDados: 99 }), false);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nArranque travado: a rede apanha o caso e não salta em cima dos outros.');

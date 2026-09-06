// O que cada comando da Siri faz ao leitor.
//
// A regra que isto protege: os comandos da Siri são idempotentes. Dizer
// "tocar" com a música já a tocar não pode pausá-la -- e pausaria, se isto
// estivesse ligado ao togglePlay que os botões da app usam.
import assert from 'node:assert/strict';
import { accaoParaComando } from '../src/lib/comandosDaSiri.ts';

const aTocar = { aTocar: true, temFaixa: true };
const emPausa = { aTocar: false, temFaixa: true };
const semFaixa = { aTocar: false, temFaixa: false };

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('Comandos da Siri:');

verificar('"tocar" em pausa retoma', () => {
  assert.equal(accaoParaComando('tocar', emPausa), 'tocar');
});

verificar('"tocar" já a tocar não faz nada', () => {
  assert.equal(accaoParaComando('tocar', aTocar), 'nada', 'dizer tocar pausou a música');
});

verificar('"pausar" a tocar pausa', () => {
  assert.equal(accaoParaComando('pausar', aTocar), 'pausar');
});

verificar('"pausar" já em pausa não faz nada', () => {
  assert.equal(accaoParaComando('pausar', emPausa), 'nada', 'dizer pausar voltou a tocar');
});

verificar('saltar funciona nos dois estados', () => {
  assert.equal(accaoParaComando('seguinte', aTocar), 'seguinte');
  assert.equal(accaoParaComando('seguinte', emPausa), 'seguinte');
  assert.equal(accaoParaComando('anterior', aTocar), 'anterior');
  assert.equal(accaoParaComando('anterior', emPausa), 'anterior');
});

verificar('sem faixa aberta nenhum comando faz nada', () => {
  for (const c of ['tocar', 'pausar', 'seguinte', 'anterior'] as const) {
    assert.equal(accaoParaComando(c, semFaixa), 'nada', `${c} agiu sem faixa`);
  }
});

verificar('um comando desconhecido é ignorado', () => {
  assert.equal(accaoParaComando('inventado' as never, aTocar), 'nada');
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nComandos da Siri: todos os casos passaram.');

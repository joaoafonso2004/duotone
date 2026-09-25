/**
 * Os atalhos dentro da janela do PC (src/lib/atalhosDaJanela.ts).
 *
 * Correr: node --experimental-strip-types scripts/test-atalhos-da-janela.ts
 */
import assert from 'node:assert/strict';
import { acaoDaJanela, type TeclaDaJanela } from '../src/lib/atalhosDaJanela.ts';

const tecla = (key: string, extra: Partial<TeclaDaJanela> = {}): TeclaDaJanela => ({
  key, ctrl: false, alt: false, shift: false, meta: false,
  repetida: false, editavel: false, deslizador: false, ...extra,
});

let n = 0;
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok - ${nome}`); };

caso('o Espaço toca e pausa', () => {
  assert.equal(acaoDaJanela(tecla(' ')), 'tocar-pausa');
});
caso('manter o Espaço não repete', () => {
  assert.equal(acaoDaJanela(tecla(' ', { repetida: true })), null);
});
caso('num campo de texto o Espaço e as setas são de quem escreve', () => {
  assert.equal(acaoDaJanela(tecla(' ', { editavel: true })), null);
  assert.equal(acaoDaJanela(tecla('ArrowRight', { editavel: true })), null);
  assert.equal(acaoDaJanela(tecla('l', { ctrl: true, editavel: true })), null);
});
caso('Ctrl+F e Ctrl+K vão à pesquisa, também de dentro de um campo', () => {
  assert.equal(acaoDaJanela(tecla('f', { ctrl: true })), 'pesquisar');
  assert.equal(acaoDaJanela(tecla('K', { ctrl: true })), 'pesquisar');
  assert.equal(acaoDaJanela(tecla('f', { ctrl: true, editavel: true })), 'pesquisar');
});
caso('Ctrl+L gosta da faixa, e só uma vez por toque', () => {
  assert.equal(acaoDaJanela(tecla('l', { ctrl: true })), 'gostar');
  assert.equal(acaoDaJanela(tecla('l', { ctrl: true, repetida: true })), null);
});
caso('as setas andam 10 s; com Ctrl mudam de faixa', () => {
  assert.equal(acaoDaJanela(tecla('ArrowRight')), 'avancar-10');
  assert.equal(acaoDaJanela(tecla('ArrowLeft')), 'recuar-10');
  assert.equal(acaoDaJanela(tecla('ArrowRight', { ctrl: true })), 'seguinte');
  assert.equal(acaoDaJanela(tecla('ArrowLeft', { ctrl: true })), 'anterior');
});
caso('numa barra de setas (a velocidade) as setas são dela', () => {
  assert.equal(acaoDaJanela(tecla('ArrowRight', { deslizador: true })), null);
  assert.equal(acaoDaJanela(tecla(' ', { deslizador: true })), 'tocar-pausa');
});
caso('Alt (AltGr) e a tecla Windows nunca são nossos', () => {
  assert.equal(acaoDaJanela(tecla('f', { ctrl: true, alt: true })), null);
  assert.equal(acaoDaJanela(tecla(' ', { meta: true })), null);
  assert.equal(acaoDaJanela(tecla('ArrowRight', { alt: true })), null);
});
caso('Shift e teclas sem atalho não fazem nada', () => {
  assert.equal(acaoDaJanela(tecla(' ', { shift: true })), null);
  assert.equal(acaoDaJanela(tecla('ArrowRight', { shift: true })), null);
  assert.equal(acaoDaJanela(tecla('a')), null);
  assert.equal(acaoDaJanela(tecla('p', { ctrl: true })), null);
});

console.log(`\nAtalhos da janela: ${n} casos passaram.`);

// Quando e que o cartaz da semana aparece, em Node puro.
import assert from 'node:assert/strict';
import {
  chaveDaSemana, dentroDaJanela, DIAS_DE_JANELA, mostrarCartaz, SEXTA,
} from '../src/lib/sextaFeira.ts';

/** Hora LOCAL de proposito: a sexta-feira de quem le e a dele. */
const em = (ano: number, mes: number, dia: number, hora = 12) => new Date(ano, mes - 1, dia, hora);

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

// Setembro de 2026: dia 11 e uma sexta-feira.
const sexta = em(2026, 9, 11);
const sabado = em(2026, 9, 12);
const domingo = em(2026, 9, 13);
const segunda = em(2026, 9, 14);
const quinta = em(2026, 9, 17);
const sextaSeguinte = em(2026, 9, 18);

verificar('a sexta e mesmo uma sexta', () => {
  assert.equal(sexta.getDay(), SEXTA);
});

verificar('na sexta, a chave e o proprio dia', () => {
  assert.equal(chaveDaSemana(sexta), '2026-09-11');
});

verificar('no sabado e no domingo ainda e a sexta de ontem', () => {
  assert.equal(chaveDaSemana(sabado), '2026-09-11');
  assert.equal(chaveDaSemana(domingo), '2026-09-11');
});

verificar('na quinta ja e a sexta da semana passada', () => {
  assert.equal(chaveDaSemana(quinta), '2026-09-11');
  assert.equal(chaveDaSemana(sextaSeguinte), '2026-09-18');
});

verificar('a janela abre na sexta e fecha antes da segunda', () => {
  assert.equal(dentroDaJanela(sexta), true);
  assert.equal(dentroDaJanela(sabado), true);
  assert.equal(dentroDaJanela(domingo), true);
  assert.equal(dentroDaJanela(segunda), false);
  assert.equal(dentroDaJanela(quinta), false);
});

verificar('sao tres dias, e nao um -- um cartaz de 24h quase ninguem ve', () => {
  assert.equal(DIAS_DE_JANELA, 3);
});

verificar('a primeira vez de sempre mostra', () => {
  assert.equal(mostrarCartaz(sexta, null), true);
  assert.equal(mostrarCartaz(sexta, ''), true);
});

verificar('e a segunda abertura da mesma semana NAO mostra', () => {
  const chave = chaveDaSemana(sexta);
  assert.equal(mostrarCartaz(sexta, chave), false);
  assert.equal(mostrarCartaz(sabado, chave), false, 'nem no dia seguinte');
  assert.equal(mostrarCartaz(domingo, chave), false);
});

verificar('quem nao abriu na sexta ve no sabado', () => {
  assert.equal(mostrarCartaz(sabado, '2026-09-04'), true);
});

verificar('fora da janela nao mostra, mesmo nunca tendo visto', () => {
  assert.equal(mostrarCartaz(segunda, null), false);
  assert.equal(mostrarCartaz(quinta, null), false);
});

verificar('na sexta seguinte volta a mostrar', () => {
  assert.equal(mostrarCartaz(sextaSeguinte, chaveDaSemana(sexta)), true);
});

verificar('a meia-noite e um da sexta ja conta', () => {
  const meiaNoite = em(2026, 9, 11, 0);
  assert.equal(mostrarCartaz(meiaNoite, null), true);
  assert.equal(chaveDaSemana(meiaNoite), '2026-09-11');
});

verificar('a virada do ano nao parte a chave', () => {
  // 1 de janeiro de 2027 e uma sexta-feira.
  const anoNovo = em(2027, 1, 1);
  assert.equal(anoNovo.getDay(), SEXTA);
  assert.equal(chaveDaSemana(anoNovo), '2027-01-01');
  assert.equal(chaveDaSemana(em(2027, 1, 2)), '2027-01-01');
  // E o sabado anterior ao ano novo ainda aponta para dezembro.
  assert.equal(chaveDaSemana(em(2026, 12, 26)), '2026-12-25');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

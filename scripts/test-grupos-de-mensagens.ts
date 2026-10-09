/**
 * Os grupos e os separadores de hora da conversa -- src/lib/gruposDeMensagens.ts.
 * Correr: node --experimental-strip-types scripts/test-grupos-de-mensagens.ts
 */
import assert from 'node:assert/strict';
import { mesmoGrupo, rotuloDoSeparador, separadorPorCima } from '../src/lib/gruposDeMensagens.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const hora = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const agora = new Date(2026, 9, 9, 12, 0).getTime();
const m = (quem: string, d: Date) => ({ createdAt: d.toISOString(), sender: { id: quem } });

console.log('\nos separadores');
caso('hoje, ontem, esta semana e antes', () => {
  assert.equal(rotuloDoSeparador(new Date(2026, 9, 9, 11, 10).getTime(), agora, hora), 'Today 11:10');
  assert.equal(rotuloDoSeparador(new Date(2026, 9, 8, 23, 40).getTime(), agora, hora), 'Yesterday 23:40');
  assert.equal(rotuloDoSeparador(new Date(2026, 9, 5, 9, 5).getTime(), agora, hora), 'Mon 09:05');
  assert.equal(rotuloDoSeparador(new Date(2026, 8, 20, 18, 0).getTime(), agora, hora), '20 Sep 18:00');
  assert.equal(rotuloDoSeparador(new Date(2025, 11, 31, 22, 0).getTime(), agora, hora), '31 Dec 2025 22:00');
});
caso('a primeira mensagem da conversa leva separador', () => {
  assert.equal(separadorPorCima(m('a', new Date(2026, 9, 9, 11, 10)), undefined, agora, hora), 'Today 11:10');
});
caso('três seguidas no mesmo minuto não repetem a hora', () => {
  const a = m('a', new Date(2026, 9, 9, 11, 10)), b = m('b', new Date(2026, 9, 9, 11, 10, 30));
  assert.equal(separadorPorCima(b, a, agora, hora), null);
});
caso('depois de 15 min, outro separador', () => {
  const a = m('a', new Date(2026, 9, 9, 11, 0)), b = m('a', new Date(2026, 9, 9, 11, 16));
  assert.equal(separadorPorCima(b, a, agora, hora), 'Today 11:16');
});
caso('a meia-noite muda o dia, mesmo com 2 min entre elas', () => {
  const a = m('a', new Date(2026, 9, 8, 23, 59)), b = m('a', new Date(2026, 9, 9, 0, 1));
  assert.equal(separadorPorCima(b, a, agora, hora), 'Today 00:01');
});

console.log('\nos grupos');
caso('a mesma pessoa até 5 min é o mesmo grupo', () => {
  assert.equal(mesmoGrupo(m('a', new Date(2026, 9, 9, 11, 0)), m('a', new Date(2026, 9, 9, 11, 4))), true);
});
caso('outra pessoa, ou mais de 5 min, ou outro dia: grupo novo', () => {
  assert.equal(mesmoGrupo(m('a', new Date(2026, 9, 9, 11, 0)), m('b', new Date(2026, 9, 9, 11, 1))), false);
  assert.equal(mesmoGrupo(m('a', new Date(2026, 9, 9, 11, 0)), m('a', new Date(2026, 9, 9, 11, 6))), false);
  assert.equal(mesmoGrupo(m('a', new Date(2026, 9, 8, 23, 59)), m('a', new Date(2026, 9, 9, 0, 1))), false);
  assert.equal(mesmoGrupo(undefined, m('a', new Date())), false);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

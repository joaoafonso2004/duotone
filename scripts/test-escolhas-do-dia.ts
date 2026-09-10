// As datas das Musicas do dia, em Node puro.
import assert from 'node:assert/strict';
import { DIAS_DE_HISTORICO, diasAnteriores, diaUtc, rotuloDoDia } from '../src/lib/escolhasDoDia.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

// Quinta-feira, 10 de setembro de 2026, a meio da tarde.
const agora = Date.UTC(2026, 8, 10, 15, 0, 0);

console.log('\nmusicas do dia: as datas');

verificar('o dia e o UTC, como o current_date do servidor', () => {
  assert.equal(diaUtc(agora), '2026-09-10');
  // 00:30 em Lisboa (UTC+1) ainda e o dia anterior para o servidor.
  assert.equal(diaUtc(Date.UTC(2026, 8, 9, 23, 30)), '2026-09-09');
});

verificar('os dias anteriores comecam ontem e nao incluem hoje', () => {
  assert.deepEqual(diasAnteriores(agora, 3), ['2026-09-09', '2026-09-08', '2026-09-07']);
});

verificar('atravessam o mes sem saltar dias', () => {
  assert.deepEqual(diasAnteriores(Date.UTC(2026, 9, 2, 10), 3), ['2026-10-01', '2026-09-30', '2026-09-29']);
});

verificar('um historico de uma semana, sem contar hoje', () => {
  assert.equal(DIAS_DE_HISTORICO, 6);
  assert.equal(diasAnteriores(agora, DIAS_DE_HISTORICO).length, 6);
  assert.deepEqual(diasAnteriores(agora, 0), []);
  assert.deepEqual(diasAnteriores(agora, -2), []);
});

verificar('os rotulos: hoje, ontem, o dia da semana, e depois a data', () => {
  assert.equal(rotuloDoDia('2026-09-10', agora), 'Today');
  assert.equal(rotuloDoDia('2026-09-09', agora), 'Yesterday');
  assert.equal(rotuloDoDia('2026-09-08', agora), 'Tuesday');
  assert.equal(rotuloDoDia('2026-09-04', agora), 'Friday');
  assert.equal(rotuloDoDia('2026-09-03', agora), 'Sep 3');
});

verificar('um dia que nao se percebe fica como veio', () => {
  assert.equal(rotuloDoDia('ontem', agora), 'ontem');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
// `exitCode` e não `process.exit()`: um script tão curto chegava ao exit com o
// Node (24, Windows) ainda a fechar handles, e metade das vezes rebentava numa
// asserção do libuv (`UV_HANDLE_CLOSING`, código 127) depois de tudo passar.
process.exitCode = falhas === 0 ? 0 : 1;

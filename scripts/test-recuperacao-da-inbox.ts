/**
 * Quando é que a inbox se relê sem aviso do Realtime -- src/lib/recuperacaoDaInbox.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-recuperacao-da-inbox.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deveRelerAInbox, TIQUE_DA_INBOX_MS, TIQUES_COM_REALTIME, TIQUES_SEM_REALTIME,
} from '../src/lib/recuperacaoDaInbox.ts';

const base = { aoVivo: false, visivel: true, podeLer: true, tiques: 0 };

// Sem Realtime: de minuto a minuto, e não de 15 em 15 s.
assert.equal(TIQUE_DA_INBOX_MS * TIQUES_SEM_REALTIME, 60_000);
assert.equal(deveRelerAInbox({ ...base, tiques: 1 }), false, 'sem Realtime, não a cada tique');
assert.equal(deveRelerAInbox({ ...base, tiques: TIQUES_SEM_REALTIME - 1 }), false);
assert.equal(deveRelerAInbox({ ...base, tiques: TIQUES_SEM_REALTIME }), true, 'sem Realtime, uma por minuto');
// O PC com a janela escondida pode ler (a barra de tarefas mostra as por ler):
// sem Realtime, é a única maneira de lá chegar uma mensagem.
assert.equal(deveRelerAInbox({ ...base, visivel: false, tiques: TIQUES_SEM_REALTIME }), true);

// Com Realtime: quinze minutos com a app à frente, nunca escondida.
assert.equal(TIQUE_DA_INBOX_MS * TIQUES_COM_REALTIME, 15 * 60_000);
const aoVivo = { ...base, aoVivo: true };
assert.equal(deveRelerAInbox({ ...aoVivo, tiques: TIQUES_COM_REALTIME - 1 }), false, 'com Realtime não se lê a cada minuto');
assert.equal(deveRelerAInbox({ ...aoVivo, tiques: TIQUES_COM_REALTIME }), true, 'com Realtime, a rede de quinze minutos');
assert.equal(deveRelerAInbox({ ...aoVivo, visivel: false, tiques: 10_000 }), false,
  'escondida e com Realtime, quem avisa é ele: o tabuleiro do PC não lê o dia todo');

// Quem não pode ler (iPhone em segundo plano) nunca lê.
assert.equal(deveRelerAInbox({ ...base, podeLer: false, tiques: 10_000 }), false);

// E a store usa esta regra, e não um intervalo à parte.
const loja = readFileSync(new URL('../src/state/social.ts', import.meta.url), 'utf8');
assert.match(loja, /deveRelerAInbox\(/, 'a store decide pela regra');
assert.doesNotMatch(loja, /setInterval\(\(\) => \{ if \(canReadInbox\(\)\) void inboxRefresh\(\); \}, 15000\)/,
  'a leitura de 15 em 15 s não volta');

console.log('Recuperação da inbox: passou.');

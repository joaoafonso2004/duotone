/**
 * "Start with Windows" ligado de origem -- electron/arranqueComWindows.cjs.
 *
 * Correr: node scripts/test-arranque-com-windows.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { arranqueAoAbrir, escolhaDaPessoa, MODO_DE_ORIGEM } = require('../electron/arranqueComWindows.cjs');

// Primeira abertura (sem ficheiro): liga, a abrir a janela, e fica decidido.
assert.deepEqual(arranqueAoAbrir(null), { ligar: true, gravar: { mode: 'window', decidido: true } });
assert.equal(MODO_DE_ORIGEM, 'window', 'abre a janela, para se lembrarem da app');

// Já decidido, ou um ficheiro antigo só com o modo: não se mexe em nada.
assert.deepEqual(arranqueAoAbrir({ mode: 'tray', decidido: true }), { ligar: false, gravar: null });
assert.deepEqual(arranqueAoAbrir({ mode: 'window' }), { ligar: false, gravar: null }, 'quem já mexeu na opção não a vê voltar');

// A escolha nas Definições fica sempre decidida.
assert.deepEqual(escolhaDaPessoa('window'), { mode: 'window', decidido: true });
assert.deepEqual(escolhaDaPessoa('outra'), { mode: 'tray', decidido: true });

// O processo principal usa as duas: ao abrir e no `startup:set`.
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.match(main, /arranqueAoAbrir\(/, 'o main.cjs não aplica o arranque de origem');
assert.match(main, /escolhaDaPessoa\(mode\)/, 'o startup:set não grava a escolha como decidida');

console.log('Start with Windows ligado de origem, uma vez só: passou.');

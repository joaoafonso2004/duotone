// A saúde do processo principal do Electron (electron/saude.cjs), numa pasta
// temporária: o que se guarda, o que se lê e apaga, e quando se recarrega.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { criarSaude, MAX_INCIDENTES, MAX_RECARGAS } = require('../electron/saude.cjs');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'duotone-saude-'));
const dumps = path.join(pasta, 'Crashpad');
let relogio = 1_800_000_000_000;
const nova = () => criarSaude({ pastaDeDados: pasta, pastaDosDumps: dumps, versao: '3.5.1', agora: () => relogio });

try {
  const saude = nova();
  assert.ok(Math.abs(saude.processoComecouEm - (relogio - process.uptime() * 1000)) < 5000, 'o início do processo');

  // Primeira leitura: vazia, e os dumps que já existiam não contam.
  fs.mkdirSync(path.join(dumps, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(dumps, 'reports', 'antigo.dmp'), 'x');
  fs.utimesSync(path.join(dumps, 'reports', 'antigo.dmp'), (relogio - 60_000) / 1000, (relogio - 60_000) / 1000);
  assert.deepEqual(saude.ler().incidentes, []);

  // O renderer morre: regista e recarrega, mas não em ciclo.
  assert.equal(saude.rendererMorreu({ reason: 'clean-exit', exitCode: 0 }), false, 'fechar a janela não é falha');
  for (let i = 0; i < MAX_RECARGAS; i++) {
    relogio += 1000;
    assert.equal(saude.rendererMorreu({ reason: 'crashed', exitCode: 139 }), true);
  }
  relogio += 1000;
  assert.equal(saude.rendererMorreu({ reason: 'oom', exitCode: 1 }), false, 'a quarta seguida não recarrega');
  relogio += 6 * 60 * 1000;
  assert.equal(saude.rendererMorreu({ reason: 'crashed', exitCode: 139 }), true, 'passado o intervalo, volta a recarregar');

  saude.processoFilhoMorreu({ type: 'GPU', reason: 'crashed', exitCode: 5 });
  saude.processoFilhoMorreu({ type: 'GPU', reason: 'killed' });
  saude.processoFilhoMorreu({ type: 'Utility', reason: 'crashed' });
  saude.erroDoPrincipal(new TypeError('ENOENT C:\\Users\\Joao\\x.json'), 'uncaughtException');
  saude.erroDoPrincipal('texto solto', 'unhandledRejection');
  saude.janelaPresa();

  // Um crash nativo novo no Crashpad.
  fs.mkdirSync(path.join(dumps, 'reports', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dumps, 'reports', 'sub', 'novo.dmp'), 'x');
  fs.utimesSync(path.join(dumps, 'reports', 'sub', 'novo.dmp'), relogio / 1000, relogio / 1000);
  fs.writeFileSync(path.join(dumps, 'reports', 'nao-e-dump.txt'), 'x');

  // Um processo novo lê o que o anterior guardou.
  const depois = nova();
  const { incidentes } = depois.ler();
  const tipos = incidentes.map((i) => i.tipo);
  assert.deepEqual(tipos, ['renderer', 'renderer', 'renderer', 'gpu', 'principal', 'principal', 'bloqueio', 'crash-nativo']);
  assert.equal(incidentes[0].vezes, 3, 'os crashes seguidos do renderer são um episódio');
  assert.equal(incidentes[0].motivo, 'crashed');
  assert.equal(incidentes[0].codigo, 139);
  assert.equal(incidentes[0].versao, '3.5.1');
  assert.equal(incidentes[1].motivo, 'oom', 'outro motivo é outra linha');
  assert.equal(incidentes[2].vezes, undefined, 'seis minutos depois é outro episódio');
  assert.equal(incidentes[4].nome, 'TypeError');
  assert.equal(incidentes[5].nome, 'string');
  assert.equal(incidentes[7].vezes, 1, 'só o dump novo conta');
  assert.equal(incidentes[7].onde, 'crashpad');

  // Ler apaga; o mesmo dump não volta a contar.
  assert.deepEqual(depois.ler().incidentes, []);

  // A lista tem teto.
  for (let i = 0; i < 50; i++) depois.registar({ tipo: 'bloqueio', motivo: `m${i}` });
  assert.equal(depois.ler().incidentes.length, MAX_INCIDENTES);

  // Um ficheiro estragado não parte nada.
  fs.writeFileSync(path.join(pasta, 'saude-incidentes.json'), '{lixo');
  assert.deepEqual(depois.ler().incidentes, []);
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}

// O processo principal liga isto: sem as ligações, o ficheiro não faz nada.
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
for (const [o, onde] of [
  ["crashReporter.start({ uploadToServer: false", 'o Crashpad, sem enviar nada para fora'],
  ["'render-process-gone'", 'o renderer que morre'],
  ["'child-process-gone'", 'a GPU que cai'],
  ["'unresponsive'", 'a janela presa'],
  ["'uncaughtException'", 'as exceções do principal'],
  ["'unhandledRejection'", 'as promessas do principal'],
  ["ipcMain.handle('saude:ler'", 'a leitura pelo renderer'],
]) assert.ok(main.includes(o), `main.cjs sem ${onde}`);
assert.ok(preload.includes("lerSaude: () => ipcRenderer.invoke('saude:ler')"), 'preload sem lerSaude');

console.log('Saúde do Electron: renderer, GPU, exceções, janela presa e Crashpad guardados e lidos uma vez.');

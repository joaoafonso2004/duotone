/**
 * A versão ponte (electron/exportacao.cjs): o que a casca em Tauri lê no 1.º
 * arranque. Uma página falsa, uma pasta temporária a sério, e o main.cjs lido
 * como texto para confirmar que nenhum instalador corre sem exportação.
 *
 * Correr: node scripts/test-exportacao-ponte.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const exp = require('../electron/exportacao.cjs');

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${e.message}`); }
}

const ORIGEM = 'http://localhost:18081';
const eDaApp = (url) => { try { return new URL(url).origin === ORIGEM; } catch { return false; } };
/** A página falsa: o URL e o que o localStorage tem. `responde: false` nunca responde. */
function pagina({ url = `${ORIGEM}/index.html`, entradas = [['sb-sessao', '{"a":1}'], ['duotone:prefs', '{"x":2}']], responde = true, destruida = false } = {}) {
  const p = {
    lidas: 0,
    isDestroyed: () => destruida,
    getURL: () => url,
    executeJavaScript: (codigo) => {
      p.lidas++;
      assert.equal(codigo, exp.LER_O_ARMAZENAMENTO, 'só lê o armazenamento');
      return responde ? Promise.resolve(entradas) : new Promise(() => {});
    },
  };
  return p;
}
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'duotone-ponte-'));
const base = { eDaApp, pastaDeDados: pasta, versaoDaApp: '6.2.0', fs, path, crypto, agora: 1_800_000_000_000 };
const ficheiro = path.join(pasta, 'migracao', 'exportacao.json');
const ler = () => JSON.parse(fs.readFileSync(ficheiro, 'utf8'));

console.log('\na exportação');

await caso('uma página que não é a da app, destruída, ou sem resposta: nada se grava', async () => {
  assert.equal((await exp.exportar({ ...base, webContents: pagina({ url: 'https://www.youtube.com/embed/x' }) })).ok, false);
  assert.equal((await exp.exportar({ ...base, webContents: pagina({ destruida: true }) })).ok, false);
  assert.equal((await exp.exportar({ ...base, webContents: null })).ok, false);
  assert.equal((await exp.exportar({ ...base, webContents: pagina({ responde: false }), esperaMs: 50 })).ok, false, 'com prazo');
  assert.equal((await exp.exportar({ ...base, webContents: pagina({ entradas: [] }) })).ok, false, 'vazio não é exportação');
  assert.equal((await exp.exportar({ ...base, webContents: pagina({ entradas: [['a', 1]] }) })).ok, false, 'só texto');
  assert.equal(fs.existsSync(ficheiro), false);
});

await caso('grava o armazenamento e os JSON da pasta, sem deixar o .parcial', async () => {
  fs.writeFileSync(path.join(pasta, 'windows-window.json'), JSON.stringify({ largura: 1440, maximizada: true }));
  fs.writeFileSync(path.join(pasta, 'atalhos.json'), JSON.stringify({ tocar: 'Ctrl+Alt+P' }));
  fs.writeFileSync(path.join(pasta, 'mini-leitor.json'), '{ partido');
  const r = await exp.exportar({ ...base, webContents: pagina() });
  assert.deepEqual([r.ok, r.escrita, r.chaves], [true, true, 2]);
  const e = ler();
  assert.equal(exp.exportacaoValida(e), true);
  assert.equal(e.origem, ORIGEM);
  assert.equal(e.app, '6.2.0');
  assert.equal(e.em, base.agora);
  assert.deepEqual(e.localStorage, [['sb-sessao', '{"a":1}'], ['duotone:prefs', '{"x":2}']]);
  assert.deepEqual(e.ficheiros['windows-window.json'], { largura: 1440, maximizada: true });
  assert.deepEqual(e.ficheiros['atalhos.json'], { tocar: 'Ctrl+Alt+P' });
  assert.equal('mini-leitor.json' in e.ficheiros, false, 'um JSON partido fica de fora');
  assert.equal(fs.existsSync(`${ficheiro}.parcial`), false);
  assert.deepEqual(exp.lerExportacao({ fs, path, pastaDeDados: pasta }), e);
});

await caso('igual à última: não se reescreve; mudou: reescreve-se', async () => {
  const primeira = await exp.exportar({ ...base, webContents: pagina() });
  const igual = await exp.exportar({ ...base, agora: base.agora + 1000, webContents: pagina(), ultima: primeira.assinatura });
  assert.deepEqual([igual.ok, igual.escrita], [true, false]);
  assert.equal(ler().em, base.agora, 'o ficheiro ficou o de antes');
  const outra = await exp.exportar({ ...base, agora: base.agora + 2000, webContents: pagina({ entradas: [['sb-sessao', '{"a":2}']] }), ultima: primeira.assinatura });
  assert.deepEqual([outra.ok, outra.escrita], [true, true]);
  assert.deepEqual(ler().localStorage, [['sb-sessao', '{"a":2}']]);
  // Se o ficheiro sumiu, grava-se mesmo com a assinatura igual.
  fs.rmSync(ficheiro);
  assert.equal((await exp.exportar({ ...base, webContents: pagina({ entradas: [['sb-sessao', '{"a":2}']] }), ultima: outra.assinatura })).escrita, true);
});

await caso('só uma exportação boa conta', () => {
  const boa = { versao: 1, app: '6.2.0', em: 1, origem: ORIGEM, localStorage: [['k', 'v']], ficheiros: {} };
  assert.equal(exp.exportacaoValida(boa), true);
  assert.equal(exp.exportacaoValida({ ...boa, versao: 2 }), false);
  assert.equal(exp.exportacaoValida({ ...boa, origem: 'https://example.org' }), false);
  assert.equal(exp.exportacaoValida({ ...boa, localStorage: [] }), false);
  assert.equal(exp.exportacaoValida({ ...boa, localStorage: [['k']] }), false);
  assert.equal(exp.exportacaoValida({ ...boa, ficheiros: [] }), false);
  assert.equal(exp.exportacaoValida({ ...boa, em: 'ontem' }), false);
  assert.equal(exp.exportacaoValida(null), false);
  fs.writeFileSync(ficheiro, '{ meio ficheiro');
  assert.equal(exp.lerExportacao({ fs, path, pastaDeDados: pasta }), null, 'um ficheiro estragado não passa por bom');
});

console.log('\nnenhum instalador sem exportação (electron/main.cjs, como texto)');
const MAIN = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** O bocado do main.cjs entre `de` e a primeira chamada ao `lancarInstalador` a seguir. */
const antesDoInstalador = (de) => {
  const i = MAIN.indexOf(de);
  assert.ok(i >= 0, `"${de}" no main.cjs`);
  const j = MAIN.indexOf('atualizacao.lancarInstalador(', i);
  assert.ok(j > i, `o lancarInstalador depois de "${de}"`);
  return MAIN.slice(i, j);
};

await caso('o "Update now", o instalar já e o instalar ao abrir pedem a exportação antes', () => {
  assert.match(antesDoInstalador("ipcMain.handle('atualizacao:instalar'"), /if \(!\(await exportarParaACascaNova\(\)\)\.ok\) \{\n\s*return \{ ok: false, erro: 'Could not prepare the update\. Try again in a moment\.' \};/);
  assert.match(antesDoInstalador('async function instalarProntaSePuder()'), /if \(!\(await exportarParaACascaNova\(\)\)\.ok\) \{\n\s*aInstalarJa = false;\n\s*return 'espera';/);
  assert.match(antesDoInstalador('async function instalarPendenteAoAbrir()'), /if \(!exportacao\.lerExportacao\(\{ fs, path, pastaDeDados: app\.getPath\('userData'\) \}\)\) return false;/);
  const lancamentos = MAIN.match(/atualizacao\.lancarInstalador\(/g) ?? [];
  assert.equal(lancamentos.length, 3, 'só estes três correm um instalador');
});

await caso('só a app instalada exporta, de 15 em 15 min e ao sair', () => {
  assert.match(MAIN, /function exportarParaACascaNova\(\) \{\n\s*if \(!app\.isPackaged\) return Promise\.resolve/);
  assert.match(MAIN, /vigiaDaExportacao = setInterval\(vez, 15 \* 60_000\);/);
  assert.match(MAIN, /porListaDeSaltos\(\);\n\s*vigiarExportacao\(\);/);
  assert.match(MAIN, /app\.on\('before-quit', \(evento\) => \{\n\s*if \(exportouAoSair \|\| !app\.isPackaged/);
  assert.match(MAIN, /Promise\.race\(\[exportarParaACascaNova\(\), new Promise\(\(r\) => setTimeout\(r, 2500\)\)\]\)\.finally\(\(\) => app\.quit\(\)\)/);
});

fs.rmSync(pasta, { recursive: true, force: true });
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nversão ponte (exportação): ok');

/**
 * O menu do Windows nos campos de texto do PC (24/10, electron/menuDoTexto.cjs):
 * o Electron não mostrava menu nenhum ao botão direito numa caixa de texto.
 *
 * Correr: node scripts/test-menu-do-texto.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { linhasDoMenuDoTexto } = require('../electron/menuDoTexto.cjs');

let falhas = 0;
const caso = (nome, f) => {
  try { f(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${String(e.message).split('\n')[0]}`); }
};
const tudo = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

caso('num campo: Cut, Copy, Paste e Select all, pelos papéis do Electron', () => {
  const l = linhasDoMenuDoTexto({ isEditable: true, selectionText: 'carti', editFlags: tudo });
  assert.deepEqual(l.map((x) => x.role ?? x.type), ['cut', 'copy', 'paste', 'separator', 'selectAll']);
  assert.deepEqual(l.filter((x) => x.label).map((x) => x.label), ['Cut', 'Copy', 'Paste', 'Select all']);
  assert.ok(l.filter((x) => x.role).every((x) => x.enabled));
});
caso('o que não se pode fazer fica apagado (sem seleção não se corta nem copia)', () => {
  const l = linhasDoMenuDoTexto({ isEditable: true, selectionText: '', editFlags: { canPaste: true, canSelectAll: true } });
  const ativo = Object.fromEntries(l.filter((x) => x.role).map((x) => [x.role, x.enabled]));
  assert.deepEqual(ativo, { cut: false, copy: false, paste: true, selectAll: true });
});
caso('texto selecionado fora de um campo: só Copy', () => {
  assert.deepEqual(linhasDoMenuDoTexto({ isEditable: false, selectionText: 'uma letra' }).map((x) => x.role), ['copy']);
});
caso('no fundo vazio, nada (nem o "Reload / Inspect")', () => {
  assert.deepEqual(linhasDoMenuDoTexto({ isEditable: false, selectionText: '  ' }), []);
  assert.deepEqual(linhasDoMenuDoTexto(undefined), []);
});
caso('a janela principal mostra-o no evento context-menu', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '..', 'electron/main.cjs'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(main, /const \{ linhasDoMenuDoTexto \} = require\('\.\/menuDoTexto\.cjs'\);/);
  assert.match(main, /win\.webContents\.on\('context-menu', \(_event, params\) => \{\n\s+const linhas = linhasDoMenuDoTexto\(params\);\n\s+if \(linhas\.length\) Menu\.buildFromTemplate\(linhas\)\.popup\(\{ window: win \}\);/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) a falhar.`); process.exit(1); }
console.log('\nO menu do texto no PC: campos, seleção e fundo vazio passaram.');

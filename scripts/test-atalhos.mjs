/**
 * electron/atalhos.cjs: os atalhos globais do PC. Nenhum vem posto; o que se
 * grava tem de ser um accelerator válido, de uma ação conhecida, com um
 * modificador a sério, e não pode colidir com outra ação da app.
 *
 * Correr: node scripts/test-atalhos.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const a = require('../electron/atalhos.cjs');

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

console.log('\nnormalizar');
caso('a ordem dos modificadores não conta', () => {
  assert.equal(a.normalizar('shift+ctrl+p'), 'Ctrl+Shift+P');
  assert.equal(a.normalizar('Control+Shift+P'), 'Ctrl+Shift+P');
  assert.equal(a.normalizar('CommandOrControl+Alt+Right'), 'Ctrl+Alt+Right');
});
caso('Plus é a tecla +, e F-teclas até F24', () => {
  assert.equal(a.normalizar('Ctrl+Plus'), 'Ctrl+Plus');
  assert.equal(a.normalizar('F24'), 'F24');
  assert.equal(a.normalizar('F25'), null);
});
caso('lixo não passa', () => {
  for (const x of ['', 'Ctrl', 'Ctrl+A+B', 'Ctrl+Escape', 'AltGr+7', 'Ctrl+ç', 42, null, 'x'.repeat(80)]) {
    assert.equal(a.normalizar(x), null, String(x));
  }
});

console.log('\nvalidar');
caso('um atalho global precisa de um modificador a sério', () => {
  assert.equal(a.validar('P').erro, 'sem-modificador');
  assert.equal(a.validar('Shift+P').erro, 'sem-modificador');
  assert.equal(a.validar('Ctrl+Shift+P').ok, true);
  assert.equal(a.validar('Super+Alt+Space').ok, true);
});
caso('F13 a F24 podem ir sozinhas (teclas programáveis); F5 não', () => {
  assert.equal(a.validar('F13').ok, true);
  assert.equal(a.validar('F5').erro, 'sem-modificador');
});

console.log('\na tecla carregada na página');
caso('usa a posição da tecla, não o carácter que o Shift ou o AltGr fazem', () => {
  assert.equal(a.doEvento({ code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+1');
  assert.equal(a.doEvento({ code: 'KeyP', key: 'p', ctrlKey: true, altKey: true }), 'Ctrl+Alt+P');
  assert.equal(a.doEvento({ code: 'ArrowRight', ctrlKey: true, metaKey: true }), 'Ctrl+Super+Right');
  assert.equal(a.doEvento({ code: 'Comma', altKey: true }), 'Alt+,');
});
caso('só modificadores ainda não é um atalho', () => {
  assert.equal(a.doEvento({ code: 'ControlLeft', ctrlKey: true }), null);
  assert.equal(a.doEvento({ code: 'ShiftRight', shiftKey: true }), null);
});
caso('o que sai do evento passa na normalização', () => {
  const x = a.doEvento({ code: 'Numpad5', ctrlKey: true, shiftKey: true });
  assert.equal(a.normalizar(x), 'Ctrl+Shift+5');
});

console.log('\nAltGr num teclado português');
caso('Ctrl+Alt+7 é a { e avisa', () => {
  assert.equal(a.avisoDeAltGr('Ctrl+Alt+7'), '{');
  assert.equal(a.avisoDeAltGr('Alt+Ctrl+E'), '€');
});
caso('com Shift ou outra combinação não avisa', () => {
  assert.equal(a.avisoDeAltGr('Ctrl+Alt+Shift+7'), null);
  assert.equal(a.avisoDeAltGr('Ctrl+Alt+P'), null);
  assert.equal(a.avisoDeAltGr('Ctrl+7'), null);
});

console.log('\nguardar');
caso('nenhum atalho por omissão', () => {
  assert.deepEqual(a.lerAtalhos(undefined), {});
  assert.deepEqual(a.lerAtalhos({}), {});
});
caso('o ficheiro só dá entradas válidas de ações conhecidas, sem repetidos', () => {
  assert.deepEqual(a.lerAtalhos({
    'tocar-pausa': 'ctrl+alt+space', seguinte: 'P', 'formatar-disco': 'Ctrl+Alt+F', anterior: 'Ctrl+Alt+Space',
  }), { 'tocar-pausa': 'Ctrl+Alt+Space' });
});
caso('definir: grava, tira e recusa a mesma tecla em duas ações', () => {
  let r = a.definir({}, 'seguinte', 'ctrl+alt+right');
  assert.deepEqual(r, { ok: true, atalhos: { seguinte: 'Ctrl+Alt+Right' }, accelerator: 'Ctrl+Alt+Right' });
  r = a.definir(r.atalhos, 'anterior', 'Alt+Ctrl+Right');
  assert.deepEqual(r, { ok: false, erro: 'em-uso-na-app', outra: 'seguinte' });
  r = a.definir({ seguinte: 'Ctrl+Alt+Right' }, 'seguinte', 'Ctrl+Alt+Right');
  assert.equal(r.ok, true, 'voltar a gravar a mesma na mesma ação não é conflito');
  r = a.definir({ seguinte: 'Ctrl+Alt+Right' }, 'seguinte', null);
  assert.deepEqual(r.atalhos, {});
});
caso('uma ação fora da lista é recusada', () => {
  assert.equal(a.definir({}, 'eval', 'Ctrl+Alt+E').erro, 'acao-desconhecida');
  assert.equal(a.definir({}, '__proto__', 'Ctrl+Alt+E').erro, 'acao-desconhecida');
});
caso('a janela e o mini leitor são do processo principal', () => {
  assert.deepEqual([...a.DO_PROCESSO_PRINCIPAL].sort(), ['mini-leitor', 'mostrar-janela']);
  for (const x of a.DO_PROCESSO_PRINCIPAL) assert.ok(a.ACOES.includes(x));
});

if (falhas) { console.error(`\n  ${falhas} caso(s) a falhar.\n`); process.exit(1); }
console.log('\n  Atalhos: normalização, validação, teclas, AltGr e gravação passaram.\n');

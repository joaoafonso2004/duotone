// A barra de tarefas do Windows (10/10): botões da miniatura e lista de saltos.
// Correr: node scripts/test-barra-de-tarefas.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const b = require('../electron/barraDeTarefas.cjs');

// As tarefas são os atalhos do ícone do iPhone, com os mesmos nomes.
const doIphone = readFileSync(path.join(raiz, 'src/lib/atalhosDoIcone.ts'), 'utf8');
for (const t of b.TAREFAS) {
  assert.match(doIphone, new RegExp(`acao: '${t.acao}', titulo: '${t.titulo}'`), `${t.acao} é o mesmo do iPhone`);
}

// Os argumentos: só as três ações, e nada que venha colado a outra coisa.
assert.equal(b.acaoDosArgumentos(['Duotone.exe', '--duotone-acao=mistura-do-dia']), 'mistura-do-dia');
assert.equal(b.acaoDosArgumentos(['Duotone.exe', '--duotone-acao=apagar-tudo']), null);
assert.equal(b.acaoDosArgumentos(['Duotone.exe', 'x--duotone-acao=continuar']), null);
assert.equal(b.acaoDosArgumentos(['Duotone.exe']), null);
assert.equal(b.acaoDosArgumentos(null), null);

assert.equal(b.estadoValido({ aTocar: 'sim', temFaixa: true }), null);
assert.deepEqual(b.estadoValido({ aTocar: true, temFaixa: true, extra: 1 }), { aTocar: true, temFaixa: true });

// Os botões: sempre três, pela ordem do leitor; o do meio diz o que faz.
const aTocar = b.botoesDaMiniatura({ aTocar: true, temFaixa: true });
assert.deepEqual(aTocar.map((x) => x.atalho), ['anterior', 'tocar-pausa', 'seguinte']);
assert.equal(aTocar[1].icone, 'pausa');
assert.equal(aTocar[1].dica, 'Pause');
assert.equal(b.botoesDaMiniatura({ aTocar: false, temFaixa: true })[1].icone, 'tocar');
const semFaixa = b.botoesDaMiniatura({ aTocar: false, temFaixa: false });
assert.equal(semFaixa.length, 3, 'sem música a miniatura não muda de forma');
assert.ok(semFaixa.every((x) => x.flags.includes('disabled')), 'mas os botões ficam apagados');
const atalhos = readFileSync(path.join(raiz, 'electron/atalhos.cjs'), 'utf8');
for (const x of aTocar) assert.ok(atalhos.includes(`'${x.atalho}'`), `${x.atalho} é uma ação dos atalhos`);

// Os ícones: BGRA pré-multiplicado, cantos vazios, forma lá dentro.
const alfa = (buf, lado, x, y) => buf[(y * lado + x) * 4 + 3];
for (const lado of [16, 32]) {
  for (const nome of Object.keys(b.FORMAS)) {
    const buf = b.desenharIcone(nome, lado, [255, 255, 255]);
    assert.equal(buf.length, lado * lado * 4);
    for (let i = 0; i < buf.length; i += 4) {
      assert.ok(buf[i] <= buf[i + 3] && buf[i + 1] <= buf[i + 3] && buf[i + 2] <= buf[i + 3], 'pré-multiplicado');
    }
    assert.equal(alfa(buf, lado, 0, 0), 0, `${nome}: canto vazio`);
    assert.equal(alfa(buf, lado, lado - 1, lado - 1), 0);
    assert.equal(alfa(buf, lado, Math.floor(lado * 0.5), Math.floor(lado * 0.5)) > 0 || nome === 'pausa', true, `${nome}: cheio ao meio`);
  }
  const pausa = b.desenharIcone('pausa', lado, [255, 255, 255]);
  const meio = lado / 2;
  assert.equal(alfa(pausa, lado, meio, meio), 0, 'a pausa tem o vão entre as barras');
  assert.equal(alfa(pausa, lado, Math.floor(lado * 5 / 16), meio), 255, 'e as barras cheias');
}
const escuro = b.desenharIcone('tocar', 16, b.corDosIcones(false));
const i = (8 * 16 + 7) * 4;
assert.ok(escuro[i + 3] === 255 && escuro[i] < 60, 'numa barra clara os ícones são escuros');
assert.deepEqual(b.corDosIcones(true), [255, 255, 255]);

// A ligação: o main.cjs usa isto, valida quem pede e volta a pôr os botões ao mostrar.
const main = readFileSync(path.join(raiz, 'electron/main.cjs'), 'utf8');
assert.match(main, /setThumbarButtons/);
assert.match(main, /setUserTasks/);
assert.match(main, /ipcMain\.on\('barra:estado', \(event, estado\) => \{\s*if \(!daJanelaPrincipal\(event\)\) return;/, 'só a janela principal manda o estado');
assert.match(main, /ipcMain\.handle\('barra:acao-pendente', \(event\) => \{\s*if \(!daJanelaPrincipal\(event\)\) return null;/);
assert.match(main, /win\.on\('show', \(\) => porBotoesNaMiniatura\(\)\)/, 'o Windows esquece os botões ao esconder');
console.log('Barra de tarefas: botões na miniatura, lista de saltos e ícones desenhados passaram.');

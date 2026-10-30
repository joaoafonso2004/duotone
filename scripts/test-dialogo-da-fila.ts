/**
 * O diálogo "Save queue as playlist" do PC (30/10): o botão Save da fila abria o
 * diálogo, mas os cliques nos botões iam parar à fila. Cada View do
 * react-native-web tem `z-index: 0`, e o diálogo (`absolute`, `inset: 0`), dentro
 * da cabeça da fila, ficava preso a essa camada: o véu só cobria a cabeça, e a
 * parte do diálogo que passa para baixo dela ficava por baixo da lista, que vem
 * depois no DOM. Num portal com um contentor fixo, cobre a janela e recebe o rato.
 *
 * Correr: node --experimental-strip-types scripts/test-dialogo-da-fila.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const fonte = ler('src/desktop/FilaDoLeitor.web.tsx');
const dialogo = fonte.indexOf('<Dialog open title="Save queue as playlist"');

console.log('\no diálogo de guardar a fila');
caso('o diálogo existe e já não é o `open={...}` solto na cabeça da fila', () => {
  assert.ok(dialogo > 0, 'o diálogo não está no FilaDoLeitor.web.tsx');
  assert.ok(!fonte.includes('<Dialog open={!!fila.aGuardar}'));
});
caso('só existe aberto, num portal para o body com um contentor fixo por cima de tudo', () => {
  const antes = fonte.slice(0, dialogo);
  const abertura = antes.lastIndexOf('{fila.aGuardar ? createPortal(');
  assert.ok(abertura > 0, 'falta `fila.aGuardar ? createPortal(` antes do diálogo');
  const contentor = antes.slice(abertura);
  assert.match(contentor, /position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 310/);
  assert.match(fonte.slice(dialogo), /document\.body,\n\s*\) : null\}/);
});
caso('o `createPortal` vem do react-dom, como nos outros portais do PC', () => {
  assert.match(fonte, /const \{ createPortal \} = require\('react-dom'\)/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

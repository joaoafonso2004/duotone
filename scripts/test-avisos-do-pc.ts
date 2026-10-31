/**
 * Os avisos do PC dizem o tipo, e os erros falam para pessoas (A1, 31/10).
 *
 * O `Toast` adivinhava o tipo pelo texto (`/failed|could not|…/`): "No
 * connection…" e "Couldn't…" saíam com o visto verde de sucesso, durante 3,2 s.
 * E 29 `notify(e?.message || …)` punham "Failed to fetch" ou "JWT expired" no
 * ecrã. Agora o tipo vem com o aviso, os erros vão pelo `avisarErro` e a frase
 * pelo `mensagemDeErro`. Lê o código como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-avisos-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function webDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n);
    return statSync(f).isDirectory() ? webDe(f) : /\.web\.tsx?$/.test(n) ? [f] : [];
  });
}
const DO_PC = webDe('src').map((f) => ({ f: f.replace(/\\/g, '/'), s: ler(f) }));

console.log('\no toast');
const UI = ler('src/desktop/ui.web.tsx');
const toast = UI.slice(UI.indexOf('export function Toast('), UI.indexOf('\n}\n', UI.indexOf('export function Toast(')));
caso('o tipo chega por props e não se adivinha pelo texto', () => {
  assert.match(toast, /tipo = 'feito'/);
  assert.ok(!/toLowerCase|\.test\(/.test(toast), 'nada de expressões sobre a mensagem');
});
caso('dura o que o aviso diz (um erro lê-se com mais calma)', () => {
  assert.match(toast, /duracaoDoAviso\(\{ tipo \}\)/);
  assert.ok(!/3200/.test(toast));
});
caso('a raiz passa o tipo: o dos avisos partilhados, o das notícias de reprodução', () => {
  const raiz = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(raiz, /<Toast message=\{toast\.texto\} tipo=\{toast\.tipo\}/);
  assert.match(raiz, /a\.tipo \?\? 'feito'\);/);
  assert.match(raiz, /d\?\.tipo \?\? 'erro'/);
});

console.log('\nos erros');
caso('nenhum `e.message` cru na interface do PC', () => {
  const crus = DO_PC.flatMap(({ f, s }) => s.split('\n').map((l, i) => ({ f, i: i + 1, l }))
    .filter(({ l }) => /\b(?:e|err|error)\??\.message\b/.test(l)));
  assert.deepEqual(crus.map(({ f, i }) => `${f}:${i}`), []);
});
caso('um erro não vai pelo `notify` (sairia como sucesso)', () => {
  const errados = DO_PC.flatMap(({ f, s }) => s.split('\n').map((l, i) => ({ f, i: i + 1, l }))
    .filter(({ l }) => /\bnotify\((?:(?!avisarErro).)*(?:Could not|Couldn't|failed|mensagemDeErro\()/.test(l)));
  assert.deepEqual(errados.map(({ f, i }) => `${f}:${i}`), []);
});
caso('a app fala com contrações: "Couldn\'t", nunca "Could not", nos avisos do PC', () => {
  const formais = DO_PC.flatMap(({ f, s }) => s.split('\n').map((l, i) => ({ f, i: i + 1, l }))
    .filter(({ l }) => /avisar(?:Erro|Info|Feito)\([^)]*Could not/.test(l)));
  assert.deepEqual(formais.map(({ f, i }) => `${f}:${i}`), []);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

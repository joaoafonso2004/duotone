/**
 * A abertura: o ficheiro e o código têm de concordar.
 *
 * A animação vive dentro do `assets/abertura.webp` e quem decide quando ela
 * sai é um temporizador em `components/Abertura.tsx`, com os tempos de
 * `lib/abertura.ts`. Nada liga os dois a não ser este teste. Lê os blocos do
 * WebP (RIFF) diretamente -- sem biblioteca de imagem -- e confirma o que a app
 * assume sobre ele.
 */
import { readFileSync } from 'node:fs';
import { ABERTURA } from '../src/lib/abertura.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const b = readFileSync(new URL('../assets/abertura.webp', import.meta.url));
const u24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

let flags = 0;
let largura = 0;
let altura = 0;
let loop = -1;
const duracoes: number[] = [];
for (let i = 12; i + 8 <= b.length;) {
  const tag = b.toString('latin1', i, i + 4);
  const n = b.readUInt32LE(i + 4);
  const d = i + 8;
  if (tag === 'VP8X') { flags = b[d]; largura = u24(d + 4) + 1; altura = u24(d + 7) + 1; }
  if (tag === 'ANIM') loop = b.readUInt16LE(d + 4);
  if (tag === 'ANMF') duracoes.push(u24(d + 12));
  i = d + n + (n & 1);
}
const ultimo = duracoes.at(-1) ?? 0;
const animacao = duracoes.slice(0, -1).reduce((a, x) => a + x, 0);

check('é um WebP', b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP');
check('é animado', (flags & 0x02) !== 0 && duracoes.length > 30, `${duracoes.length} fotogramas`);
// Sem alfa via-se o quadrado da imagem por cima do fundo da app.
check('tem transparência', (flags & 0x10) !== 0);
check('é quadrado de 720', largura === 720 && altura === 720, `${largura}x${altura}`);
// O `loop` do WebP é o número de voltas; 0 seria para sempre.
check('toca uma vez', loop === 1, `loop = ${loop}`);
// O último fotograma muda pela última vez aqui. Tem de ser antes de a app
// sair, senão corta-se o reflexo -- e não muito antes, senão sobra um logo
// parado a fazer esperar quem abriu a app.
check('a animação cabe no tempo da app', animacao <= ABERTURA.animacaoMs, `${animacao} ms`);
check('e não sobra muito tempo parado', animacao >= ABERTURA.animacaoMs - 150, `${animacao} ms`);
// Se algum leitor ignorasse o loop, o recomeço ficava depois do teto.
check('o fim fica parado para lá do teto', ultimo >= ABERTURA.tetoMs + ABERTURA.saidaMs, `${ultimo} ms`);
check('não pesa mais de 1,5 MB', b.length <= 1.5 * 1024 * 1024, `${(b.length / 1024).toFixed(0)} KB`);
check('a abertura sai antes do teto', ABERTURA.animacaoMs + ABERTURA.seguraMs < ABERTURA.tetoMs);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

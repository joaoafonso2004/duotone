/**
 * A base do "dois tons" do PC (30/10, passo 0 de `docs/PLANO-ELEVAR-PC.md`): a
 * capa a dois tons que revela a cor ao tocar-lhe, e o brilho de metal que segue
 * o cursor. Duas partes: a conta pura (`lib/doisTons.ts`) e as regras da casca,
 * lidas como TEXTO como os outros testes do PC (o RNW deita o `className` fora;
 * as marcas e o CSS têm de casar -- ver `test-animacoes-do-pc.ts`).
 *
 * Correr: node --experimental-strip-types scripts/test-dois-tons.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { molduraSemBarras } from '../src/lib/modoLimpo.ts';
import { posicaoNoCartao, SEM_BARRAS, TOM_CLARO, TOM_ESCURO } from '../src/lib/doisTons.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const CASCA = ler('src/desktop/casca.web.tsx');
const COMPONENTE = ler('src/desktop/duotone.web.tsx');

console.log('\na posição do rato no cartão');
caso('é a distância ao canto do cartão, em píxeis', () => {
  assert.deepEqual(posicaoNoCartao({ left: 100, top: 50, width: 200, height: 120 }, 130, 80), { mx: '30px', my: '30px' });
});
caso('um rato fora do cartão fica apertado no limite', () => {
  const r = { left: 100, top: 50, width: 200, height: 120 };
  assert.deepEqual(posicaoNoCartao(r, 20, 400), { mx: '0px', my: '120px' });
  assert.deepEqual(posicaoNoCartao(r, 900, -30), { mx: '200px', my: '0px' });
});
caso('sem tamanho, ou com números que não são números, o brilho fica ao centro', () => {
  assert.deepEqual(posicaoNoCartao({ left: 0, top: 0, width: 0, height: 0 }, 5, 5), { mx: '50%', my: '50%' });
  assert.deepEqual(posicaoNoCartao({ left: 0, top: 0, width: 10, height: 10 }, NaN, 5), { mx: '50%', my: '50%' });
});

console.log('\nas capas com barras pretas do YouTube');
caso('a moldura em percentagens é a de `molduraSemBarras`', () => {
  const m = molduraSemBarras(100);
  const pct = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2)}%`;
  assert.equal(SEM_BARRAS.width, pct(m.largura));
  assert.equal(SEM_BARRAS.height, pct(m.altura));
  assert.equal(SEM_BARRAS.left, pct(m.esquerda));
  assert.equal(SEM_BARRAS.top, pct(m.topo));
});

console.log('\nas regras da casca');
caso('os dois tons são variáveis, com os valores por omissão da lib', () => {
  assert.match(CASCA, /:root\{ --duo-baixo: \$\{TOM_ESCURO\}; --duo-alto: \$\{TOM_CLARO\}; \}/);
  assert.match(CASCA, /import \{ TOM_CLARO, TOM_ESCURO \} from '\.\.\/lib\/doisTons';/);
  assert.match(TOM_ESCURO, /^#[0-9a-f]{6}$/i);
  assert.match(TOM_CLARO, /^#[0-9a-f]{6}$/i);
});
caso('a cor volta ao passar o rato no cartão, no quadro, ou nunca vai embora numa capa viva', () => {
  const regra = CASCA.match(/\[data-dt~="cartao"\]:hover \[data-dt~="duo-tom"\][^{]*\{ opacity: 0; \}/)?.[0] ?? '';
  for (const parte of ['[data-dt~="cartao"]:focus-within [data-dt~="duo-tom"]', '[data-dt~="duo"]:hover [data-dt~="duo-tom"]',
    '[data-dt~="duo"][data-dt~="duo-viva"] [data-dt~="duo-tom"]']) {
    assert.ok(regra.includes(parte), `falta: ${parte}`);
  }
});
caso('a camada a cinzentos multiplica e a sombra aclara, as duas com dois seletores', () => {
  assert.match(CASCA, /\[data-dt~="duo"\] \[data-dt~="duo-tom-img"\]\{ filter: grayscale\(1\)[^}]*mix-blend-mode: multiply; \}/);
  assert.match(CASCA, /\[data-dt~="duo"\] \[data-dt~="duo-sombra"\]\{ background: var\(--duo-baixo\); mix-blend-mode: lighten; \}/);
  assert.match(CASCA, /\[data-dt~="duo"\] \[data-dt~="duo-tom"\]\{ background: var\(--duo-alto\)/);
});
caso('só o desvanecer da cor e a luz usam transição, e só de opacidade', () => {
  const duo = CASCA.match(/\[data-dt~="duo"\] \[data-dt~="duo-tom"\]\{[^}]*\}/)?.[0] ?? '';
  assert.match(duo, /transition: opacity 550ms/);
  const brilho = CASCA.match(/\[data-dt~="brilho"\]::after\{[^}]*\}/)?.[0] ?? '';
  assert.match(brilho, /transition: opacity 350ms/);
  assert.match(brilho, /radial-gradient\(220px circle at var\(--mx, 50%\) var\(--my, 50%\)/);
  assert.match(CASCA, /\[data-dt~="brilho"\]:hover::after\{ opacity: 1; \}/);
});
caso('quem pediu menos movimento fica sem as duas transições', () => {
  const i = CASCA.lastIndexOf('prefers-reduced-motion');
  const bloco = CASCA.slice(i);
  assert.ok(bloco.includes('[data-dt~="duo"] [data-dt~="duo-tom"], [data-dt~="brilho"]::after{ transition: none !important; }'));
});
caso('nada de backdrop-filter, nem na casca nem no componente', () => {
  assert.ok(!/backdrop-filter/.test(COMPONENTE));
  assert.ok(!/backdrop-filter\s*:/.test(CASCA));
});

console.log('\no componente e o ouvinte');
caso('a capa só se marca com `marcar`, sem className, e a camada de cima não se lê em voz alta', () => {
  assert.ok(!/className\s*[=:]/.test(COMPONENTE.replace(/\/\*[\s\S]*?\*\//g, '')));
  for (const m of ["marcar('duo')", "marcar('duo', 'duo-viva')", "marcar('duo', 'brilho')", "marcar('duo', 'duo-viva', 'brilho')",
    "marcar('duo-tom')", "marcar('duo-tom-img')", "marcar('duo-sombra')"]) assert.ok(COMPONENTE.includes(m), `falta ${m}`);
  assert.match(COMPONENTE, /marcar\('duo-tom'\)\} aria-hidden pointerEvents="none"/);
});
caso('o ouvinte é um só, passivo, e uma escrita por fotograma', () => {
  assert.equal((COMPONENTE.match(/addEventListener\('mousemove'/g) ?? []).length, 1);
  assert.match(COMPONENTE, /\{ passive: true \}/);
  assert.match(COMPONENTE, /if \(!quadro\) quadro = requestAnimationFrame\(pintar\)/);
  assert.match(COMPONENTE, /if \(brilhoLigado \|\| typeof document === 'undefined'\) return;/);
});
caso('com menos movimento o ouvinte não escreve a posição', () => {
  assert.match(COMPONENTE, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return;/);
});
caso('a casca liga o ouvinte uma vez, ao injetar o CSS, depois de o escrever', () => {
  assert.match(CASCA, /document\.title = 'Duotone';\n  ligarBrilhoDoCursor\(\);\n\}/);
  assert.match(CASCA, /import \{ ligarBrilhoDoCursor \} from '\.\/duotone\.web';/);
  assert.equal((CASCA.match(/ligarBrilhoDoCursor\(\)/g) ?? []).length, 1);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

/**
 * A Passagem de luz (C6 da auditoria de 31/10, só o PC): numa viagem entre páginas,
 * a lateral e a barra ficam, a página nova sobe 8 px com a mola ENTRADA, e a luz
 * passa pelo topo dela, da direita ao abrir e da esquerda ao voltar. As contas são
 * puras (`lib/luz.ts`); a ligação lê-se como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-passagem-de-luz.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alturaDaPassagem, direcaoDaPassagem, OPACIDADE_DA_BANDA, OPACIDADE_DA_PASSAGEM, trajetoDaBanda } from '../src/lib/luz.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const CASCA = ler('src/desktop/casca.web.tsx');
const LUZ = ler('src/desktop/Luz.web.ts');
const TRANSICAO = ler('src/desktop/TransicaoDePagina.web.tsx');

console.log('\na luz');
caso('ao abrir, a banda vem da direita; ao voltar, da esquerda', () => {
  const abrir = trajetoDaBanda(direcaoDaPassagem(false));
  const voltar = trajetoDaBanda(direcaoDaPassagem(true));
  assert.equal(abrir.eixo, 'x');
  assert.ok(abrir.de > abrir.para, 'ao abrir anda para a esquerda');
  assert.equal(voltar.eixo, 'x');
  assert.ok(voltar.de < voltar.para, 'ao voltar anda para a direita');
});
caso('é mais fraca do que nos avisos, e a faixa é mais alta ao abrir', () => {
  assert.ok(OPACIDADE_DA_PASSAGEM < OPACIDADE_DA_BANDA);
  assert.ok(alturaDaPassagem(false) > alturaDaPassagem(true));
});
caso('anda com a mesma porta dos avisos (o travão, uma luz de cada vez, o degrau)', () => {
  const corpo = LUZ.slice(LUZ.indexOf('export function passarLuzNaPagina'));
  assert.match(corpo, /varrerLuz\(faixa, direcaoDaPassagem\(volta\), 0, OPACIDADE_DA_PASSAGEM\);/);
  assert.ok(!/\.animate\(/.test(corpo), 'não anima à parte');
});
caso('a faixa não apanha cliques, corta a banda e sai sozinha, mesmo com a janela escondida', () => {
  const corpo = LUZ.slice(LUZ.indexOf('export function passarLuzNaPagina'));
  assert.match(corpo, /pointerEvents: 'none'/);
  assert.match(corpo, /overflow: 'hidden'/);
  assert.match(corpo, /setTimeout\(\(\) => faixa\.remove\(\), LUZ_MS \+ 200\);/);
});

console.log('\nquem a pede');
caso('só numa viagem, e não ao mudar de separador', () => {
  assert.match(TRANSICAO, /if \(document\.documentElement\.hasAttribute\('data-viagem'\)\) passarLuzNaPagina\(no, volta\);/);
  const viagem = ler('src/desktop/viagem.web.ts');
  assert.match(viagem, /if \(!origem \|\| aChegar \|\| !podeViajar\(\)\) \{ mudar\(\); return; \}/);
});
caso('não pede a luz antes de haver página (a primeira vez não é uma viagem)', () => {
  assert.ok(TRANSICAO.indexOf('primeira.current = false') < TRANSICAO.indexOf('passarLuzNaPagina(no, volta)'));
});

caso('uma viagem que começa com a anterior a acabar não perde as marcas para o limpar dela', () => {
  const viagem = ler('src/desktop/viagem.web.ts');
  assert.equal((viagem.match(/const esta = \+\+viagemAtual;/g) ?? []).length, 2, 'as duas portas');
  assert.equal((viagem.match(/if \(esta === viagemAtual\) \{ raiz\.removeAttribute\('data-viagem'\); aChegar = null; \}/g) ?? []).length, 2);
});

console.log('\no CSS');
caso('só a página tem o nome, e só durante a viagem', () => {
  assert.match(CASCA, /html\[data-viagem\] \[data-dt~="pagina-da-janela"\]\{ view-transition-name: dt-pagina; \}/);
  assert.equal((TRANSICAO.match(/'pagina-da-janela'/g) ?? []).length, 2);
  const outros = ler('src/components/ShareFriendSheet.web.tsx');
  assert.ok(!outros.includes('pagina-da-janela'), 'duas com o mesmo nome abortavam a viagem');
});
caso('a nova sobe 8 px com a ENTRADA, a de agora sai com a curva de sair', () => {
  assert.match(CASCA, /::view-transition-new\(dt-pagina\)\{ animation: dt-vt-entra var\(--dt-entrada-ms\) var\(--dt-entrada\) both; \}/);
  assert.match(CASCA, /::view-transition-old\(dt-pagina\)\{ animation: dt-vt-sai var\(--dt-sair-ms\) var\(--dt-sair\) both; \}/);
  assert.match(CASCA, /@keyframes dt-vt-entra\{ from\{ opacity:0; transform: translateY\(8px\); \} \}/);
});
caso('o que sobe é cortado na caixa da página: não passa por cima da barra', () => {
  assert.match(CASCA, /::view-transition-group\(dt-pagina\)\{ overflow: clip; \}/);
});
caso('com menos movimento nada anda', () => {
  assert.match(CASCA, /@media \(prefers-reduced-motion: reduce\)\{\n\s+::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\)\{ animation: none !important; \}/);
  assert.match(ler('src/desktop/viagem.web.ts'), /prefers-reduced-motion: reduce/);
});
caso('a entrada de sempre continua calada numa viagem: não sobe duas vezes', () => {
  assert.match(TRANSICAO, /if \(volta \|\| document\.documentElement\.hasAttribute\('data-viagem'\)\) no\.setAttribute\('data-chegada', 'calada'\);/);
  assert.match(CASCA, /\[data-dt~="pagina"\]\[data-chegada="calada"\],/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

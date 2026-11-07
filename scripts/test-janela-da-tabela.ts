/**
 * A janela das tabelas do PC -- src/lib/janelaDaTabela.ts, e a TrackTable que a usa.
 *
 * Correr: node --experimental-strip-types scripts/test-janela-da-tabela.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEGRAU, MARGEM_DE_LINHAS, SEM_JANELA_ATE, alturaDasLinhas, janelaComALinha, janelaDaTabela,
  linhaEm, mesmaJanela, scrollParaVer, topoDaLinha,
} from '../src/lib/janelaDaTabela.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const H = 52;
console.log('\no custo não depende do tamanho da lista');
caso('na faixa 1500 de 3000 monta-se uma mão-cheia de linhas, e não 1500', () => {
  const j = janelaDaTabela({ topoVisivel: 1500 * H, alturaVisivel: 800, alturaDaLinha: H, total: 3000 });
  assert.ok(j.inicio <= 1500 && j.fim >= 1500 + Math.ceil(800 / H), 'o que se vê está montado');
  assert.ok(j.fim - j.inicio <= Math.ceil(800 / H) + 2 * (MARGEM_DE_LINHAS + DEGRAU), `${j.fim - j.inicio} linhas`);
});
caso('o mesmo número de linhas no topo, a meio e no fim de uma lista de 5000', () => {
  const n = (y: number) => { const j = janelaDaTabela({ topoVisivel: y, alturaVisivel: 900, alturaDaLinha: H, total: 5000 }); return j.fim - j.inicio; };
  assert.ok(Math.abs(n(2500 * H) - n(100 * H)) <= DEGRAU);
  assert.ok(n(4980 * H) <= n(2500 * H));
});
caso('uma lista curta monta-se toda, como antes', () => {
  assert.deepEqual(janelaDaTabela({ topoVisivel: 0, alturaVisivel: 900, alturaDaLinha: H, total: SEM_JANELA_ATE }), { inicio: 0, fim: SEM_JANELA_ATE });
  assert.deepEqual(janelaDaTabela({ topoVisivel: 0, alturaVisivel: 900, alturaDaLinha: H, total: 0 }), { inicio: 0, fim: 0 });
});

console.log('\nrolar dentro de um degrau não redesenha');
caso('uns píxeis para baixo dão a mesma janela', () => {
  const a = janelaDaTabela({ topoVisivel: 800 * H, alturaVisivel: 900, alturaDaLinha: H, total: 3000 });
  const b = janelaDaTabela({ topoVisivel: 800 * H + 30, alturaVisivel: 900, alturaDaLinha: H, total: 3000 });
  assert.ok(mesmaJanela(a, b));
});
caso('as pontas da janela caem nos degraus', () => {
  const j = janelaDaTabela({ topoVisivel: 777 * H + 13, alturaVisivel: 900, alturaDaLinha: H, total: 3000 });
  assert.equal(j.inicio % DEGRAU, 0);
  assert.equal(j.fim % DEGRAU, 0);
});
caso('com a tabela ainda abaixo do ecrã, a janela começa no topo', () => {
  const j = janelaDaTabela({ topoVisivel: -400, alturaVisivel: 900, alturaDaLinha: H, total: 3000 });
  assert.equal(j.inicio, 0);
  assert.ok(j.fim >= Math.ceil(500 / H));
});
caso('no fim não passa do total', () => {
  const j = janelaDaTabela({ topoVisivel: 2995 * H, alturaVisivel: 900, alturaDaLinha: H, total: 3000 });
  assert.equal(j.fim, 3000);
  assert.ok(j.inicio < 3000);
});

console.log('\nas posições e a divisória');
const d = { antesDe: 10, altura: 40 };
caso('a divisória empurra as linhas a partir dela', () => {
  assert.equal(topoDaLinha(9, H, 100, d), 9 * H);
  assert.equal(topoDaLinha(10, H, 100, d), 10 * H + 40);
  assert.equal(alturaDasLinhas(100, H, d), 100 * H + 40);
});
caso('a divisória antes da primeira ou depois da última não existe (a tabela não a desenha)', () => {
  assert.equal(alturaDasLinhas(100, H, { antesDe: 0, altura: 40 }), 100 * H);
  assert.equal(alturaDasLinhas(100, H, { antesDe: 100, altura: 40 }), 100 * H);
});
caso('a linha num ponto conta com a divisória', () => {
  assert.equal(linhaEm(10 * H - 1, H, 100, d), 9);
  assert.equal(linhaEm(10 * H + 20, H, 100, d), 10, 'em cima da divisória é a seguinte');
  assert.equal(linhaEm(10 * H + 40 + H + 1, H, 100, d), 11);
  assert.equal(linhaEm(1e9, H, 100, d), 100);
});
caso('sem medidas não rebenta', () => {
  assert.equal(linhaEm(500, 0, 100), 0);
});

console.log('\no teclado e o atalho levam a uma linha que não está montada');
caso('a janela passa a ter a linha pedida (e a que já a tinha fica igual)', () => {
  const j = { inicio: 0, fim: 48 };
  assert.equal(janelaComALinha(j, 20, 3000), j);
  const k = janelaComALinha(j, 2000, 3000);
  assert.ok(k.inicio <= 2000 && k.fim > 2000);
  assert.equal(janelaComALinha({ inicio: 0, fim: 48 }, 2999, 3000).fim, 3000);
});
caso('rola o mínimo para a pôr à vista, sem a deixar por baixo do que tapa em cima', () => {
  const base = { alturaVisivel: 800, origem: 300, altura: H, tapadoEmCima: 38 };
  assert.equal(scrollParaVer({ ...base, scrollTop: 0, topo: 100 * H }), 300 + 101 * H - 800, 'por baixo: fica rente ao fundo');
  assert.equal(scrollParaVer({ ...base, scrollTop: 20000, topo: 10 * H }), 300 + 10 * H - 38, 'por cima: fica rente ao topo');
  assert.equal(scrollParaVer({ ...base, scrollTop: 300, topo: 5 * H }), null, 'já à vista: não mexe');
});

console.log('\na TrackTable');
const ui = ler('src/desktop/ui.web.tsx');
const tabela = ui.slice(ui.indexOf('export function TrackTable('), ui.indexOf('const ALTURA_DO_CABECALHO'));
caso('já não monta por lotes que nunca saem', () => {
  assert.ok(!/LINHAS_INICIAIS|PASSO_DE_LINHAS|linhasVisiveisPorLista|CarregarAoChegar/.test(ui), 'os lotes saíram');
  assert.match(tabela, /useJanelaDaTabela\(/);
  assert.match(tabela, /tracks\.slice\(janela\.inicio, janela\.fim\)/);
});
caso('o espaço das que não estão montadas fica, para a barra e o scroll serem os de sempre', () => {
  assert.match(tabela, /janela\.inicio > 0 \? <View style=\{\{ height: geometria\.topo\(janela\.inicio\) \}\} \/> : null/);
  assert.match(tabela, /janela\.fim < tracks\.length \? <View style=\{\{ height: geometria\.alturaTotal\(\) - geometria\.topo\(janela\.fim\) \}\} \/> : null/);
});
caso('as linhas são memorizadas: mudar de música ou de janela não redesenha as outras', () => {
  assert.match(ui, /const LinhaDaTabela = React\.memo\(function LinhaDaTabela\(/);
  assert.match(tabela, /<LinhaDaTabela track=\{track\} index=\{index\} aTocar=\{aTocar\}/);
});
caso('o índice é o da lista inteira (o número, o teclado, o arrastar)', () => {
  assert.match(tabela, /const index = janela\.inicio \+ k;/);
  assert.match(ui, /const marca = entrar \? marcar\('fila', 'entra'\) : marcar\('fila'\);/);
  assert.match(ui, /dataSet=\{\{ \.\.\.marca\.dataSet, i: String\(index\) \}\}/);
});
caso('reordenar a arrastar conta com as linhas que ficaram de fora em cima', () => {
  assert.match(ui, /function alvoDaOrdem\(lista: string, aoMover: \(de: number, para: number\) => void, primeira: \(\) => number\): Alvo/);
  assert.match(ui, /para: destinoDaOrdem\(a\.origem\.indice!, primeira\(\) \+ antesDe\)/);
});
caso('ao rolar, a janela nova desenha-se no mesmo fotograma (sem um em branco num salto grande)', () => {
  assert.match(ui, /quadro = requestAnimationFrame\(\(\) => \{ quadro = 0; flushSync\(medir\); \}\)/);
});
const casca = ler('src/desktop/casca.web.tsx');
caso('as linhas que entram a rolar não fazem a animação de abrir a lista', () => {
  assert.match(casca, /\[data-dt~="lista"\]\[data-dt~="janela"\] \[data-dt~="fila"\]:not\(\[data-dt~="entra"\]\)\{ animation: none; \}/);
  assert.match(tabela, /marcar\('lista', 'janela'\)/);
});

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

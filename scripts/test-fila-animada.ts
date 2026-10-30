/**
 * A fila e o Radio do PC (30/10, passo 1 de `docs/PLANO-ELEVAR-PC.md`): o
 * Radio com Off / Like this / Mix à vista, o grupo da Radio no fim da fila, e as
 * animações do Clear e da troca da fila. A conta é pura (`lib/leitorDoPc.ts`);
 * o resto lê o código como TEXTO, como os outros testes do PC.
 *
 * Correr: node --experimental-strip-types scripts/test-fila-animada.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  atrasoDaLinha, DURACAO_DA_SAIDA_MS, esperaDaSaida, inicioDoGrupoDaRadio, LINHAS_ANIMADAS, PASSO_DA_SAIDA_MS, ROTULO_DO_GRUPO,
} from '../src/lib/leitorDoPc.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const CASCA = ler('src/desktop/casca.web.tsx');
const FILA = ler('src/desktop/FilaDoLeitor.web.tsx');
const LINHAS = ler('src/desktop/FilaArrastavel.web.tsx');
const RADIO = ler('src/desktop/RadioEmTresEstados.web.tsx');
const HOOK = ler('src/desktop/useFilaDoLeitor.web.ts');

console.log('\no grupo da Radio no fim da fila');
caso('começa na primeira da cauda feita só de músicas da Radio', () => {
  assert.equal(inicioDoGrupoDaRadio(['a', 'b', 'r1', 'r2'], ['r1', 'r2']), 2);
  assert.equal(inicioDoGrupoDaRadio(['r1', 'r2'], ['r1', 'r2']), 0, 'a fila toda da Radio: o grupo é tudo');
});
caso('uma da Radio no meio do que escolheste não abre grupo', () => {
  assert.equal(inicioDoGrupoDaRadio(['a', 'r1', 'b'], ['r1']), -1);
  assert.equal(inicioDoGrupoDaRadio(['r1', 'a', 'r2'], ['r1', 'r2']), 2, 'só conta o que vem seguido até ao fim');
});
caso('fila vazia, ou sem nada da Radio: sem grupo', () => {
  assert.equal(inicioDoGrupoDaRadio([], ['r1']), -1);
  assert.equal(inicioDoGrupoDaRadio(['a', 'b'], []), -1);
  assert.equal(inicioDoGrupoDaRadio(['a', 'b'], ['x']), -1);
});
caso('o separador diz o tipo, com os nomes do menu', () => {
  assert.deepEqual(Object.keys(ROTULO_DO_GRUPO), ['musica', 'mix']);
  assert.match(ROTULO_DO_GRUPO.musica, /songs like this one/);
  assert.match(ROTULO_DO_GRUPO.mix, /everything you play/);
});

console.log('\nos tempos das animações');
caso('só as primeiras linhas se escalonam; as outras saem com a última', () => {
  assert.equal(atrasoDaLinha(0, PASSO_DA_SAIDA_MS), 0);
  assert.equal(atrasoDaLinha(3, 10), 30);
  assert.equal(atrasoDaLinha(500, PASSO_DA_SAIDA_MS), LINHAS_ANIMADAS * PASSO_DA_SAIDA_MS);
  assert.equal(atrasoDaLinha(-4, 10), 0);
});
caso('a espera é a duração mais a última cascata, e não cresce com cem linhas', () => {
  assert.equal(esperaDaSaida(1), DURACAO_DA_SAIDA_MS + 60);
  assert.ok(esperaDaSaida(10) > esperaDaSaida(1));
  assert.equal(esperaDaSaida(100), esperaDaSaida(LINHAS_ANIMADAS + 1));
  assert.ok(esperaDaSaida(2000) < 1000, 'uma biblioteca inteira não demora um segundo a sair');
  assert.equal(esperaDaSaida(0), DURACAO_DA_SAIDA_MS + 60);
});

console.log('\nas regras da casca');
caso('as linhas saem, viram e entram, só com transform, opacidade e a altura a fechar', () => {
  for (const nome of ['np-fila-sai', 'np-fila-vira', 'np-fila-entra']) assert.ok(CASCA.includes(`.${nome}{`), `falta .${nome}`);
  for (const k of ['dt-fila-sai', 'dt-fila-vira', 'dt-fila-entra']) assert.ok(CASCA.includes(`@keyframes ${k}`), `falta @keyframes ${k}`);
  assert.match(CASCA, /\.np-fila-sai\{ pointer-events: none;/, 'sem cliques nem arrasto enquanto saem');
  assert.match(CASCA, /\.np-fila-vira\{ pointer-events: none;/);
  const bloco = CASCA.slice(CASCA.indexOf('@keyframes dt-fila-sai'), CASCA.indexOf('.np-fila-entra{'));
  assert.ok(!/(?<![-\w])(?:left|top|width|margin)\s*:/.test(bloco), 'as saídas não animam posição nem largura');
});
caso('as linhas fecham a altura, mesmo com o min-height inline que elas têm', () => {
  assert.match(CASCA, /max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0;/);
});
caso('quem pediu menos movimento fica sem nenhuma destas animações', () => {
  const i = CASCA.lastIndexOf('prefers-reduced-motion');
  const bloco = CASCA.slice(i);
  for (const parte of ['.np-fila-sai', '.np-fila-vira', '.np-fila-entra', '[data-dt~="grupo-radio"]',
    '[data-dt~="radio-onda"]', '[data-dt~="radio-anel"]']) assert.ok(bloco.includes(parte), `falta ${parte}`);
  assert.match(HOOK, /prefers-reduced-motion: reduce/, 'e não espera por uma saída que não vê');
});
caso('os arcos do Radio respiram só enquanto toca, e um anel abre-se quando a fila chega', () => {
  assert.match(CASCA, /\[data-dt~="radio-onda"\]\[data-dt~="radio-parado"\]\{ animation-play-state: paused; \}/);
  assert.match(CASCA, /\[data-dt~="radio-anel"\]\{ animation: dt-radio-anel 950ms/);
});
caso('nada de backdrop-filter', () => {
  assert.ok(!/backdrop-filter\s*:/.test(CASCA + FILA + RADIO + LINHAS));
});

console.log('\no Radio com os estados à vista');
caso('Off, Like this e Mix: um clique troca, e o tipo vai pelo mesmo caminho do iPhone', () => {
  assert.match(RADIO, /\{ id: 'off', rotulo: 'Off'/);
  assert.match(RADIO, /\{ id: 'musica', rotulo: 'Like this', descricao: 'Songs like this one' \}/);
  assert.match(RADIO, /\{ id: 'mix', rotulo: 'Mix'/);
  assert.match(RADIO, /radio\.escolher\(id\);/, 'ligar ou trocar de tipo é o `escolher` do hook partilhado');
  assert.match(RADIO, /if \(id === 'off'\) \{ if \(radio\.mode !== 'off'\) radio\.alternar\(\); return; \}/, 'Off é o `alternar` (a store pára o Radio)');
});
caso('a procurar só se pode desligar; sem rede ou sem faixa não faz nada', () => {
  assert.match(RADIO, /if \(radio\.reason \|\| aPreparar \|\| \(ligado && escolhido === id\)\) return;/);
});
caso('numa Jam sem o tipo há só Off e On, pelo `alternar`', () => {
  assert.match(RADIO, /const opcoes = radio\.comTipo \? PEDIDO : SIMPLES;/);
  assert.match(RADIO, /if \(!radio\.comTipo\) \{ radio\.alternar\(\); return; \}/);
  assert.match(ler('src/components/RadioQueueControl.tsx'), /comTipo: !emJam \|\| !!tipoDoJam,/);
});
caso('o pedido fica aceso enquanto procura, e o Undo continua ao lado', () => {
  assert.match(RADIO, /aPreparar && pedido \? pedido : radio\.tipo/);
  assert.match(RADIO, /accessibilityLabel="Undo Radio and restore previous queue"/);
});
caso('leitor de ecrã: um grupo de opções, cada uma escolhida ou não', () => {
  assert.match(RADIO, /accessibilityRole=\{'radiogroup' as any\}/);
  assert.match(RADIO, /accessibilityRole=\{'radio' as any\}/);
  assert.match(RADIO, /accessibilityState=\{\{ checked: aceso,/);
});
caso('o escolhido usa o estado da app, e o hover não se confunde com ele', () => {
  assert.match(RADIO, /aceso \? ESTADO\.escolhido : hovered && \{ backgroundColor: ESTADO\.hover \}/);
});
caso('a fila já não abre o menu do PC', () => {
  assert.match(FILA, /<RadioEmTresEstados \/>/);
  assert.ok(!FILA.includes('<MenuDoRadio'));
  assert.ok(!/className\s*[=:]/.test(RADIO.replace(/\/\*[\s\S]*?\*\//g, '')));
});

console.log('\nas linhas');
caso('a fila parte-se em duas listas, e a de baixo desloca as posições pelo tamanho da de cima', () => {
  assert.match(FILA, /aoMover=\{\(de, para\) => fila\.aoMover\(de \+ base, para \+ base\)\}/);
  assert.match(FILA, /lista\('radio', doGrupo, principal\.length, fila\.entrada\)/);
  assert.match(FILA, /lista\('principal', principal, 0, null\)/);
  assert.match(FILA, /<View ref=\{refDoAlvo\(chave, alvoDaFila\(\)\) as any\} style=\{\{ minHeight: 56 \}\}>/, 'o alvo de largar continua a ser a fila toda');
});
caso('o número conta até ao valor, a zero enquanto as linhas saem', () => {
  assert.match(FILA, /<NumeroQueAnda valor=\{fila\.saida \? 0 : fila\.upNext\.length\} \/>/);
  assert.match(FILA, /Math\.pow\(1 - f, 3\)/);
});
caso('cada linha leva a classe e o atraso da sua posição', () => {
  assert.match(LINHAS, /saida === 'limpar' \? 'np-fila-linha np-fila-sai' : saida === 'vira' \? 'np-fila-linha np-fila-vira'/);
  assert.match(LINHAS, /entradaDaLista \? 'np-fila-linha np-fila-entra'/);
  assert.match(LINHAS, /animationDelay: `\$\{atrasoDaLinha\(i, saida \? PASSO_DA_SAIDA_MS : PASSO_DA_ENTRADA_MS\)\}ms`/);
});
caso('limpar: primeiro saem, depois muda a fila, com o Undo do iPhone', () => {
  assert.match(HOOK, /setALimpar\(true\);/);
  assert.match(HOOK, /calmo\(\) \? 0 : esperaDaSaida\(Math\.min\(upNext\.length, linhasDaFila\)\)/);
  assert.match(HOOK, /const foto = st\.fotografiaDaFila\(\);\n\s+const sairam = st\.limparProximas\(\);/);
  assert.match(HOOK, /desfazer: \(\) => \{ usePlayer\.getState\(\)\.reporFila\(foto\); \}/);
});
caso('a Radio a trocar a fila: só a tua fila vira, nunca a de uma Jam nem a de um amigo', () => {
  assert.match(HOOK, /const aVirar = aPreparar && podeEditar;/);
  assert.match(HOOK, /saida: \(aLimpar \? 'limpar' : aVirar \? 'vira' : null\)/);
  assert.match(HOOK, /const inicioDoGrupo = podeEditar\n/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

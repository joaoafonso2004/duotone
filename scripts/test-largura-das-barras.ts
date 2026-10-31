/**
 * As duas barras ajustáveis do PC (31/10, o João: "o Spotify tem 2 barras ajustáveis
 * lateralmente, nós não"): a lateral (200 a 420 px, e uma régua de ícones de 72) e o painel da
 * fila (280 a 560 px). A conta das larguras é pura (`lib/largurasDasBarras.ts`); a pega, a store
 * e a casca lêem-se como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-largura-das-barras.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LATERAL, PAINEL, ajustar, lateralRecolhida, lerLarguras, limitesDaLateral, limitesDoPainel, teclar,
} from '../src/lib/largurasDasBarras.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const CASCA = ler('src/desktop/casca.web.tsx');
const ESTILOS = ler('src/desktop/estilos.web.ts');
const PAINEL_TSX = ler('src/desktop/PainelDoLeitor.web.tsx');
const SEPARADOR = ler('src/desktop/SeparadorDeLargura.web.tsx');
const STORE = ler('src/desktop/estadoDasBarras.web.ts');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
const AMIGOS = ler('src/desktop/AmigosNaLateral.web.tsx');
const ATALHOS = ler('src/desktop/AtalhosNaLateral.web.tsx');

console.log('\nos limites e o ajuste');
caso('a lateral vai de 200 a 420 px, e nunca mais de 35 % da janela', () => {
  assert.deepEqual(limitesDaLateral(1920), { minima: 200, maxima: 420, recolhida: 72 });
  assert.equal(limitesDaLateral(1000).maxima, 350);
  assert.equal(limitesDaLateral(500).maxima, 200, 'o máximo nunca desce abaixo do mínimo');
});
caso('o painel vai de 280 a 560 px, e a página guarda sempre 520 px', () => {
  assert.deepEqual(limitesDoPainel(1920, 232), { minima: 280, maxima: 560 });
  assert.equal(limitesDoPainel(1280, 232).maxima, 1280 - 232 - 520);
  assert.equal(limitesDoPainel(1280, 420).maxima, 340, 'com a lateral larga o painel tem menos para crescer');
  assert.equal(limitesDoPainel(400, 200).maxima, 280, 'nunca abaixo do mínimo');
});
caso('numa janela estreita o painel fica por cima da página e pode crescer mais', () => {
  assert.equal(limitesDoPainel(1000, 232).maxima, 560);
  assert.equal(limitesDoPainel(700, 232).maxima, 700 - 232 - 120);
});
caso('o ajuste traz o pedido para dentro dos limites', () => {
  const l = limitesDaLateral(1920);
  assert.equal(ajustar(232, l), 232);
  assert.equal(ajustar(500, l), 420);
  assert.equal(ajustar(150, l), 200);
  assert.equal(ajustar(231.6, l), 232, 'arredonda ao pixel');
  const p = limitesDoPainel(1920, 232);
  assert.equal(ajustar(100, p), 280);
  assert.equal(ajustar(900, p), 560);
});
caso('a lateral recolhe-se na régua abaixo de metade do caminho (136 px), e só aí', () => {
  const l = limitesDaLateral(1920);
  assert.equal(ajustar(135, l), 72);
  assert.equal(ajustar(136, l), 200);
  assert.equal(ajustar(0, l), 72);
  assert.equal(ajustar(NaN, l), 72);
  assert.ok(lateralRecolhida(72) && !lateralRecolhida(200) && !lateralRecolhida(232));
});
caso('o painel não tem régua: abaixo do mínimo fica no mínimo', () => {
  assert.equal(ajustar(0, limitesDoPainel(1920, 232)), 280);
});

console.log('\no teclado no separador');
caso('na lateral a seta para a direita alarga (16 px, com Shift 48)', () => {
  const l = limitesDaLateral(1920);
  assert.equal(teclar(232, 'ArrowRight', false, 1, l), 248);
  assert.equal(teclar(232, 'ArrowRight', true, 1, l), 280);
  assert.equal(teclar(232, 'ArrowLeft', false, 1, l), 216);
  assert.equal(teclar(410, 'ArrowRight', true, 1, l), 420);
});
caso('no painel a seta para a esquerda alarga', () => {
  const p = limitesDoPainel(1920, 232);
  assert.equal(teclar(340, 'ArrowLeft', false, -1, p), 356);
  assert.equal(teclar(340, 'ArrowRight', false, -1, p), 324);
  assert.equal(teclar(284, 'ArrowRight', true, -1, p), 280);
});
caso('da régua, o primeiro passo para fora vai ao mínimo, e para dentro fica; do mínimo, um passo para dentro recolhe', () => {
  const l = limitesDaLateral(1920);
  assert.equal(teclar(72, 'ArrowRight', false, 1, l), 200);
  assert.equal(teclar(72, 'ArrowLeft', false, 1, l), 72);
  assert.equal(teclar(200, 'ArrowLeft', false, 1, l), 72);
  assert.equal(teclar(210, 'ArrowLeft', false, 1, l), 72, 'um passo que passava do mínimo recolhe');
});
caso('Home vai ao extremo pequeno (a régua, na lateral), End ao grande; outras teclas não são dele', () => {
  const l = limitesDaLateral(1920);
  assert.equal(teclar(300, 'Home', false, 1, l), 72);
  assert.equal(teclar(300, 'End', false, 1, l), 420);
  assert.equal(teclar(400, 'Home', false, -1, limitesDoPainel(1920, 232)), 280);
  assert.equal(teclar(300, 'a', false, 1, l), null);
  assert.equal(teclar(300, 'ArrowUp', false, 1, l), null);
});

console.log('\no que está guardado');
caso('só números a sério; o resto volta ao de origem', () => {
  assert.deepEqual(lerLarguras(null), { lateral: LATERAL.padrao, painel: PAINEL.padrao });
  assert.deepEqual(lerLarguras({ lateral: 'x', painel: NaN }), { lateral: 232, painel: 340 });
  assert.deepEqual(lerLarguras({ lateral: 300, painel: 400 }), { lateral: 300, painel: 400 });
  assert.deepEqual(lerLarguras('lixo'), { lateral: 232, painel: 340 });
});
caso('as larguras de origem são as de sempre (232 e 340)', () => {
  assert.equal(LATERAL.padrao, 232);
  assert.equal(PAINEL.padrao, 340);
});

console.log('\na pega');
caso('é um separador a sério: papel, orientação, valores e teclado', () => {
  assert.match(SEPARADOR, /role="separator" aria-orientation="vertical" aria-label=\{rotulo\} tabIndex=\{0\}/);
  assert.match(SEPARADOR, /aria-valuenow=\{Math\.round\(valor\)\} aria-valuemin=\{lim\.recolhida \?\? lim\.minima\} aria-valuemax=\{lim\.maxima\}/);
  assert.match(SEPARADOR, /const nova = teclar\(valor, e\.key, e\.shiftKey, sinal, lim\);/);
});
caso('arrasta com captura do ponteiro, um pedido por fotograma, e acaba em todas as saídas', () => {
  assert.match(SEPARADOR, /setPointerCapture\(e\.pointerId\)/);
  assert.match(SEPARADOR, /quadro\.current = requestAnimationFrame\(\(\) => \{ quadro\.current = 0; aoMudar\(pedida\.current\); \}\);/);
  for (const saida of ['onPointerUp={acabar}', 'onPointerCancel={acabar}', 'onLostPointerCapture={acabar}']) assert.ok(SEPARADOR.includes(saida), saida);
  assert.match(SEPARADOR, /raiz\?\.removeAttribute\('data-a-redimensionar'\);\n\s+\}, \[raiz\]\);/, 'sair de cena a meio não deixa o cursor preso');
});
caso('parte da largura de verdade da barra (já com os limites da janela), e não da guardada', () => {
  assert.match(SEPARADOR, /ref\.current\?\.parentElement\?\.getBoundingClientRect\(\)\.width \?\? valor/);
});
caso('o duplo clique repõe a largura de origem', () => {
  assert.match(SEPARADOR, /onDoubleClick=\{aoRepor\}/);
  assert.match(SEPARADOR, /aoRepor=\{repor\}/);
});
caso('a pega fica POR DENTRO da barra (uma que saísse ficava por baixo da página, que é irmã mais abaixo)', () => {
  assert.match(SEPARADOR, /style=\{\{ \[lado === 'direita' \? 'right' : 'left'\]: 0 \} as React\.CSSProperties\}/);
  assert.ok(!/(right|left): -\d/.test(SEPARADOR + CASCA.slice(CASCA.indexOf('[data-dt~="separador"]'), CASCA.indexOf('[data-dt~="separador"]') + 900)));
});
caso('a lateral cresce para a direita e o painel para a esquerda', () => {
  assert.match(SEPARADOR, /<SeparadorDeLargura rotulo="Resize the sidebar"[\s\S]*?sinal=\{1\} lado="direita"/);
  assert.match(SEPARADOR, /<SeparadorDeLargura rotulo="Resize the queue panel"[\s\S]*?sinal=\{-1\} lado="esquerda"/);
});

console.log('\nonde se liga');
caso('a largura vai pelas variáveis da raiz, e não pelo React: arrastar não redesenha a casca', () => {
  assert.match(STORE, /raiz\.setProperty\('--dt-lateral', `\$\{lateral\}px`\);/);
  assert.match(STORE, /raiz\.setProperty\('--dt-painel', `\$\{painel\}px`\);/);
  assert.match(STORE, /window\.addEventListener\('resize', aplicar\);/);
  assert.match(ESTILOS, /sidebar: \{ width: 'var\(--dt-lateral, 232px\)'/);
  assert.match(PAINEL_TSX, /width: 'var\(--dt-painel, 340px\)', maxWidth: '100%'/);
  assert.ok(!/width: 340/.test(PAINEL_TSX), 'sobrou uma largura fixa de 340');
});
caso('a escolha guarda-se no aparelho e uma janela pequena não a estraga', () => {
  assert.match(STORE, /window\.localStorage\.setItem\(PREFERENCIA, JSON\.stringify\(\{ lateral: s\.lateral, painel: s\.painel \}\)\)/);
  assert.match(STORE, /export function larguraEfetiva\(/);
});
caso('a casca monta a pega da lateral dentro dela, e o painel a dele', () => {
  assert.match(NAVEGADOR, /<View style=\{styles\.sidebar\}><Sidebar [^>]*\/><SeparadorDaLateral \/><\/View>/);
  assert.match(PAINEL_TSX, /\{\(estado\.aberto \|\| conteudoMontado\) && <SeparadorDoPainel \/>\}/);
});
caso('o CSS: pega de 6 px, fio que acende, cursor de arrasto em todo o lado, e o painel não anima enquanto se arrasta', () => {
  assert.match(CASCA, /\[data-dt~="separador"\]\{ position: absolute; top: 0; bottom: 0; width: 6px; z-index: 40; cursor: col-resize;/);
  assert.match(CASCA, /html\[data-a-redimensionar\], html\[data-a-redimensionar\] \*\{ cursor: col-resize !important; user-select: none !important; \}/);
  assert.match(CASCA, /html\[data-a-redimensionar\] \[data-dt~="painel-do-leitor"\]\{ transition: none !important; \}/);
  assert.match(CASCA, /\[data-dt~="separador"\]::after\{ transition: none !important; \}/, 'menos movimento');
});

console.log('\na lateral adapta-se (a régua de ícones)');
caso('a lateral só se redesenha quando entra ou sai da régua', () => {
  assert.match(STORE, /export const useLateralRecolhida = \(\) => useBarras\(\(s\) => lateralRecolhida\(s\.lateral\)\);/);
  assert.match(CASCA, /const compacta = useLateralRecolhida\(\);/);
});
caso('na régua: sem a etiqueta, itens só com ícone e legenda, conta só com a cara, sem o progresso da importação', () => {
  assert.match(CASCA, /\{compacta \? null : <Text style=\{styles\.navLabel\}>LIBRARY<\/Text>\}/);
  assert.match(CASCA, /\{\.\.\.\(compacta \? comDica\(label, undefined, 'premir'\) : marcar\('premir'\)\)\}/);
  assert.match(CASCA, /\{compacta \? null : <Text numberOfLines=\{1\} style=\{\[styles\.navText,/);
  assert.match(CASCA, /\{compacta \? null : <ProgressoDaImportacao \/>\}/);
  assert.match(CASCA, /\{avatarDisplay\}\{compacta \? null : <View style=\{\{ flex: 1, minWidth: 0 \}\}>/);
});
caso('o aviso de mensagens por ler sobe para o canto do ícone na régua (não empurra nada)', () => {
  assert.match(CASCA, /\{badge && \(compacta \? <View style=\{\{ position: 'absolute', top: 7, right: 9 \}\}><BolinhaDeAviso \/><\/View> : <BolinhaDeAviso \/>\)\}/);
});
caso('os amigos e os atalhos têm a sua régua: só as caras e as miniaturas, com o nome na legenda', () => {
  assert.match(CASCA, /<AmigosNaLateral navigate=\{navigate\} notify=\{notify\} compacta=\{compacta\} \/>/);
  assert.match(CASCA, /<AtalhosNaLateral navigate=\{navigate\} notify=\{notify\} compacta=\{compacta\} \/>/);
  assert.match(AMIGOS, /if \(compacta\) \{/);
  assert.match(AMIGOS, /comDica\(faixa \? `\$\{nome\} · \$\{tituloDaFaixa\(faixa\)\}` : `\$\{nome\} · Online`, undefined, 'amigo'\)/);
  assert.match(ATALHOS, /if \(compacta\) \{/);
  assert.match(ATALHOS, /<Miniatura a=\{a\} online=\{a\.tipo === 'amigo' && online\.has\(a\.id\)\} \/>/);
});
caso('o botão direito, arrastar para um atalho e o "+" continuam na régua (o menu e o diálogo são os mesmos)', () => {
  assert.equal((ATALHOS.match(/\{janelas\}/g) ?? []).length, 2, 'a lista e a régua mostram o mesmo menu e o mesmo diálogo');
  assert.equal((ATALHOS.match(/onContextMenu=/g) ?? []).length, 2);
  assert.equal((ATALHOS.match(/refDoAlvo\(`atalho:/g) ?? []).length, 2);
  assert.equal((AMIGOS.match(/refDoAlvo\(`lateral-amigo:/g) ?? []).length, 2);
});
caso('cada nome que não cabe corta-se numa linha, em qualquer largura', () => {
  assert.ok(/<Text numberOfLines=\{1\} style=\{\[styles\.navText,/.test(CASCA));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

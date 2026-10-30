/**
 * O look da maquete que a 5.5.0 deixou de fora (30/10, o João: "a app está
 * basicamente igual a antes"): a entrada por blocos, o play que sobe nos
 * cartões e os cartões de mistura a cores. Lê o código como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-look-do-pc.ts
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
const UI = ler('src/desktop/ui.web.tsx');
const CASCA = ler('src/desktop/casca.web.tsx');
const BIBLIOTECA = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const RETRATOS = ler('src/desktop/RetratosDosArtistas.web.tsx');
const ENTRADAS = ler('src/desktop/EntradasDaHome.web.tsx');

console.log('\na entrada por blocos');
caso('as prateleiras e a linha de entrada da Home são blocos', () => {
  assert.equal((UI.match(/return <View \{\.\.\.marcar\('bloco'\)\} style=\{\{ marginBottom: ESP\.xxl \}\}>/g) ?? []).length, 4, 'as quatro prateleiras');
  assert.match(ENTRADAS, /<View \{\.\.\.marcar\('bloco'\)\} style=\{estilos\.linha\}>/);
});
caso('cada bloco entra a subir e a acender, um a seguir ao outro (só opacidade e transform)', () => {
  assert.match(CASCA, /@keyframes dt-bloco\{ from\{ opacity: 0; transform: translateY\(16px\); \} to\{ opacity: 1; transform: none; \} \}/);
  assert.match(CASCA, /\[data-dt~="bloco"\]\{ animation: dt-bloco 640ms var\(--dt-curva\) both; \}/);
  assert.match(CASCA, /\[data-dt~="bloco"\]:nth-child\(2\)\{ animation-delay: 60ms; \}/);
  assert.match(CASCA, /\[data-dt~="bloco"\]:nth-child\(n\+7\)\{ animation-delay: 360ms; \}/);
});

console.log('\no play que sobe nos cartões');
caso('com o rato no cartão (ou o foco lá dentro) sobe e acende, em CSS', () => {
  assert.match(CASCA, /\[data-dt~="play-cartao"\]\{ opacity: 0; transform: translateY\(8px\) scale\(\.92\);/);
  assert.match(CASCA, /\[data-dt~="cartao"\]:hover \[data-dt~="play-cartao"\], \[data-dt~="cartao"\]:focus-within \[data-dt~="play-cartao"\]\{ opacity: 1; transform: none; \}/);
});
caso('numa prateleira de músicas é só o convite (o cartão já toca); onde o cartão abre é um botão a sério', () => {
  assert.match(UI, /if \(!aoTocar\) return <View \{\.\.\.marcar\('play-cartao'\)\} pointerEvents="none" aria-hidden style=\{estilo\}>/);
  assert.match(UI, /onPointerDown=\{\(\(e: any\) => e\.stopPropagation\(\)\) as any\}\n\s+onPress=\{\(e: any\) => \{ e\?\.stopPropagation\?\.\(\); aoTocar\(\); \}\}/);
  assert.equal((UI.match(/<PlayDoCartao lado="esquerda" \/>/g) ?? []).length, 2, 'as duas formas da Shelf; à esquerda, porque a direita é do refrão');
});
caso('o artista da grelha toca as músicas dele da biblioteca, e a mistura da Home toca-se com a origem dela', () => {
  assert.match(BIBLIOTECA, /aoTocar=\{\(\) => tocarArtista\(nome, faixas\)\}>/);
  assert.match(RETRATOS, /\{aoTocar \? <PlayDoCartao aoTocar=\{aoTocar\} rotulo=\{`Play \$\{nome\}`\} \/> : null\}/);
  assert.match(BIBLIOTECA, /void leitor\.tocarLista\(\[\.\.\.m\.faixas\], leitor\.shuffle, leitor\.shuffleInteligente, \{ tipo: 'mistura', nome: m\.nome, id: m\.id \}\);/);
  assert.equal((BIBLIOTECA.match(/aoAbrir=\{abrirMistura\} aoTocar=\{tocarMistura\}/g) ?? []).length, (BIBLIOTECA.match(/<PrateleiraDeMisturas titulo=/g) ?? []).length, 'todas as prateleiras de misturas');
});

console.log('\no cartão de mistura');
caso('um cartão de cor: a da primeira capa, com a etiqueta, o nome grande e três círculos que se sobrepõem', () => {
  assert.match(UI, /const cor = useCorDoAmbiente\(m\.faixas\[0\]\?\.artworkUrl \?\? null\) \?\? '#3a3a46';/);
  assert.match(UI, /linear-gradient\(135deg, color-mix\(in oklab, \$\{cor\} 58%, #0b0b0d\), color-mix\(in oklab, \$\{cor\} 14%, #0b0b0d\)\)/);
  assert.match(UI, /\.slice\(0, 3\)/);
  assert.match(UI, /MIX · \{m\.faixas\.length\}/);
});
caso('abre no clique e toca no play; o botão direito e o cartão levantado com o menu ficam como estavam', () => {
  assert.match(UI, /onPress=\{\(\) => \{ if \(arrastou\.current\) return; aoAbrir\(m\); \}\}/);
  assert.match(UI, /\{\.\.\.marcar\('cartao', \.\.\.\(escolhido \? \['com-menu'\] : \[\]\)\)\}/);
  assert.match(UI, /onContextMenu=\{\(\(e: any\) => \{ if \(!aoMenu\) return; e\.preventDefault\(\); aoMenu\(m, e\); \}\) as any\}/);
});
caso('nenhum pedido novo, nada de className nem de backdrop-filter', () => {
  const cartao = UI.slice(UI.indexOf('function CartaoDeMistura('), UI.indexOf('/** O lado mínimo de uma capa na grelha'));
  assert.ok(!/fetch\(|supabase|className\s*[=:]|backdrop-?[fF]ilter/.test(cartao));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

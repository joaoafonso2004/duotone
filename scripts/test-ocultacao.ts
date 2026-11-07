/**
 * A Ocultação (C2, 1/11): a troca de música no PC, a variante difusa. As contas
 * do `lib/ocultacao.ts` e quem as usa (a barra, o Now Playing e o mini leitor).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-ocultacao.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COR_DO_DISCO_SEM_CAPA, corDoDisco, fundoDoDisco, OCULTACAO, SOMBRA_NA_LATERAL, sentidoDaOcultacao, sombraNaLateral, trajetoDoDisco,
} from '../src/lib/ocultacao.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const peca = ler('src/desktop/Ocultacao.web.ts');

console.log('\nas contas');
caso('os números da variante escolhida: difusa, 220 ms, e um disco que tapa os cantos', () => {
  assert.equal(OCULTACAO.entradaMs, 220);
  assert.equal(OCULTACAO.opacidade, 0.9);
  assert.equal(OCULTACAO.cruzarMs, 160);
  assert.ok(OCULTACAO.ladoDoDisco >= Math.SQRT2, 'o disco tem de cobrir a diagonal da capa');
  assert.equal(fundoDoDisco('rgb(1,2,3)'), 'radial-gradient(circle, rgb(1,2,3) 52%, transparent 70%)');
});
caso('a seguinte vem da direita, a anterior da esquerda, e sai pelo outro lado', () => {
  assert.deepEqual(trajetoDoDisco(1), { de: 'translateX(100%)', meio: 'translateX(0)', para: 'translateX(-100%)' });
  assert.deepEqual(trajetoDoDisco(-1), { de: 'translateX(-100%)', meio: 'translateX(0)', para: 'translateX(100%)' });
});
caso('o sentido vem do salto; uma música que acabou sozinha avança', () => {
  const agora = 100000;
  assert.equal(sentidoDaOcultacao({ direcao: -1, em: agora - 100 }, agora), -1);
  assert.equal(sentidoDaOcultacao({ direcao: 1, em: agora - 100 }, agora), 1);
  assert.equal(sentidoDaOcultacao({ direcao: -1, em: agora - 60000 }, agora), 1, 'um salto de há muito já não conta');
  assert.equal(sentidoDaOcultacao(null, agora), 1);
});
caso('a sombra é a cor da capa muito puxada para o fundo; sem capa, quase preto', () => {
  assert.equal(corDoDisco(null), COR_DO_DISCO_SEM_CAPA);
  assert.equal(corDoDisco([]), COR_DO_DISCO_SEM_CAPA);
  const [r, g, b] = /rgb\((\d+),(\d+),(\d+)\)/.exec(corDoDisco([{ r: 255, g: 40, b: 40 }]))!.slice(1).map(Number);
  assert.ok(r! > g! && r! > b!, 'guarda o tom');
  assert.ok(r! < 70, `escura: ${r}`);
});

caso('na capa 3D, as laterais escurecem pela ordem por que o disco lhes passa', () => {
  // A seguinte vem da direita: a da direita escurece logo, a da esquerda só no fim.
  assert.deepEqual(sombraNaLateral('dir', 1).entra, [0, 0.35]);
  assert.deepEqual(sombraNaLateral('esq', 1).entra, [0.8, 1]);
  assert.deepEqual(sombraNaLateral('esq', -1), sombraNaLateral('dir', 1), 'a anterior é o espelho');
  assert.deepEqual(sombraNaLateral('cima', 1), sombraNaLateral('baixo', -1), 'as de cima e de baixo com o meio dele');
  for (const lado of ['esq', 'dir', 'cima', 'baixo'] as const) for (const s of [1, -1] as const) {
    const { entra, sai } = sombraNaLateral(lado, s);
    assert.ok(entra[0] < entra[1] && sai[0] < sai[1] && entra[1] <= 1 && sai[1] <= 1, `${lado} ${s}`);
  }
  assert.ok(SOMBRA_NA_LATERAL < OCULTACAO.opacidade, 'a lateral nunca fica mais escura do que o disco');
});

console.log('\na peça');
caso('a capa troca uma vez só, na totalidade (ou ao cancelar)', () => {
  assert.match(peca, /const trocar = \(\) => \{ if \(trocou\) return; trocou = true; o\.aTotalidade\(\); \};/);
  assert.match(peca, /return \(\) => \{ saiu = true; trocar\(\); acabar\(\); \};/, 'uma música nova a meio acaba esta');
});
caso('as curvas são as molas: a chegar a do sair, a sair a ENTRADA', () => {
  assert.match(peca, /duration: OCULTACAO\.entradaMs, easing: curvas\.sair\.curva/);
  assert.match(peca, /duration: curvas\.entrada\.ms, easing: curvas\.entrada\.curva/);
  assert.ok(!/cubic-bezier|\bease\b/.test(peca));
});
caso('não fica presa com a janela escondida, e sai do documento', () => {
  assert.match(peca, /setTimeout\(aoChegar, OCULTACAO\.entradaMs \+ 50\)/);
  assert.match(peca, /setTimeout\(acabar, curvas\.entrada\.ms \+ 100\)/);
  assert.match(peca, /disco\.remove\(\);/);
});
caso('com menos movimento não há disco: cruza em 160 ms', () => {
  assert.match(peca, /if \(menosMovimento\(\) \|\| !caixa\.animate\) \{\n\s*const id = setTimeout\(trocar, OCULTACAO\.cruzarMs\);/);
  assert.match(ler('src/desktop/casca.web.tsx'), /@media \(prefers-reduced-motion: reduce\)\{ \[data-dt~="capa-sai"\]\{ animation: dt-capa-sai 160ms linear both; \} \}/);
  assert.match(ler('src/janelaMini.web.tsx'), /@media \(prefers-reduced-motion: reduce\) \{ \[data-dt~="capa-sai"\] \{ animation: dt-capa-sai 160ms linear both; \} \}/);
});
caso('a capa velha entra antes de pintar: num useEffect via-se a nova um fotograma', () => {
  assert.match(peca, /useLayoutEffect\(\(\) => \{\n\s*const anterior = antes\.current;/);
});

console.log('\nos três sítios');
caso('a barra, com a capa velha por cima da nova', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /<View nativeID="alvo-seguinte"><CapaDaBarra faixa=\{mostrada \?\? p\.current\} \/><\/View>/);
  assert.match(casca, /\{velha \? <View \{\.\.\.marcar\('capa-sai'\)\}/);
});
caso('o Now Playing, numa camada que corta o disco sem cortar o cubo; com a letra à frente não passa', () => {
  const np = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
  // Nem no Cinema (5/11), que não tem a capa grande para tapar.
  assert.match(np, /caixa: capaMetal \? faceDaCaixa : caixaDaCapa, capa: track\?\.artworkUrl, ligada: !showLyrics && !luasNoEcra\(\) && !cinema,/);
  assert.match(np, /<View ref=\{caixaDaCapa\} pointerEvents="none" style=\{\{[^}]*overflow: 'hidden', zIndex: 3 \}\}>/);
  assert.match(np, /\{capaQueSai && !capaMetal \? \(/, 'com a capa 3D a velha não fica na camada plana');
  assert.match(np, /<img data-dt="capa-sai" src=\{capaQueSai\}/);
  assert.ok(!/np-capa-entra|np-capa-sai/.test(np + ler('src/desktop/casca.web.tsx')), 'a passagem antiga saiu');
});
caso('na capa de metal em 3D (7/11) passa DENTRO da face, e as laterais escurecem com o disco', () => {
  const np = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
  const caixa3d = ler('src/desktop/CapaMetal3D.web.tsx');
  assert.match(np, /laterais: capaMetal \? \(\) => lateraisDaCaixa\(faceDaCaixa\.current\) : undefined,/);
  assert.match(np, /capaQueSai=\{capaQueSai\} faceRef=\{faceDaCaixa\}/);
  // A face corta o disco (`m3-face` tem overflow hidden) e leva a capa velha por cima da glitch.
  assert.match(caixa3d, /<div data-dt="m3-face" aria-hidden=\{showLyrics\} ref=\{faceRef\}/);
  assert.match(caixa3d, /\{capaQueSai \? <img data-dt="capa-sai" src=\{capaQueSai\}/);
  assert.match(ler('src/desktop/casca.web.tsx'), /\[data-dt~="m3-face"\]\{[^}]*overflow: hidden;/);
  assert.match(peca, /const sombras = \(o\.laterais \?\? \[\]\)\.map/);
  assert.match(peca, /escurecer\('entra', OCULTACAO\.entradaMs\);/);
  assert.match(peca, /escurecer\('sai', curvas\.entrada\.ms\);/);
  assert.match(peca, /sombras\.forEach\(\(\{ camada \}\) => camada\.remove\(\)\)/, 'as sombras saem com o disco');
});
caso('o fundo troca quando a capa troca, e não no instante do skip (7/11)', () => {
  const fundo = ler('src/desktop/FundoDaCapa.web.tsx');
  assert.match(fundo, /const chave = useAtrasadoPelaOcultacao\(agora\);/);
  // Cada passagem conta enquanto não tapou; a troca da capa desconta-a.
  assert.match(peca, /comecouATapar\(\);\n\s+const o = \{ \.\.\.entrada, aTotalidade: \(\) => \{ entrada\.aTotalidade\(\); tapou\(\); \} \};/);
  // Uma música nova a meio cancela e recomeça no mesmo commit: o aviso espera por isso.
  assert.match(peca, /queueMicrotask\(\(\) => \{ if \(!porTapar\) \[\.\.\.aEsperar\]\.forEach\(\(f\) => f\(\)\); \}\);/);
  // Num useEffect, depois dos useLayoutEffect onde a passagem começa.
  const gancho = peca.slice(peca.indexOf('export function useAtrasadoPelaOcultacao'), peca.indexOf('export type LateralDaOcultacao'));
  assert.match(gancho, /useEffect\(\(\) => \{\n\s+if \(valor === mostrado\) return undefined;\n\s+if \(!porTapar\) \{ setMostrado\(valor\); return undefined; \}/);
  assert.ok(!/useLayoutEffect/.test(gancho));
});
caso('o mini leitor recebe o sentido, e o processo principal deixa-o passar', () => {
  assert.equal((ler('src/janelaMini.web.tsx').match(/<CapaDoMini /g) ?? []).length, 2);
  assert.match(ler('src/desktop/usePonteDoLeitor.web.ts'), /sentido: sentidoDaOcultacao\(p\.saltoDaFaixa, Date\.now\(\)\),/);
  assert.match(ler('electron/miniLeitor.cjs'), /sentido: r\.sentido === -1 \? -1 : 1,/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

/**
 * A Ocultação (C2, 1/11): a troca de música no PC, a variante difusa. As contas
 * do `lib/ocultacao.ts` e quem as usa (a barra, o Now Playing e o mini leitor).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-ocultacao.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bezierCubica, COR_DO_DISCO_SEM_CAPA, corDoDisco, curvaDaOcultacao, duracaoDaSaida, fundoDoDisco, gradienteDoDisco, OCULTACAO,
  SOMBRA_NA_LATERAL, sentidoDaOcultacao, sombraNaLateral, trajetoDoDisco, ECLIPSE, fundoDoEclipse, trajetoDoEclipse,
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
  assert.match(peca, /duration: entradaMs, easing: curvas\.sair\.curva/);
  assert.match(peca, /duration: curvas\.entrada\.ms, easing: curvas\.entrada\.curva/);
  assert.ok(!/cubic-bezier|\bease\b/.test(peca));
});
caso('não fica presa com a janela escondida, e sai do documento', () => {
  assert.match(peca, /setTimeout\(aoChegar, entradaMs \+ 50\)/);
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
  assert.match(peca, /escurecer\('entra', entradaMs\);/);
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

// --- O iPhone (25/11) ---

caso('iPhone: o cubic-bezier do sair acelera (devagar ao princípio, todo no fim)', () => {
  const sair = bezierCubica(0.5, 0, 0.75, 0);
  assert.equal(sair(0), 0);
  assert.equal(sair(1), 1);
  assert.ok(sair(0.5) < 0.15, `a meio do tempo ainda andou pouco (${sair(0.5)})`);
  for (let t = 0.05; t <= 1; t += 0.05) assert.ok(sair(t) >= sair(t - 0.05), 'nunca recua');
});

caso('iPhone: a passagem é uma curva só, 220 ms a entrar e a mola ENTRADA a sair', () => {
  const c = curvaDaOcultacao();
  const saida = duracaoDaSaida();
  assert.ok(saida > 450 && saida < 800, `a mola assenta em ~0,6 s (${saida})`);
  assert.equal(c.duracaoMs, OCULTACAO.entradaMs + saida);
  assert.equal(c.inputRange.length, c.posicao.length);
  assert.equal(c.inputRange[0], 0);
  assert.equal(c.inputRange[c.inputRange.length - 1], 1);
  for (let i = 1; i < c.inputRange.length; i++) assert.ok(c.inputRange[i] > c.inputRange[i - 1], 'o inputRange do interpolate sobe sempre');
  assert.equal(c.posicao[0], 1, 'começa fora, do lado de onde vem');
  assert.equal(c.posicao[c.inputRange.indexOf(+c.totalidade.toFixed(5))], 0, 'na totalidade o disco tapa a capa');
  assert.equal(c.posicao[c.posicao.length - 1], -1, 'acaba fora, do outro lado');
  assert.ok(Math.abs(c.totalidade - OCULTACAO.entradaMs / c.duracaoMs) < 1e-9);
});

caso('iPhone: o disco esbate-se para a sua própria cor transparente', () => {
  assert.equal(gradienteDoDisco('rgb(59,10,12)'), 'radial-gradient(circle, rgb(59,10,12) 52%, rgba(59,10,12,0) 70%)');
  assert.match(gradienteDoDisco(COR_DO_DISCO_SEM_CAPA), /rgba\(6,6,8,0\) 70%\)$/);
});

caso('iPhone: a peça — uma animação nativa, a velha sempre montada, e as regras do recuo', () => {
  const p = ler('src/components/OcultacaoDaCapa.tsx');
  assert.match(p, /Animated\.timing\(fase, \{ toValue: 1, duration: CURVA\.duracaoMs, easing: Easing\.linear, useNativeDriver: true \}\)/);
  assert.equal((p.match(/Animated\.(timing|spring|sequence)\(/g) ?? []).length, 1, 'nada de sequência: a meio esperava pelo JavaScript');
  assert.match(p, /pedirFluidez\(CURVA\.duracaoMs/, 'pede os 120 Hz');
  assert.match(p, /!reduzir/, 'com Reduzir movimento fica o cruzamento');
  assert.match(p, /!luasNoEcra\(\)/, 'com as Duas luas não passa');
  assert.match(p, /AppState\.currentState === 'active'/, 'em segundo plano não passa');
  assert.match(p, /ligadaAntes\.current && ligada/, 'a primeira faixa (abrir) não passa');
  assert.match(p, /const velha = s\.velha \?\? capa;/, 'a imagem de cima fica montada com a capa que se vê');
  assert.match(p, /experimental_backgroundImage: gradienteDoDisco\(cor\)/);
});

caso('iPhone: no leitor aberto (só com a capa à frente, não no Poster) e no mini', () => {
  const l = ler('src/components/PlayerRoot.tsx');
  assert.match(l, /<OcultacaoDaCapa chave=\{transicao\?\.chave \?\? null\} sentido=\{transicao\?\.sentido === -1 \? -1 : 1\} lado=\{size\} capa=\{artSource\} corDe=\{track\.artworkUrl \?\? null\} ligada=\{aVista && !showLyrics\}><CapaComTransicao uri=\{artSource\}/);
  assert.equal((l.match(/<OcultacaoDaCapa/g) ?? []).length, 2, 'o leitor aberto e o mini; o Poster pousado fica de fora');
  assert.match(l, /ligada=\{!origemDaEntrada\}/, 'no mini, não no pouso de uma música vinda de uma lista');
});

console.log('\no Eclipse do modo limpo (25/11)');
caso('o miolo opaco tapa os cantos da capa quando o disco chega ao meio', () => {
  // 62 % do raio, com o raio em lados da capa; os cantos estão a meia diagonal.
  assert.ok(ECLIPSE.raio * 0.62 >= Math.SQRT2 / 2, `${ECLIPSE.raio * 0.62} não chega aos cantos`);
  assert.equal(fundoDoEclipse('rgb(10,20,30)'), 'radial-gradient(circle closest-side, rgba(10,20,30,0.96) 0%, rgba(10,20,30,0.9) 62%, rgba(10,20,30,0) 100%)');
});
caso('começa e acaba com o centro a um raio do lado de fora da capa; a seguinte vem da direita', () => {
  const t = trajetoDoEclipse(1);
  // (0,5 + 1,15) / 2,3 = 71,74 % da largura do disco.
  assert.deepEqual(t, { de: 'translateX(71.74%)', meio: 'translateX(0)', para: 'translateX(-71.74%)' });
  assert.equal(trajetoDoEclipse(-1).de, 'translateX(-71.74%)');
});
caso('a sombra do Eclipse é mais viva do que a da Ocultação', () => {
  const celulas = [{ r: 200, g: 40, b: 40 }];
  const canal = (cor: string) => Number(/^rgb\((\d+)/.exec(cor)![1]);
  assert.ok(canal(corDoDisco(celulas, ECLIPSE.escurecer)) > canal(corDoDisco(celulas)));
});
caso('a peça: o disco maior, sem a opacidade da Ocultação, com a orla, e o modo limpo pede-o', () => {
  const o = ler('src/desktop/Ocultacao.web.ts');
  assert.match(o, /const ladoDoDisco = eclipse \? 2 \* ECLIPSE\.raio : OCULTACAO\.ladoDoDisco;/);
  assert.match(o, /opacity: eclipse \? '1' : String\(OCULTACAO\.opacidade\)/);
  assert.match(o, /const t = eclipse \? trajetoDoEclipse\(o\.sentido\) : trajetoDoDisco\(o\.sentido\);/);
  assert.match(o, /const entradaMs = eclipse \? ECLIPSE\.entradaMs : OCULTACAO\.entradaMs;/);
  assert.match(o, /disco\.appendChild\(orla\);/);
  const ml = ler('src/desktop/ModoLimpo.web.tsx');
  assert.match(ml, /caixa: caixaDaCapa, capa: faixa\?\.artworkUrl, eclipse: true,/);
  assert.match(ml, /<img data-dt="capa-sai" src=\{capaQueSai\}/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

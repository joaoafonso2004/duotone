/**
 * A capa de metal em 3D do Now Playing do PC (5/11, `lib/capaMetal3D.ts`).
 *
 * Prende o que o João escolheu na maquete: a pose do iPhone, o lado do rato a
 * AFUNDAR até 6°, rodar sem limite a arrastar, e pousar sempre numa face. E,
 * lendo o código como texto: desligada de origem, só aparece com a opção, e
 * sem os reflexos que ele mandou tirar.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-capa-metal-3d.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORCA_DO_BRILHO, INCLINACAO_MAXIMA, LANCAR, POSE_DO_METAL, anguloCurto, anguloDoArrasto, anguloDoLado,
  brilhoDaAresta, destinoAoLargar, inclinacao, molaAssente, mostraALetra, passoDaMola, ratoNaCapa,
  type EstadoDaMola,
} from '../src/lib/capaMetal3D.ts';
import { CAPA_FLUTUANTE } from '../src/lib/capaFlutuante3D.ts';
import { ENTRADA, ESTADO, SOLTAR } from '../src/lib/movimento.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

console.log('\na pose e o rato');
caso('a pose de repouso é a da Floating 3D do iPhone', () => {
  assert.equal(POSE_DO_METAL.rotateX, CAPA_FLUTUANTE.rotateX);
  assert.equal(POSE_DO_METAL.rotateY, CAPA_FLUTUANTE.rotateY);
  assert.equal(POSE_DO_METAL.rotateZ, CAPA_FLUTUANTE.rotateZ);
  assert.equal(POSE_DO_METAL.espessura, CAPA_FLUTUANTE.espessura);
});
caso('inclina no máximo 6°', () => {
  assert.equal(INCLINACAO_MAXIMA, 6);
  const canto = inclinacao({ nx: 1, ny: -1 });
  assert.equal(canto.rotateX - POSE_DO_METAL.rotateX, 6);
  assert.equal(canto.rotateY - POSE_DO_METAL.rotateY, 6);
});
caso('o lado do rato AFUNDA: em cima à direita, o rotateX e o rotateY sobem', () => {
  // Nas contas do CSS (y para baixo, z para quem vê), rotateX a subir leva a
  // aresta de cima para trás e rotateY a subir leva a da direita para trás.
  const c = inclinacao({ nx: 1, ny: -1 });
  assert.ok(c.rotateX > POSE_DO_METAL.rotateX && c.rotateY > POSE_DO_METAL.rotateY);
  const b = inclinacao({ nx: -1, ny: 1 });
  assert.ok(b.rotateX < POSE_DO_METAL.rotateX && b.rotateY < POSE_DO_METAL.rotateY);
});
caso('sem rato, a pose', () => {
  assert.deepEqual(inclinacao(null), { rotateX: POSE_DO_METAL.rotateX, rotateY: POSE_DO_METAL.rotateY });
});
caso('o rato conta na capa e numa margem à volta, e fora dela não', () => {
  const centro = { x: 500, y: 400 };
  assert.deepEqual(ratoNaCapa(500, 400, centro, 400), { nx: 0, ny: 0 });
  const borda = ratoNaCapa(700, 400, centro, 400)!;
  assert.ok(borda.nx > 0.6 && borda.nx < 1, `na aresta já inclina bem, sem chegar ao máximo: ${borda.nx}`);
  assert.equal(ratoNaCapa(900, 400, centro, 400), null, 'a 400 px do centro, numa capa de 400, já não conta');
  assert.equal(ratoNaCapa(500, 400, centro, 0), null);
  assert.equal(ratoNaCapa(860, 400, centro, 400)!.nx, 1, 'na margem, a inclinação toda');
});

console.log('\narrastar e largar');
const LADO = 476;
caso('arrastar uma capa de largura dá meia volta, e não há limite', () => {
  assert.equal(anguloDoArrasto(0, LADO, LADO), 180);
  assert.equal(anguloDoArrasto(180, 3 * LADO, LADO), 720, 'três capas de largura: volta e meia por cima da letra');
});
const largar = (angulo: number, vxPxMs = 0, sentido = 1, msParada = 0) =>
  destinoAoLargar({ angulo, vxPxMs, msParada, sentido, lado: LADO });
caso('devagar: a 20 % vira, abaixo disso volta atrás', () => {
  assert.equal(largar(54), 180);
  assert.equal(largar(18), 0);
  assert.equal(largar(317.6), 360, 'da letra, mais de 20 % para a direita: a capa outra vez');
  assert.equal(largar(150, 0, -1), 180, 'da letra, só 17 % para a esquerda: fica na letra');
  assert.equal(largar(130, 0, -1), 0);
  assert.equal(largar(540), 540, 'numa face certa, fica');
});
caso('um gesto rápido curto vira uma face, no sentido do gesto', () => {
  const d = largar(-41.6, -1.8, -1);
  assert.equal(d, -180);
  assert.ok(mostraALetra(d));
});
caso('um gesto forte continua a rodar e trava mais à frente', () => {
  const d = largar(60, 6, 1);
  assert.ok(d >= 360 && d % 180 === 0, String(d));
});
caso('parado antes de largar não é lançar', () => {
  assert.equal(largar(317.6, 3, 1, 800), 360, 'contou a regra dos 20 %, não a velocidade');
  assert.equal(largar(200, 3, 1, 800), 180);
});
caso('nunca pousa em -0', () => {
  assert.ok(Object.is(largar(-10, 0, -1), 0));
});

console.log('\no lado e as voltas');
caso('o lado vê-se pelo ângulo, com as voltas todas', () => {
  for (const [a, letra] of [[0, false], [89, false], [180, true], [540, true], [-180, true], [720, false], [1080, false]] as const) {
    assert.equal(mostraALetra(a), letra, String(a));
  }
  assert.equal(anguloCurto(900), 180);
  assert.equal(anguloCurto(-360), 0);
});
caso('pelos pontos ou pelo teclado, roda para o ângulo mais perto, para a frente no empate', () => {
  assert.equal(anguloDoLado(0, true), 180);
  assert.equal(anguloDoLado(180, false), 360);
  assert.equal(anguloDoLado(190, false), 360);
  assert.equal(anguloDoLado(170, false), 0);
  assert.equal(anguloDoLado(540, false), 720);
  assert.equal(anguloDoLado(720, true), 900);
});

console.log('\nas molas da app');
function assentar(m: EstadoDaMola, mola: typeof SOLTAR, maxS = 4): { s: number; pico: number } {
  let t = 0, pico = m.x;
  while (t < maxS) {
    passoDaMola(m, mola, 1 / 240); t += 1 / 240;
    pico = Math.max(pico, m.x);
    if (molaAssente(m)) return { s: t, pico };
  }
  return { s: Infinity, pico };
}
caso('a volta à pose (SOLTAR) passa um pouco do ponto e assenta', () => {
  const r = assentar({ x: 0, v: 0, alvo: 6 }, SOLTAR);
  assert.ok(r.s < 2, `demorou ${r.s}s`);
  assert.ok(r.pico > 6, 'sem ressalto nenhum');
});
caso('a ENTRADA e o ESTADO assentam a tempo; a volta lançada também', () => {
  assert.ok(assentar({ x: 0, v: 0, alvo: 180 }, ENTRADA).s < 2);
  assert.ok(assentar({ x: 0, v: 0, alvo: 6 }, ESTADO).s < 2);
  assert.ok(assentar({ x: 0, v: 2000, alvo: 540 }, LANCAR).s < 4);
});

console.log('\no que o João pediu, lido no código');
const PREFS = ler('src/lib/prefs.ts');
const COMPONENTE = ler('src/desktop/CapaMetal3D.web.tsx');
const LEITOR = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
const DEFINICOES = ler('src/desktop/paginas/SettingsPage.web.tsx');
const CASCA = ler('src/desktop/casca.web.tsx');
caso('desligada de origem: só um "1" guardado a liga', () => {
  assert.match(PREFS, /export async function getCapaMetal3D\(\): Promise<boolean> \{\s*try \{ return \(await AsyncStorage\.getItem\(KEY_CAPA_METAL_3D\)\) === '1'; \} catch \{ return false; \}/);
  assert.match(COMPONENTE, /let ligada = false;/);
});
caso('é um interruptor nas Definições do PC (Appearance)', () => {
  // "3D metal cover" até 7/11, quando as arestas deixaram de ser metal.
  assert.match(DEFINICOES, /<ToggleLine label="3D cover"[^\n]*value=\{capaMetal\}/);
  assert.ok(!/3D metal cover/.test(DEFINICOES));
  assert.match(DEFINICOES, /definirCapaMetal\(v\); void setCapaMetal3D\(v\);/);
});
caso('o Now Playing só a desenha com a opção ligada, e o cubo de sempre sem ela', () => {
  assert.match(LEITOR, /const capaMetal = useCapaMetal\(\);/);
  assert.match(LEITOR, /\{capaMetal \? \(\s*<CapaMetal3D /);
  assert.match(LEITOR, /\) : \(\s*<ArtworkLyricsCube /);
});
caso('a troca de música (7/11): a Ocultação passa na face da frente, e as laterais escurecem com ela', () => {
  assert.match(COMPONENTE, /export function lateraisDaCaixa\(face: HTMLElement \| null\): LateralDaOcultacao\[\]/);
  assert.match(COMPONENTE, /:scope > \[data-dt~="m3-\$\{lado\}"\]/);
  assert.match(COMPONENTE, /<div data-dt="m3-face" aria-hidden=\{showLyrics\} ref=\{faceRef\}/);
  assert.match(LEITOR, /capaQueSai=\{capaQueSai\} faceRef=\{faceDaCaixa\}/);
});
console.log('\nas arestas (7/11: a capa, como no iPhone, e um brilho que corre por elas)');
const repouso = { rotateX: POSE_DO_METAL.rotateX, rotateY: POSE_DO_METAL.rotateY, rotateZ: POSE_DO_METAL.rotateZ, virar: 0 };
caso('na pose de repouso brilham as arestas que se veem (a esquerda e a de baixo), e as outras não', () => {
  assert.ok(brilhoDaAresta('esq', 1, repouso).canto > 0.8, 'o fio da esquerda');
  assert.ok(brilhoDaAresta('baixo', 1, repouso).canto > 0.5, 'o fio de baixo');
  assert.ok(brilhoDaAresta('dir', 1, repouso).canto < 0.05, 'a direita está de costas');
  assert.ok(brilhoDaAresta('cima', 1, repouso).canto < 0.05, 'a de cima está de costas');
});
caso('o ponto quente corre pela aresta quando o rato inclina a caixa', () => {
  const de = brilhoDaAresta('baixo', 1, repouso).u;
  const para = brilhoDaAresta('baixo', 1, { ...repouso, rotateY: repouso.rotateY + INCLINACAO_MAXIMA }).u;
  assert.ok(Math.abs(para - de) > 0.1, `andou ${Math.abs(para - de).toFixed(3)} da aresta`);
  const cima = brilhoDaAresta('esq', 1, { ...repouso, rotateX: repouso.rotateX - INCLINACAO_MAXIMA }).u;
  assert.notEqual(cima.toFixed(3), brilhoDaAresta('esq', 1, repouso).u.toFixed(3));
});
caso('nunca sai das pontas, e a força fica entre 0 e 1', () => {
  for (let ry = -180; ry <= 180; ry += 30) for (const lado of ['esq', 'dir', 'cima', 'baixo'] as const) for (const f of [1, -1] as const) {
    const b = brilhoDaAresta(lado, f, { ...repouso, virar: ry });
    assert.ok(b.u >= 0.06 && b.u <= 0.94 && b.canto >= 0 && b.canto <= 1 && b.lateral >= 0 && b.lateral <= 1, `${lado} ${f} ${ry}`);
  }
  assert.equal(FORCA_DO_BRILHO, 0.7, 'a força da maquete');
});
caso('a rodar para a letra, a lateral esquerda acende quando vira para a luz', () => {
  assert.ok(brilhoDaAresta('esq', 1, { ...repouso, virar: 60 }).lateral > brilhoDaAresta('esq', 1, repouso).lateral);
});
caso('a capa nas laterais: a faixa da borda espelhada, com o recorte da face e o véu do iPhone', () => {
  assert.match(COMPONENTE, /const g = geometriaDaLateral\(NO_IPHONE\[qual\], lado, espessura\);/);
  assert.match(COMPONENTE, /const recorte = useRecorteDaCapa\(uri\);/);
  assert.match(COMPONENTE, /transform: g\.espelho === 'x' \? 'scaleX\(-1\)' : 'scaleY\(-1\)'/);
  assert.match(COMPONENTE, /rgba\(0,0,0,\$\{g\.veu\.frente\}\), rgba\(0,0,0,\$\{g\.veu\.tras\}\)/);
  assert.match(LEITOR, /capaDasArestas=\{capaGrande\}/);
  // Na Ocultação, a capa velha também fica nas laterais até o disco a tapar.
  assert.match(COMPONENTE, /\{capaQueSai \? <FaixaDaCapa uri=\{capaQueSai\}/);
});
caso('o brilho só mexe posição e opacidade, e só no pintar (que pára quando a caixa assenta)', () => {
  assert.match(COMPONENTE, /p\.i\.style\.transform = p\.vertical \? `translate3d\(0,\$\{d\}px,0\)` : `translate3d\(\$\{d\}px,0,0\)`;/);
  assert.match(COMPONENTE, /p\.i\.style\.opacity = /);
  assert.match(CASCA, /\[data-dt~="m3-fio"\] i, \[data-dt~="m3-labio"\] i, \[data-dt~="m3-lustro"\] i\{ position: absolute; display: block; opacity: 0; will-change: transform, opacity; \}/);
});
caso('o metal escovado saiu', () => {
  assert.ok(!/m3-cromado|m3-escovado/.test(CASCA), 'o cromado do metal');
});
caso('sem o reflexo na face nem o ambiente refletido (o João tirou-os a 5/11)', () => {
  for (const palavra of ['ambiente', 'reflexo']) {
    assert.ok(!new RegExp(`data-dt="[^"]*m3-${palavra}`).test(COMPONENTE), `voltou o ${palavra}`);
    assert.ok(!CASCA.includes(`[data-dt~="m3-${palavra}"]`), `voltou o ${palavra} no CSS`);
  }
});
caso('mexe só transform e opacidade, e pára quando assenta', () => {
  assert.ok(!/transition:/.test(COMPONENTE.replace(/\/\/.*$/gm, '')), 'uma transição CSS no componente: as molas são as da app');
  assert.match(COMPONENTE, /cancelAnimationFrame\(/);
  assert.match(COMPONENTE, /addEventListener\('pointermove', aoMoverORato, \{ passive: true \}\)/);
  assert.match(COMPONENTE, /prefers-reduced-motion/);
});

console.log(falhas === 0 ? '\nTudo bem.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

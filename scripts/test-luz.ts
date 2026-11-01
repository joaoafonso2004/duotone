/**
 * A luz como estado (S2, 1/11): as regras do `lib/luz.ts` e quem as usa (os
 * avisos do PC e do iPhone).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-luz.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CICLO_MAXIMO_MS, criarLuz, DEGRAU_MS, direcaoDoAviso, duracaoDoCiclo, ESTREITEZA_DO_LACO, lacoConico, LARGURA_DA_BANDA,
  LUZ_A_PASSAR_MS, LUZ_MS, OPACIDADE_DA_BANDA, OPACIDADE_DO_DEGRAU, quedaDoReflexo, trajetoDaBanda, TRAVAO, voltaDoDisco,
} from '../src/lib/luz.ts';
import { curvasDoPc } from '../src/lib/molasEmCss.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

console.log('\nregra 2: uma luz a andar de cada vez');
caso('a primeira anda; a segunda, com a primeira a passar, faz o degrau', () => {
  let t = 1000;
  const luz = criarLuz(() => t);
  assert.equal(luz.pedir(700), true);
  t += 300;
  assert.equal(luz.pedir(700), false);
  assert.equal(luz.ocupada(), true);
});
caso('acabada a primeira, a seguinte volta a andar (pelo relógio: uma animação cortada não a prende)', () => {
  let t = 0;
  const luz = criarLuz(() => t);
  luz.pedir(700);
  t = 701;
  assert.equal(luz.ocupada(), false);
  assert.equal(luz.pedir(700), true);
});
caso('o degrau não ocupa a luz: duas segundas seguidas continuam a ser degraus, e a primeira acaba à hora', () => {
  let t = 0;
  const luz = criarLuz(() => t);
  luz.pedir(700);
  t = 100; luz.pedir(700);
  t = 200; luz.pedir(700);
  t = 701;
  assert.equal(luz.pedir(700), true);
});

console.log('\nregra 3: a direção é o significado');
caso('um sucesso → (juntou), uma informação ↓ (chegou), um erro não acende', () => {
  assert.equal(direcaoDoAviso({ tipo: 'feito' }), 'avancar');
  assert.equal(direcaoDoAviso({}), 'avancar');
  assert.equal(direcaoDoAviso({ tipo: 'info' }), 'chegada');
  assert.equal(direcaoDoAviso({ tipo: 'erro' }), null);
  assert.equal(direcaoDoAviso(null), null);
});
caso('com "Undo" e sem mais nada, saiu: ← (o "Removed from Liked Songs")', () => {
  assert.equal(direcaoDoAviso({ desfazer: () => {} }), 'voltar');
  assert.equal(direcaoDoAviso({ tipo: 'feito', desfazer: () => {} }), 'voltar');
});
caso('quem avisa manda: "Added to …" com "Undo" é →, e pode calar a luz', () => {
  assert.equal(direcaoDoAviso({ tipo: 'feito', desfazer: () => {}, luz: 'avancar' }), 'avancar');
  assert.equal(direcaoDoAviso({ tipo: 'feito', luz: null }), null);
});
caso('a banda entra por um lado e sai pelo outro, sem parar à vista', () => {
  for (const d of ['avancar', 'voltar', 'chegada'] as const) {
    const t = trajetoDaBanda(d);
    const [antes, depois] = d === 'voltar' ? [t.para, t.de] : [t.de, t.para];
    // Em larguras da banda: fora à esquerda é <= -1; fora à direita é >= 1/LARGURA.
    assert.ok(antes <= -1, `${d}: começa fora (${antes})`);
    assert.ok(depois >= 1 / LARGURA_DA_BANDA, `${d}: acaba fora (${depois})`);
  }
  assert.equal(trajetoDaBanda('chegada').eixo, 'y');
  assert.ok(trajetoDaBanda('avancar').de < trajetoDaBanda('avancar').para, '→ anda para a direita');
  assert.ok(trajetoDaBanda('voltar').de > trajetoDaBanda('voltar').para, '← anda para a esquerda');
});

console.log('\nregra 4 e os números');
caso('a carregar, no máximo 4 s', () => {
  assert.equal(CICLO_MAXIMO_MS, 4000);
  assert.equal(duracaoDoCiclo(9000), 4000);
  assert.equal(duracaoDoCiclo(1200), 1200);
  assert.equal(duracaoDoCiclo(-5), 0);
});
caso('uma luz que passa, não um flash: o degrau é metade da banda', () => {
  assert.ok(OPACIDADE_DA_BANDA > 0 && OPACIDADE_DA_BANDA <= 0.3);
  assert.equal(OPACIDADE_DO_DEGRAU, OPACIDADE_DA_BANDA / 2);
  assert.ok(DEGRAU_MS < LUZ_MS);
});
caso('a banda é o travão da física, o mesmo do PC e do iPhone (as molas passavam-na em 200 ms)', () => {
  assert.equal(LUZ_MS, curvasDoPc().travar.ms, 'o LUZ_MS é a curva travar do PC');
  assert.match(ler('src/lib/molasEmCss.ts'), new RegExp(`const DESACELERACAO = ${TRAVAO};`));
  // À vista entre 300 e 450 ms: uma luz a passar, como na maquete (~400 ms).
  assert.ok(LUZ_A_PASSAR_MS >= 300 && LUZ_A_PASSAR_MS <= 450, String(LUZ_A_PASSAR_MS));
  // Quando sai pelo outro lado já andou ~90 % do caminho: o resto é fora da superfície.
  const { de, para } = trajetoDaBanda('avancar');
  const andado = 1 - TRAVAO ** LUZ_A_PASSAR_MS;
  assert.ok(Math.abs(de + andado * (para - de) - 1 / LARGURA_DA_BANDA) < 0.02);
});

console.log('\nquem a usa');
caso('PC: o Luz.web anda com o travão, pede a luz pelo tempo à vista e respeita menos movimento', () => {
  const pc = ler('src/desktop/Luz.web.ts');
  assert.match(pc, /const travao = curvasDoPc\(\)\.travar;[\s\S]*duration: travao\.ms, delay: atraso, easing: travao\.curva/);
  assert.match(pc, /pedirLuz\(LUZ_A_PASSAR_MS \+ atraso\)/);
  assert.match(pc, /prefers-reduced-motion: reduce/);
  assert.ok(!/cubic-bezier|\bease\b/.test(pc));
  assert.match(pc, /a\.onfinish = a\.oncancel = \(\) => banda\.remove\(\)/, 'a banda sai do documento');
});
caso('PC: o aviso e o aviso com "Undo" passam a luz e cortam o que lhes sai', () => {
  const ui = ler('src/desktop/ui.web.tsx');
  assert.match(ui, /varrerLuz\(caixa\.current, direcaoDoAviso\(\{ tipo \}\), ATRASO_DA_LUZ_MS\)/);
  assert.match(ui, /toast: \{[^\n]*overflow: 'hidden' \}/);
  const desfazer = ler('src/desktop/AvisoComDesfazer.web.tsx');
  assert.match(desfazer, /varrerLuz\(caixa\.current, direcaoDoAviso\(aviso\), ATRASO_DA_LUZ_MS\); \}, \[aviso\.id\]\)/);
  assert.match(desfazer, /overflow: 'hidden'/);
});
caso('iPhone: a banda trava no driver nativo (em px), com o pedirFluidez e menos movimento', () => {
  const banda = ler('src/components/BandaDeLuz.tsx');
  assert.match(banda, /Animated\.decay\(passo, \{ velocity: caminho \* \(1 - TRAVAO\), deceleration: TRAVAO, useNativeDriver: true \}\)/);
  assert.match(banda, /inputRange: \[0, caminho\][^\n]*extrapolate: 'clamp'/);
  assert.match(banda, /pedirFluidez\(LUZ_A_PASSAR_MS \+ atraso\)/);
  assert.match(banda, /!reduzido && pedirLuz\(LUZ_A_PASSAR_MS \+ atraso\)/);
  assert.match(banda, /pointerEvents="none"/);
  assert.ok(!/Animated\.parallel/.test(banda));
  assert.match(ler('src/components/AvisoDeRemocao.tsx'), /<BandaDeLuz direcao=\{direcaoDoAviso\(mostrado\)\} chave=\{mostrado\.id\}/);
});
caso('os avisos que JUNTAM com "Undo" dizem que é → (senão liam-se como remoções)', () => {
  const largar = ler('src/desktop/alvosDeLargar.web.ts');
  const comDesfazer = [...largar.matchAll(/avisarRemocao\(\{\n?\s*tipo: '(?:feito|info)', texto: [^\n]+/g)].map((m) => m[0]);
  assert.ok(comDesfazer.length >= 4, `encontrei ${comDesfazer.length}`);
  for (const a of comDesfazer) assert.match(a, /luz: 'avancar'/, a);
  assert.match(ler('src/desktop/paginas/PlaylistPages.web.tsx'), /texto: 'Moved\.', luz: 'avancar'/);
});

console.log('\nC3: o laço em disco (o play do PC)');
caso('o laço tem as duas cunhas a 45° e a 225°, e nada a 0°, 90°, 180° e 270° (como o sprite)', () => {
  const laco = lacoConico();
  const alfa = (g: number) => Number(new RegExp(`rgba\\(255,255,255,([\\d.]+)\\) ${g}deg`).exec(laco)?.[1]);
  assert.equal(alfa(45), 1);
  assert.equal(alfa(225), 1);
  for (const g of [0, 90, 180, 270]) assert.equal(alfa(g), 0, `${g}°`);
  assert.ok(alfa(52.5) > alfa(60) && alfa(60) > alfa(67.5), 'a cunha estreita a afastar-se do meio');
  assert.equal(ESTREITEZA_DO_LACO, 6);
});
caso('a luz é mais forte a meio do raio: nada no centro, quase toda a meio, menos na borda', () => {
  const queda = quedaDoReflexo();
  const em = (p: number) => Number(new RegExp(`rgba\\(255,255,255,([\\d.]+)\\) ${p}%`).exec(queda)?.[1]);
  assert.equal(em(0), 0);
  assert.ok(em(50) > 0.99 && em(60) > 0.99);
  assert.ok(em(100) < em(50) && em(100) > 0);
});
caso('a pausa trava meia volta (o travão); o play arranca um quarto com ressalto (SOLTAR)', () => {
  assert.deepEqual(voltaDoDisco(false), { graus: 180, curva: 'travar' });
  assert.deepEqual(voltaDoDisco(true), { graus: 90, curva: 'soltar' });
  assert.ok(curvasDoPc().soltar.pico > 1.1, 'o SOLTAR passa do sítio');
});
caso('o dedo manda: o play ocupa a luz sem perguntar, e nunca encurta uma que já lá está', () => {
  let t = 0;
  const luz = criarLuz(() => t);
  luz.ocupar(400);
  assert.equal(luz.pedir(), false, 'um aviso que chega enquanto o disco roda é o degrau');
  luz.ocupar(100);
  t = 300;
  assert.equal(luz.ocupada(), true, 'os 100 não encurtaram os 400');
  t = 401;
  assert.equal(luz.pedir(), true);
});
caso('o DiscoDeMetal parte do ângulo em que está, usa as curvas do PC, ocupa a luz e respeita menos movimento', () => {
  const d = ler('src/desktop/DiscoDeMetal.web.ts');
  assert.match(d, /const de = anguloAgora\(el\);/);
  assert.match(d, /const c = curvasDoPc\(\)\[curva\];/);
  assert.match(d, /ocuparLuz\(/);
  assert.match(d, /prefers-reduced-motion: reduce/);
  assert.match(d, /mask-composite:intersect/);
  assert.ok(!/cubic-bezier|\bease\b/.test(d));
});
caso('a barra do PC: o disco, o laço por baixo do ícone, e só roda quando o play MUDA', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /\[data-dt~="disco-metal"\]\{ \$\{estiloDoDisco\(\)\} \}/);
  assert.match(casca, /\[data-dt~="reflexo"\]\{ \$\{estiloDoReflexo\(\)\} \}/);
  assert.match(casca, /if \(tocavaAntes\.current === p\.isPlaying\) return;[\s\S]{0,80}rodarReflexo\(reflexo\.current, p\.isPlaying\)/);
  assert.match(casca, /\{\.\.\.marcar\('disco-metal'\)\}[^\n]*<View ref=\{reflexo\} \{\.\.\.marcar\('reflexo'\)\} \/><View style=\{\{ zIndex: 1 \}\}>/);
  assert.ok(!/playButton: \{[^}]*backgroundColor/.test(ler('src/desktop/estilos.web.ts')), 'um fundo no estilo tapava o metal');
});
caso('o mini leitor (outro documento): o mesmo disco nos dois play, e o hover não tapa o metal', () => {
  const mini = ler('src/janelaMini.web.tsx');
  assert.equal((mini.match(/<BotaoDePlay /g) ?? []).length, 2);
  assert.match(mini, /\[data-dt~="disco-metal"\]:hover \{ \$\{estiloDoDisco\(\)\}/);
  assert.match(mini, /\[data-dt~="reflexo"\] \{ \$\{estiloDoReflexo\(\)\} \}/);
  assert.match(mini, /if \(antes\.current === aTocar\) return;[\s\S]{0,60}rodarReflexo\(reflexo\.current, aTocar\)/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

/**
 * As animações do PC -- o CSS global da casca e as marcas que o chamam.
 *
 * Este teste existe por causa de um dia inteiro perdido a 20/9: as animações
 * estavam todas escritas, o CSS estava todo injetado, e NADA se mexia. A razão
 * é que o react-native-web desta versão **deita fora o `className`** de
 * qualquer componente RN -- medido num ecrã de ensaio, com uma sonda que levava
 * as três vias ao mesmo tempo: `className` não chegou ao DOM, `dataSet` e
 * `nativeID` chegaram. Com ele morreram em silêncio o vidro da janela
 * (`glass-panel`), o ponto das barras de progresso (`slider-thumb`) e as
 * animações novas -- e na lista de faixas o play ficava POR CIMA do número,
 * porque a regra que esconde um dos dois nunca se aplicava. Foi assim que a
 * 3.7.0 saiu.
 *
 * Por isso este ficheiro lê o código como TEXTO e prende três coisas:
 *   1. nenhum componente RN volta a levar `className` (um `<div>` a sério pode);
 *   2. toda a marca usada no código tem regra no CSS, e toda a regra tem marca
 *      que a produza -- é o outro lado do mesmo erro, e não dá erro nenhum;
 *   3. quem pediu menos movimento continua a ter por onde o desligar.
 *
 * Correr: node --experimental-strip-types scripts/test-animacoes-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

/** Ficheiros que desenham o PC: tudo o que é `.web`, mais a casca e o ui. */
function ficheirosDoPc(raiz: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) { ficheirosDoPc(caminho, achados); continue; }
    if (/\.web\.tsx?$/.test(nome)) achados.push(caminho.replace(/\\/g, '/'));
  }
  return achados;
}

const FICHEIROS = ficheirosDoPc('src');
const CASCA = readFileSync('src/desktop/casca.web.tsx', 'utf8');

/**
 * Os sítios onde o `className` é legítimo, porque são `<div>` do DOM e num
 * elemento a sério o atributo passa: a fila do Now Playing (precisa de
 * `onPointerDown` e de captura do ponteiro) e a janela do mini leitor (24/9:
 * precisa do `-webkit-app-region` para se arrastar e de hover em CSS).
 */
const COM_LICENCA = new Set(['src/desktop/FilaArrastavel.web.tsx', 'src/janelaMini.web.tsx']);

console.log('\no className não passa em componentes RN');
caso('nenhum ficheiro do PC lhe volta a tocar', () => {
  const culpados: string[] = [];
  for (const f of FICHEIROS) {
    if (COM_LICENCA.has(f)) continue;
    const linhas = readFileSync(f, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      // Só a passagem da prop conta; falar dela num comentário é o que este
      // ficheiro e o `marcar` fazem.
      if (/className\s*[=:]/.test(linha) && !/^\s*\*/.test(linha) && !linha.includes('//')) {
        culpados.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(culpados, [], `usa className (o RNW deita-o fora): ${culpados.join(', ')}`);
});

caso('o ficheiro com licença é mesmo um <div> e não um componente RN', () => {
  for (const f of COM_LICENCA) {
    const s = readFileSync(f, 'utf8');
    const m = s.match(/<div[\s\S]{0,400}?className=/);
    assert.ok(m, `${f} está na lista de exceções mas o className não está num <div>`);
  }
});

caso('o marcador continua a ser o dataSet, e não outra coisa', () => {
  const ui = readFileSync('src/desktop/ui.web.tsx', 'utf8');
  assert.match(ui, /export const marcar = \(\.\.\.nomes: string\[\]\) => \(\{ dataSet: \{ dt: nomes\.join\(' '\) \} \}/,
    'o `marcar` mudou de forma -- se deixar de escrever `dataSet`, nada chega ao DOM');
});

console.log('\ncada marca tem regra, e cada regra tem marca');
/** As marcas que o código põe nos elementos. */
const usadas = new Set<string>();
for (const f of FICHEIROS) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/marcar\(([^)]*)\)/g)) {
    for (const nome of m[1].matchAll(/'([^']+)'/g)) usadas.add(nome[1]);
  }
}
/** As marcas que o CSS global espera. */
const noCss = new Set<string>();
for (const m of CASCA.matchAll(/\[data-dt~="([^"]+)"\]/g)) noCss.add(m[1]);

caso('há marcas dos dois lados (senão este teste não prova nada)', () => {
  assert.ok(usadas.size >= 15, `só ${usadas.size} marcas no código`);
  assert.ok(noCss.size >= 15, `só ${noCss.size} marcas no CSS`);
});
caso('nenhuma marca do código ficou sem regra', () => {
  const orfas = [...usadas].filter((n) => !noCss.has(n)).sort();
  assert.deepEqual(orfas, [], `marcadas no código e sem CSS: ${orfas.join(', ')}`);
});
caso('nenhuma regra do CSS ficou sem quem a marque', () => {
  const orfas = [...noCss].filter((n) => !usadas.has(n)).sort();
  assert.deepEqual(orfas, [], `no CSS e em elemento nenhum: ${orfas.join(', ')}`);
});

console.log('\nas regras que custaram a encontrar ficam presas');
caso('a lista troca o número pelo play, e não os mostra aos dois', () => {
  assert.match(CASCA, /\[data-dt~="fila"\] \[data-dt~="toca"\]\{ opacity:0;/,
    'sem isto o play fica por cima do número (o defeito da 3.7.0)');
  assert.match(CASCA, /\[data-dt~="fila"\]:hover \[data-dt~="numero"\][^{]*\{ opacity:0; \}/,
    'o número tem de sair quando o play entra');
});
caso('o realce que desliza acompanha também a ALTURA', () => {
  const bloco = CASCA.match(/\[data-dt~="desliza"\]\{ transition:[^}]+\}/)?.[0] ?? '';
  for (const prop of ['transform', 'width', 'height']) {
    assert.ok(bloco.includes(prop), `a pílula/realce não transita ${prop}: ${bloco}`);
  }
});
caso('nada de backdrop-filter na superfície da janela', () => {
  // Um backdrop-filter do tamanho da janela refaz-se a cada pintura, e esta
  // janela tem sempre alguma coisa a mexer. O desfoque do fundo é estático e
  // vive no estilo da imagem.
  assert.ok(!/backdrop-filters*:/.test(CASCA), 'voltou o backdrop-filter à superfície');
  const estilos = readFileSync('src/desktop/estilos.web.ts', 'utf8');
  assert.match(estilos, /backgroundImage:[\s\S]{0,400}?filter: 'blur\((\d+)px\) brightness/,
    'o fundo deixou de trazer o desfoque dele');
});
caso('os nomes de classe antigos não voltaram', () => {
  assert.ok(!CASCA.includes('glass-panel'), 'sobrou o nome antigo do vidro');
  assert.ok(!/slider-(container|fill|thumb)/.test(CASCA), 'sobraram as classes antigas da barra');
});
caso('só as primeiras linhas de uma lista é que entram a animar', () => {
  // Uma biblioteca de milhares de faixas arrancava com milhares de animações
  // no mesmo fotograma, e da décima segunda para baixo ninguém as vê.
  const m = CASCA.match(/([^\n]*)\{ animation: dt-linha /);
  assert.ok(m, 'a animação de entrada das linhas desapareceu');
  assert.ok(/nth-child\(-n\+\d+\)|first-child/.test(m[1]),
    `a animação apanha TODAS as linhas: ${m[1].trim()}`);
});

console.log('\nquem pediu menos movimento continua servido');
caso('há um interruptor geral e apanha as animações e as transições', () => {
  // A última: a primeira é a do movimento antigo da casca.
  const i = CASCA.lastIndexOf('prefers-reduced-motion');
  assert.ok(i > 0, 'não há media query de movimento reduzido');
  const bloco = CASCA.slice(i, i + 1200);
  assert.ok(bloco.includes('animation: none !important'), 'as animações não são desligadas');
  assert.ok(bloco.includes('transition: none !important'), 'as transições não são desligadas');
});

console.log(falhas === 0 ? '\nTudo bem.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

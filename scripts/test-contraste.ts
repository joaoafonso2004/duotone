/**
 * O contraste do texto, medido pela regra WCAG 2.1, nas duas paletas.
 *
 * Existe porque um tom apagado é fácil de baixar mais um bocadinho, e o
 * terceiro nível de texto -- os tempos da barra, as legendas, o "Next: …" --
 * já tinha ficado em 2,9 nos dois lados (medido a 12/9). O mínimo para texto
 * normal é 4,5.
 *
 * Lê os ficheiros como TEXTO de propósito: o `tokens.web.ts` faz `require` das
 * fontes e o `theme/index.ts` importa o React Native, e nenhum dos dois abre
 * em Node puro.
 *
 * Correr: node --experimental-strip-types scripts/test-contraste.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/** O mínimo da WCAG para texto normal. O de texto grande (3.0) não serve aqui:
 *  estes tons são usados em legendas pequenas. */
const MINIMO = 4.5;

type Cor = [number, number, number, number];

function cor(valor: string): Cor {
  const rgba = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(valor);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] ? Number(rgba[4]) : 1];
  const hex = /^#([0-9a-f]{6})$/i.exec(valor.trim());
  assert.ok(hex, `cor que não sei ler: ${valor}`);
  const n = parseInt(hex![1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

/** A cor de cima resolvida sobre a de baixo -- os tons com alfa dependem dela. */
function sobre(frente: Cor, fundo: Cor): Cor {
  const a = frente[3];
  return [
    frente[0] * a + fundo[0] * (1 - a),
    frente[1] * a + fundo[1] * (1 - a),
    frente[2] * a + fundo[2] * (1 - a),
    1,
  ];
}

function luminancia([r, g, b]: Cor): number {
  const canal = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(frente: string, fundo: string): number {
  const f = cor(fundo);
  const a = luminancia(sobre(cor(frente), f)) + 0.05;
  const b = luminancia(f) + 0.05;
  return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
}

/** O valor de um token, tal como está escrito no ficheiro. */
function token(ficheiro: string, nome: string): string {
  const m = new RegExp(`\\b${nome}:\\s*'([^']+)'`).exec(ler(ficheiro));
  assert.ok(m, `não encontrei o token ${nome} em ${ficheiro}`);
  return m![1]!;
}

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const PC = 'src/desktop/tokens.web.ts';
const IOS = 'src/theme/index.ts';

console.log('\no texto do PC sobre as superfícies onde aparece');
for (const [nome, fundo] of [['fundo', 'fundo'], ['painel', 'painel'], ['elevado', 'elevado']] as const) {
  caso(`os três níveis de texto passam sobre o ${nome}`, () => {
    const superficie = token(PC, fundo);
    for (const nivel of ['texto', 'textoMedio', 'textoFraco']) {
      const r = razao(token(PC, nivel), superficie);
      assert.ok(r >= MINIMO, `${nivel} sobre ${nome}: ${r} (mínimo ${MINIMO})`);
    }
  });
}

console.log('\no texto do iPhone');
for (const [nome, fundo] of [['fundo', 'bg'], ['superfície', 'surface'], ['superfície alta', 'surfaceHigh']] as const) {
  caso(`os três níveis de texto passam sobre a ${nome}`, () => {
    const superficie = token(IOS, fundo);
    for (const nivel of ['text', 'textSecondary', 'textTertiary']) {
      const r = razao(token(IOS, nivel), superficie);
      assert.ok(r >= MINIMO, `${nivel} sobre ${nome}: ${r} (mínimo ${MINIMO})`);
    }
  });
}

console.log('\na hierarquia continua a ler-se');
caso('cada nível é mais apagado do que o anterior, nos dois lados', () => {
  const pc = ['texto', 'textoMedio', 'textoFraco'].map((n) => razao(token(PC, n), token(PC, 'painel')));
  const ios = ['text', 'textSecondary', 'textTertiary'].map((n) => razao(token(IOS, n), token(IOS, 'surface')));
  for (const [onde, r] of [['PC', pc], ['iPhone', ios]] as const) {
    assert.ok(r[0]! > r[1]! && r[1]! > r[2]!, `${onde}: ${r.join(' > ')} não desce sempre`);
  }
});

caso('os tons antigos reprovariam -- e por isso este teste morde', () => {
  // Os valores que la estavam ate 12/9. Se alguem os repuser, o teste apanha.
  assert.ok(razao('#5A5C66', token(PC, 'painel')) < MINIMO, 'o #5A5C66 passaria?');
  assert.ok(razao('rgba(245,245,247,0.34)', token(IOS, 'surface')) < MINIMO, 'os 34% passariam?');
});

console.log('\na própria conta');
caso('o branco sobre preto dá 21, e uma cor sobre ela própria dá 1', () => {
  assert.equal(razao('#FFFFFF', '#000000'), 21);
  assert.equal(razao('#123456', '#123456'), 1);
});
caso('o alfa conta com o fundo por baixo', () => {
  // O mesmo branco a 34% dá contrastes diferentes sobre fundos diferentes.
  assert.ok(razao('rgba(255,255,255,0.34)', '#000000') < razao('rgba(255,255,255,0.9)', '#000000'));
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

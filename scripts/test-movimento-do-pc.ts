/**
 * Uma física no PC (S1 da auditoria de 31/10): as curvas do PC são as molas do
 * iPhone (`lib/movimento.ts`) em CSS `linear()`, calculadas pelo
 * `lib/molasEmCss.ts`. O João: "faz, desde que não fique podre".
 *
 * Havia 12 `cubic-bezier` diferentes nos `.web.*`, mais `ease` e `ease-out`
 * soltos: dois botões lado a lado respondiam de maneiras diferentes, e o PC não
 * se mexia como o iPhone. Este teste falha com uma curva solta num `.web.*`.
 * As durações da coreografia ficam (é por isso que não fica "podre"): o que
 * muda é a forma.
 *
 * Correr: node --experimental-strip-types scripts/test-movimento-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cssDasMolas, curvaDoPc, curvasDoPc } from '../src/lib/molasEmCss.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function webDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n);
    return statSync(f).isDirectory() ? webDe(f) : /\.web\.tsx?$/.test(n) ? [f] : [];
  });
}
const DO_PC = webDe('src').map((f) => ({ f: f.replace(/\\/g, '/'), s: ler(f) }));

/** Avalia um `linear(...)` em x (0 a 1), como o browser. */
function avaliar(linear: string, x: number): number {
  const pts = linear.replace(/^linear\(|\)$/g, '').split(',').map((p) => p.trim().split(/\s+/));
  const n = pts.length;
  const pontos = pts.map(([v, pct], i) => ({ x: pct ? parseFloat(pct) / 100 : i / (n - 1), y: parseFloat(v) }));
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1], b = pontos[i];
    if (x <= b.x) return a.y + ((x - a.x) / (b.x - a.x || 1)) * (b.y - a.y);
  }
  return 1;
}

console.log('\nas molas em CSS');
const c = curvasDoPc();
caso('as quatro molas do iPhone, com as durações que o script de 31/10 mediu', () => {
  assert.deepEqual(
    { premir: c.premir.ms, soltar: c.soltar.ms, estado: c.estado.ms, entrada: c.entrada.ms },
    { premir: 423, soltar: 799, estado: 619, entrada: 666 },
  );
});
caso('o PREMIR não passa do sítio; o SOLTAR e o ESTADO passam (o ressalto pequeno do iPhone)', () => {
  assert.ok(c.premir.pico <= 1.001, `premir: ${c.premir.pico}`);
  assert.ok(c.soltar.pico > 1.1 && c.soltar.pico < 1.14, `soltar: ${c.soltar.pico}`);
  assert.ok(c.estado.pico > 1.07 && c.estado.pico < 1.11, `estado: ${c.estado.pico}`);
});
caso('cada curva começa em 0, acaba em 1 e tem poucos pontos', () => {
  for (const [nome, v] of Object.entries(c)) {
    if (nome === 'sair') continue;
    assert.match(v.curva, /^linear\(0, .+, 1\)$/, nome);
    assert.ok(v.curva.split(',').length < 40, `${nome}: ${v.curva.split(',').length} pontos`);
    assert.equal(avaliar(v.curva, 0), 0);
    assert.equal(avaliar(v.curva, 1), 1);
  }
});
caso('a ENTRADA já está quase no sítio a um terço do tempo (não fica lenta ao encurtá-la)', () => {
  assert.ok(avaliar(c.entrada.curva, 1 / 3) > 0.9, String(avaliar(c.entrada.curva, 1 / 3)));
});
caso('o bloco define as seis e põe a --dt-curva e a --dt-mola em cima das molas', () => {
  const css = cssDasMolas();
  for (const n of ['premir', 'soltar', 'estado', 'entrada', 'travar', 'sair']) {
    assert.match(css, new RegExp(`--dt-${n}: [^;]+; --dt-${n}-ms: \\d+ms;`), n);
  }
  assert.match(css, /--dt-curva: var\(--dt-entrada\); --dt-mola: var\(--dt-soltar\);/);
  assert.equal(curvaDoPc('soltar'), c.soltar.curva);
});

console.log('\nos .web.* usam as molas');
caso('nenhum cubic-bezier solto: a única fica no lib/molasEmCss.ts (a do "sair")', () => {
  assert.deepEqual(DO_PC.filter(({ s }) => /cubic-bezier\(/.test(s)).map(({ f }) => f), []);
});
caso('nenhum ease, ease-in ou ease-out numa animação que acaba (os laços infinitos podem respirar)', () => {
  const soltos = DO_PC.flatMap(({ f, s }) => s.split('\n').map((l, i) => ({ f, i: i + 1, l })))
    .filter(({ l }) => /\b(?:transition|animation|easing)\b/i.test(l) && /(?<![\w-])ease(?:-in|-out|-in-out)?(?![\w-])/.test(l) && !/infinite|Infinity|IterationCount/.test(l))
    .map(({ f, i }) => `${f}:${i}`);
  assert.deepEqual(soltos, []);
});
caso('a casca e o mini leitor (outra janela, outro documento) definem as molas', () => {
  assert.match(ler('src/desktop/casca.web.tsx'), /\$\{cssDasMolas\(\)\}/);
  assert.match(ler('src/janelaMini.web.tsx'), /\$\{cssDasMolas\(\)\}/);
});
caso('carregar num botão é o PREMIR, largar é o SOLTAR, com as durações deles (o mesmo botão do iPhone)', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /\[data-dt~="premir"\]\{ transition: transform var\(--dt-soltar-ms\) var\(--dt-soltar\),/);
  assert.match(casca, /\[data-dt~="premir"\]:active\{ transform: scale\(\.97\); transition: transform var\(--dt-premir-ms\) var\(--dt-premir\),/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

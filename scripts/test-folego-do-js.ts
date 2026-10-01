/**
 * O fôlego do JavaScript -- src/lib/folegoDoJs.ts (1/10).
 *
 * Correr: node --experimental-strip-types scripts/test-folego-do-js.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dadosDoEventoLento, JANELA_MS, lerHermes, MAXIMO_DE_TRAVOES, registarTravao, resumoDoFolego, textoDoFolego,
  TRAVAO_MINIMO_MS, TRAVAO_SENTIDO_MS, type Contexto, type Travao,
} from '../src/lib/folegoDoJs.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

const T0 = 1_800_000_000_000;
const ctx: Contexto = { abertaHaMin: 95, fila: 812, avisoDoLeitorMs: 14, linhasMontadas: 240, heapMB: 180, recolhas: 900, recolhasMs: 41_000 };

caso('um fotograma perdido não é um travão, e sem nada a mudar a lista é a mesma', () => {
  const lista: Travao[] = [{ em: T0, ms: 300, visivel: true }];
  const depois = registarTravao(lista, { em: T0 + 500, ms: TRAVAO_MINIMO_MS - 1, visivel: true });
  assert.equal(depois, lista, 'sem lixo a cada meio segundo');
});

caso('um travão entra; os velhos saem; há teto', () => {
  let lista: readonly Travao[] = [{ em: T0, ms: 300, visivel: true }];
  lista = registarTravao(lista, { em: T0 + 1000, ms: 1500, visivel: true });
  assert.equal(lista.length, 2);
  lista = registarTravao(lista, { em: T0 + JANELA_MS + 500, ms: 200, visivel: true });
  assert.deepEqual(lista.map((t) => t.ms), [1500, 200], 'o de há mais de 15 min saiu');
  let muitos: readonly Travao[] = [];
  for (let i = 0; i < MAXIMO_DE_TRAVOES + 50; i++) muitos = registarTravao(muitos, { em: T0 + i, ms: 150, visivel: true });
  assert.equal(muitos.length, MAXIMO_DE_TRAVOES);
});

caso('o resumo conta só com a app à frente', () => {
  const r = resumoDoFolego([
    { em: T0, ms: 1800, visivel: true },
    { em: T0 + 1, ms: 200, visivel: true },
    { em: T0 + 2, ms: 9000, visivel: false },
  ]);
  assert.deepEqual(r, { travoes: 2, sentidos: 1, maiorMs: 1800, presoMs: 2000 });
});

caso('as estatísticas do Hermes, com o que faltar a null', () => {
  assert.deepEqual(lerHermes({ js_heapSize: 188_743_680, js_numGCs: 900, js_gcTime: 41.2 }), { heapMB: 180, recolhas: 900, recolhasMs: 41_200 });
  assert.deepEqual(lerHermes(undefined), { heapMB: null, recolhas: null, recolhasMs: null });
  assert.deepEqual(lerHermes({ js_heapSize: 'x' }), { heapMB: null, recolhas: null, recolhasMs: null });
});

caso('o texto diz o que cresce, e os piores com a hora', () => {
  const texto = textoDoFolego([{ em: T0 - 30_000, ms: 1800, visivel: true }, { em: T0 - 5_000, ms: 120, visivel: true }], ctx, T0);
  assert.match(texto, /stalls: 2 over 100 ms, 1 over 500 ms, longest 1800 ms/);
  assert.match(texto, /app open for 95 min · queue 812 songs · list rows mounted 240 · one player update reaches everyone in 14 ms/);
  assert.match(texto, /memory 180 MB · garbage collections 900 \(41000 ms in total\)/);
  assert.match(texto, /  1800 ms, 30 s ago/);
  assert.ok(!/120 ms, /.test(texto), `só se listam os que se sentem (>= ${TRAVAO_SENTIDO_MS} ms)`);
});

caso('o evento leva só números', () => {
  const d = dadosDoEventoLento(1234.6, { ...ctx, avisoDoLeitorMs: null });
  assert.deepEqual(d, { ms: 1235, aberta_min: 95, fila: 812, linhas: 240, heap_mb: 180, gcs: 900, gc_ms: 41_000 });
  assert.ok(Object.values(d).every((v) => typeof v === 'number'));
});

caso('a ligação: só no iPhone, no relatório, e cada linha conta-se', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(ler('App.tsx'), /if \(Platform\.OS !== 'web'\) iniciarMedidorDoFolego\(\);/);
  assert.match(ler('src/lib/relatorioDeReproducao.ts'), /\$\{textoDoFolegoAgora\(\)\}/);
  assert.match(ler('src/components/TrackRow.tsx'), /useEffect\(\(\) => contarLinhaMontada\(\), \[\]\);/);
  assert.match(ler('src/state/folego.ts'), /const conta = !saltar && atraso <= 20_000;/, 'a app suspensa não conta');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
console.log('\nFôlego do JavaScript: todos os casos passaram.');

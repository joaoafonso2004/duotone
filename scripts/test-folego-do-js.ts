/**
 * O fôlego do JavaScript -- src/lib/folegoDoJs.ts (1/10).
 *
 * Correr: node --experimental-strip-types scripts/test-folego-do-js.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dadosDoEventoLento, JANELA_MS, juntarAmostra, lerAmostra, lerHermes, MAXIMO_DE_AMOSTRAS, MAXIMO_DE_TRAVOES,
  registarTravao, resumoDoFolego, ritmoDosPares, textoDaMemoria, textoDoFolego,
  TRAVAO_MINIMO_MS, TRAVAO_SENTIDO_MS, type AmostraDaMemoria, type Contexto, type Travao,
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

console.log('\na memória por minuto (4/10)');
const am = (min: number, recolhas: number, mb: number | null, visivel = true): AmostraDaMemoria =>
  ({ em: T0 + min * 60_000, recolhas, recolhasMs: recolhas * 2, alocadoMB: mb, visivel });
caso('lê as estatísticas do Hermes; sem as recolhas não há amostra', () => {
  assert.deepEqual(lerAmostra({ js_numGCs: 10, js_gcTime: 0.5, js_totalAllocatedBytes: 3 * 1_048_576 }, T0, true),
    { em: T0, recolhas: 10, recolhasMs: 500, alocadoMB: 3, visivel: true });
  assert.equal(lerAmostra({ js_gcTime: 0.5 }, T0, true), null);
  assert.equal(lerAmostra(undefined, T0, true)?.alocadoMB ?? null, null);
});
caso('o arranque e o resto ficam separados', () => {
  const lista = [am(0, 0, 0), am(1, 600, 90), am(2, 660, 100), am(3, 720, 110)];
  const linhas = textoDaMemoria(lista);
  assert.match(linhas[0], /first minute after opening: 600 collections\/min, 1200 ms\/min, 90 MB allocated\/min/);
  assert.match(linhas[1], /last minutes with the app open: 60 collections\/min, 120 ms\/min, 10 MB allocated\/min \(over 2 min\)/);
});
caso('o tempo em segundo plano não entra (o par que o atravessa fica de fora)', () => {
  const lista = [am(0, 0, 0), am(1, 100, 10), am(2, 160, 16, false), am(30, 200, 20), am(31, 220, 22)];
  const r = ritmoDosPares(lista.slice(1));
  assert.equal(r?.minutos, 1, 'só o minuto 30-31: o 1-2 acaba na saída e o 2-30 atravessa o segundo plano');
  assert.equal(ritmoDosPares([am(0, 0, 0), am(0.2, 5, 1)]), null, 'menos de meio minuto não diz nada');
});
caso('sem o alocado, diz só as recolhas; e a lista tem teto', () => {
  assert.doesNotMatch(textoDaMemoria([am(0, 0, null), am(1, 60, null), am(2, 90, null)])[1], /allocated/);
  let l: readonly AmostraDaMemoria[] = [];
  for (let i = 0; i < MAXIMO_DE_AMOSTRAS + 5; i++) l = juntarAmostra(l, am(i, i, i));
  assert.equal(l.length, MAXIMO_DE_AMOSTRAS);
  assert.match(textoDoFolego([], ctx, T0, [am(0, 0, 0), am(1, 60, 6)]), /first minute after opening: 60 collections/);
});

caso('a ligação: só no iPhone, no relatório, e cada linha conta-se', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(ler('App.tsx'), /if \(Platform\.OS !== 'web'\) iniciarMedidorDoFolego\(\);/);
  assert.match(ler('src/lib/relatorioDeReproducao.ts'), /\$\{textoDoFolegoAgora\(\)\}/);
  assert.match(ler('src/components/TrackRow.tsx'), /useEffect\(\(\) => contarLinhaMontada\(\), \[\]\);/);
  assert.match(ler('src/state/folego.ts'), /const conta = !saltar && atraso <= 20_000;/, 'a app suspensa não conta');
  // Com o ecrã desligado não acorda o iPhone (1/10): só se agenda à frente.
  assert.match(ler('src/state/folego.ts'), /if \(AppState\.currentState !== 'background'\) agendar\(\);\r?\n  \};/, 'o passo pára em segundo plano');
  assert.match(ler('src/state/folego.ts'), /clearTimeout\(timer\);\r?\n    if \(vivo && estado !== 'background'\) agendar\(\);/, 'e volta ao voltar');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
console.log('\nFôlego do JavaScript: todos os casos passaram.');

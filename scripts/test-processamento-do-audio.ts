/**
 * Quanto o processamento de um download prende o JavaScript -- a parte pura
 * (src/lib/processamentoDoAudio.ts) e o que segue para a analítica
 * (src/state/medicoes.ts).
 *
 * Correr: node --experimental-strip-types scripts/test-processamento-do-audio.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOQUEIO_QUE_SE_SENTE_MS, MAXIMO_DE_MEDIDAS, juntarMedida, maiorBloqueio, processamentoVazio,
  textoDoProcessamento, type MedidaDoProcessamento,
} from '../src/lib/processamentoDoAudio.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const medida = (over: Partial<MedidaDoProcessamento> = {}): MedidaDoProcessamento => ({
  ...processamentoVazio(), em: Date.parse('2026-10-03T10:00:00Z'), bytes: 3_800_000,
  formato: 'aac', prioridade: 'tocar', aFrente: true, ...over,
});

console.log('\no bloqueio');
caso('o que prende de uma vez é converter + corrigir + escrever, sem o juntar', () => {
  assert.equal(maiorBloqueio({ juntarMs: 40, converterMs: 0, corrigirMs: 12, escreverMs: 30 }), 42);
});

console.log('\no anel');
caso('guarda as últimas e não muda a lista que recebe', () => {
  let lista: MedidaDoProcessamento[] = [];
  for (let i = 0; i < MAXIMO_DE_MEDIDAS + 5; i++) {
    const antes = lista;
    lista = juntarMedida(lista, medida({ em: i }));
    assert.notEqual(lista, antes);
  }
  assert.equal(lista.length, MAXIMO_DE_MEDIDAS);
  assert.equal(lista[0].em, 5);
});

console.log('\no relatório');
caso('sem downloads diz isso', () => {
  assert.match(textoDoProcessamento([]), /No downloads finished/);
});
caso('cada linha diz o tamanho, o formato e as fases', () => {
  const texto = textoDoProcessamento([
    medida({ corrigirMs: 12.4, escreverMs: 30.2, juntarMs: 6 }),
    medida({ formato: 'opus', converterMs: 180, escreverMs: 25, prioridade: 'adiantar', bytes: 4_200_000 }),
  ]);
  assert.match(texto, /3\.8 MB aac \(tocar\): fix 12 ms · write 30 ms · join 6 ms -> blocked 43 ms/);
  assert.match(texto, /4\.2 MB opus \(adiantar\): convert 180 ms · write 25 ms/);
  assert.match(texto, /worst 205 ms \(4\.2 MB opus\)/);
  assert.match(texto, new RegExp(`1 of 2 at ${BLOQUEIO_QUE_SE_SENTE_MS} ms or more`));
});
caso('com a app escondida não entra no resumo (não há toques para atrasar)', () => {
  const texto = textoDoProcessamento([
    medida({ corrigirMs: 10 }),
    medida({ corrigirMs: 900, aFrente: false }),
  ]);
  assert.match(texto, /app hidden/);
  assert.match(texto, /worst 10 ms/);
  assert.match(textoDoProcessamento([medida({ aFrente: false })]), /All downloads finished with the app hidden/);
});

console.log('\nligado ao download e à analítica');
caso('o youtubeCache mede as quatro fases', () => {
  const cache = readFileSync('src/lib/youtubeCache.ts', 'utf8');
  for (const fase of ['juntarMs', 'converterMs', 'corrigirMs', 'escreverMs'])
    assert.ok(cache.includes(`proc.${fase}`), `falta medir ${fase}`);
});
caso('o download_terminado leva o bloqueio', () => {
  const medicoes = readFileSync('src/state/medicoes.ts', 'utf8');
  assert.match(medicoes, /ms_js:/);
});
caso('o relatório do iPhone tem a secção', () => {
  assert.match(readFileSync('src/lib/relatorioDeReproducao.ts', 'utf8'), /textoDoProcessamentoAgora\(\)/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

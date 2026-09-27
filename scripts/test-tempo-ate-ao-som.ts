/**
 * Tempo até ao primeiro som -- src/lib/tempoAteAoSom.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-tempo-ate-ao-som.ts
 */
import assert from 'node:assert/strict';
import {
  INSTANTANEO_MS, ULTIMAS, juntarArranque, resumir, textoDoTempoAteAoSom, type Arranque,
} from '../src/lib/tempoAteAoSom.ts';

const a = (titulo: string, totalMs: number, origem = 'ficheiro', fases: Partial<Arranque> = {}): Arranque => ({
  titulo, origem, totalMs, resolverMs: null, filaMs: null, downloadMs: null, mb: null, em: 1_790_000_000_000, ...fases,
});

let lista: Arranque[] = [];
for (let i = 0; i < ULTIMAS + 5; i++) lista = juntarArranque(lista, a(`faixa ${i}`, 100));
assert.equal(lista.length, ULTIMAS, 'guarda só as últimas');
assert.equal(lista[0].titulo, `faixa ${ULTIMAS + 4}`, 'a mais recente primeiro');

const medidas = [
  a('Cali Girl', 180, 'cache'),
  a('Lucid Dreams', 240, 'cache'),
  a('RATHER LIE', 3400, 'ficheiro', { resolverMs: 900, filaMs: 1600, downloadMs: 700, mb: 3.1 }),
  a('crush', 2600, 'ficheiro', { resolverMs: 800, filaMs: 1200, downloadMs: 400, mb: 2.4 }),
];
const r = resumir(medidas);
assert.equal(r.faixas, 4);
assert.equal(r.instantaneas, 2, `até ${INSTANTANEO_MS} ms conta como instantâneo`);
assert.equal(r.faseMaisLenta, 'fila', 'diz onde se perdeu mais tempo nas que não estavam prontas');
assert.equal(r.p90Ms, 3400);

const texto = textoDoTempoAteAoSom(medidas);
assert.match(texto, /^== time to first sound ==/);
assert.match(texto, /instant \(<=700 ms\) 2\/4/);
assert.match(texto, /slowest part when not ready: fila/);
assert.match(texto, /\[cache\] Cali Girl -- already on the phone/);
assert.match(texto, /resolve 0\.9s, queue 1\.6s, download 0\.7s \(3\.1 MB\)/);

assert.match(textoDoTempoAteAoSom([]), /no songs measured yet/, 'sem medidas, diz o que fazer');
assert.equal(resumir([a('x', 100, 'cache')]).faseMaisLenta, null, 'só cache: não há fase lenta');

console.log('Tempo até ao primeiro som: passou.');

/**
 * Dois toques na capa do leitor para gostar (7/10) -- src/lib/duploToque.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-duplo-toque.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deveGuardar, duploToque, JANELA_DO_DUPLO_TOQUE_MS } from '../src/lib/duploToque.ts';

assert.equal(JANELA_DO_DUPLO_TOQUE_MS, 300, 'a janela do iOS');
assert.equal(duploToque(0, 1000), false, 'o primeiro toque não é duplo');
assert.equal(duploToque(1000, 1200), true, 'dois toques a 200 ms');
assert.equal(duploToque(1000, 1300), true, 'no limite');
assert.equal(duploToque(1000, 1301), false, 'dois toques soltos não gostam');
assert.equal(duploToque(1000, 900), false, 'um relógio que anda para trás não conta');

assert.equal(deveGuardar(false), true, 'por guardar: guarda');
assert.equal(deveGuardar(true), false, 'já guardada: o duplo toque NUNCA tira');
assert.equal(deveGuardar(null), false, 'sem saber, não mexe');

const leitor = readFileSync(new URL('../src/components/PlayerRoot.tsx', import.meta.url), 'utf8');
assert.match(leitor, /<DuploToqueParaGostar aoGostar=\{aoGostar\} \/>/, 'a face da capa tem o duplo toque');
assert.match(leitor, /const aoGostarPelaCapa = useCallback\(\(\) => gostarPelaCapa\.current\(\), \[\]\);/,
  'a função é estável (a capa é memorizada)');
assert.match(leitor, /deveGuardar\(saved\)/, 'só gosta');
const camada = readFileSync(new URL('../src/components/DuploToqueParaGostar.tsx', import.meta.url), 'utf8');
assert.match(camada, /accessible=\{false\}/, 'fora do VoiceOver (dois toques lá são "ativar")');
assert.match(camada, /pedirFluidez\(/, 'a animação nativa pede os 120 Hz');
assert.match(camada, /useNativeDriver: true/);

console.log('Duplo toque na capa: só gosta, dentro de 300 ms, e o coração fica.');

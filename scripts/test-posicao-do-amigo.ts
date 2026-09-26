// Onde vai a música de um amigo (lib/posicaoDoAmigo.ts).
import assert from 'node:assert/strict';
import { posicaoDoAmigo } from '../src/lib/posicaoDoAmigo.ts';

const t0 = Date.parse('2026-09-26T12:00:00Z');
const f = { positionMs: 30_000, rate: 1, updatedAt: new Date(t0).toISOString(), durationSeconds: 200 };
assert.deepEqual(posicaoDoAmigo(f, t0), { ms: 30_000, fracao: 0.15 }, 'no instante da amostra');
assert.equal(posicaoDoAmigo(f, t0 + 10_000)!.ms, 40_000, 'anda com o tempo do servidor');
assert.equal(posicaoDoAmigo({ ...f, rate: 1.5 }, t0 + 10_000)!.ms, 45_000, 'à velocidade dele');
assert.equal(posicaoDoAmigo(f, t0 + 999_000)!.fracao, 1, 'nunca passa do fim');
assert.equal(posicaoDoAmigo(f, t0 - 5_000)!.ms, 30_000, 'um relógio atrás não anda para trás');
assert.equal(posicaoDoAmigo({ ...f, rate: 99 }, t0 + 10_000)!.ms, 40_000, 'velocidade sem juízo conta como 1');
assert.equal(posicaoDoAmigo({ ...f, positionMs: undefined }, t0), null, 'sem posição (sem a migração) não há barra');
assert.equal(posicaoDoAmigo({ ...f, durationSeconds: null }, t0), null, 'sem duração não há fração');
assert.equal(posicaoDoAmigo(null, t0), null);
console.log('Posição do amigo: passou.');

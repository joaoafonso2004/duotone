/**
 * A barra do leitor desliza em vez de saltar -- src/lib/barraSuave.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-barra-suave.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ondeVai, PASSO_MS, proximoTrajeto, SALTO_MS } from '../src/lib/barraSuave.ts';

const D = 200_000; // uma música de 3:20
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const base = { anterior: null, agora: 0, duracaoMs: D, aTocar: true, ritmo: 1 };

// A primeira posição salta para o sítio e aponta um passo à frente.
let r = proximoTrajeto({ ...base, posicaoMs: 10_000 });
assert.equal(r.saltar, true);
assert.ok(perto(r.trajeto.de, 10_000 / D));
assert.ok(perto(r.trajeto.para, (10_000 + PASSO_MS) / D), 'aponta para onde a música vai estar daqui a um passo');

// A seguinte, a tempo: continua de onde a barra está, sem saltar.
const t1 = r.trajeto;
r = proximoTrajeto({ ...base, anterior: t1, agora: PASSO_MS, posicaoMs: 11_000 });
assert.equal(r.saltar, false, 'uma posição a tempo não é um salto');
assert.ok(perto(r.trajeto.de, ondeVai(t1, PASSO_MS)!), 'parte de onde a barra está');
assert.ok(perto(r.trajeto.para, 12_000 / D));

// Um pequeno desvio corrige-se a andar; um grande é um salto (seek, faixa nova).
r = proximoTrajeto({ ...base, anterior: t1, agora: PASSO_MS, posicaoMs: 11_400 });
assert.equal(r.saltar, false, 'um desvio de 0,4 s corrige-se a andar');
r = proximoTrajeto({ ...base, anterior: t1, agora: PASSO_MS, posicaoMs: 11_000 + SALTO_MS + 100 });
assert.equal(r.saltar, true, 'um seek salta');
r = proximoTrajeto({ ...base, anterior: t1, agora: PASSO_MS, posicaoMs: 0 });
assert.equal(r.saltar, true, 'uma faixa nova volta ao início de uma vez');

// Parada (pausa, leitor fechado, app em segundo plano): fica onde a música está.
r = proximoTrajeto({ ...base, anterior: t1, agora: 300, posicaoMs: 10_300, aTocar: false });
assert.equal(r.saltar, true);
assert.equal(r.trajeto.duracao, 0, 'sem animação: nada a redesenhar');
assert.ok(perto(r.trajeto.para, 10_300 / D));

// A velocidade conta: a 0,8x a música anda 0,8 s por segundo.
r = proximoTrajeto({ ...base, posicaoMs: 10_000, ritmo: 0.8 });
assert.ok(perto(r.trajeto.para, (10_000 + 0.8 * PASSO_MS) / D));

// Nunca passa do fim, e sem duração fica no 0.
r = proximoTrajeto({ ...base, posicaoMs: D - 200 });
assert.equal(r.trajeto.para, 1);
r = proximoTrajeto({ ...base, duracaoMs: 0, posicaoMs: 5000 });
assert.equal(r.trajeto.para, 0);
assert.equal(r.trajeto.duracao, 0);

// ondeVai: o meio do trajeto é o meio do caminho.
assert.ok(perto(ondeVai({ de: 0, para: 1, inicio: 0, duracao: 1000 }, 500)!, 0.5));
assert.equal(ondeVai({ de: 0, para: 1, inicio: 0, duracao: 1000 }, 5000), 1);
assert.equal(ondeVai(null, 0), null);

// A barra anima pela transformação (nativa), e só com o leitor aberto e à frente.
const barra = readFileSync(new URL('../src/components/ProgressBar.tsx', import.meta.url), 'utf8');
assert.match(barra, /useNativeDriver: true,\s*\}\)\.start\(\);\s*\}\s*\}, \[positionMs/, 'a animação da posição é nativa');
assert.doesNotMatch(barra, /width: `\$\{fraction \* 100\}%`/, 'a largura por percentagem não volta');
const leitor = readFileSync(new URL('../src/components/PlayerRoot.tsx', import.meta.url), 'utf8');
assert.match(leitor, /s\.isPlaying && s\.expanded\) && AppState\.currentState === 'active'/,
  'fechado ou em segundo plano não anima: o ecrã não fica a redesenhar-se');

console.log('Barra suave: passou.');

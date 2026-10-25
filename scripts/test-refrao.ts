/**
 * O refrão primeiro -- src/lib/refrao.ts.
 *
 * node --experimental-strip-types scripts/test-refrao.ts
 *
 * A fixture é a curva "Most replayed" de um vídeo a sério (o `next` do WEB, um
 * pedido de verificação a 25/10), com o refrão aos 0:43.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  estimativaDoRefrao, marcadoresDaResposta, PRE_ESCUTA_S, refraoDaCurva, refraoDaResposta, type Marcador,
} from '../src/lib/refrao.ts';

function t(nome: string, f: () => void) {
  f();
  console.log(`  ok - ${nome}`);
}

const resposta = JSON.parse(readFileSync(new URL('./fixtures/heatmap-next.json', import.meta.url), 'utf8'));

t('lê os 100 marcadores da resposta', () => {
  const m = marcadoresDaResposta(resposta)!;
  assert.equal(m.length, 100);
  assert.equal(m[0].inicioS, 0);
  assert.equal(m[0].intensidade, 1, 'o mais repetido de todos é o início');
});

t('o refrão a sério (0:43): ignora o início, e entra um pouco antes', () => {
  const r = refraoDaResposta(resposta, 213);
  assert.equal(r.daCurva, true);
  assert.ok(r.inicioS >= 37 && r.inicioS <= 43, `começou aos ${r.inicioS}`);
});

/** Uma curva sintética: alta no início, um pico em `picoS`, o resto baixo. */
function curva(duracaoS: number, picoS: number | null): Marcador[] {
  const passo = duracaoS / 100;
  return Array.from({ length: 100 }, (_, i) => {
    const s = i * passo;
    const inicio = Math.max(0, 1 - s / 15) * 0.9;
    const pico = picoS == null ? 0 : Math.exp(-(((s - picoS) / 6) ** 2)) * 0.6;
    return { inicioS: s, duracaoS: passo, intensidade: 0.15 + inicio + pico };
  });
}

t('um pico depois do início: encontra-o', () => {
  const r = refraoDaCurva(curva(200, 95), 200)!;
  assert.ok(r >= 86 && r <= 95, `${r}`);
});

t('sem pico (só o início): não inventa, fica a estimativa', () => {
  assert.equal(refraoDaCurva(curva(200, null), 200), null);
  const r = refraoDaResposta({}, 210);
  assert.equal(r.daCurva, false);
  assert.equal(r.inicioS, 70);
});

t('nunca deixa a pré-escuta passar do fim', () => {
  const r = refraoDaCurva(curva(120, 115), 120);
  assert.ok(r == null || r <= 120 - PRE_ESCUTA_S, `${r}`);
  assert.equal(estimativaDoRefrao(30), 10);
  assert.equal(estimativaDoRefrao(10), 0);
  assert.equal(estimativaDoRefrao(null), 60);
});

t('respostas estragadas não rebentam', () => {
  assert.equal(marcadoresDaResposta(null), null);
  assert.equal(marcadoresDaResposta({ frameworkUpdates: {} }), null);
  assert.equal(marcadoresDaResposta({ frameworkUpdates: { entityBatchUpdate: { mutations: [{ payload: { macroMarkersListEntity: { markersList: { markerType: 'MARKER_TYPE_CHAPTERS', markers: [] } } } }] } } }), null);
});

console.log('O refrão primeiro: a curva a sério, os picos, a estimativa e o fim passaram.');

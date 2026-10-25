/**
 * O ritmo de uma janela de música -- src/lib/ritmo.ts (o AutoMix, 25/10).
 *
 * node --experimental-strip-types scripts/test-ritmo.ts
 *
 * Gera batidas sintéticas (bombo nos tempos 1 e 3, tarola no 2 e no 4,
 * pratos nas colcheias) a andamentos conhecidos, passa-as pela MESMA conta do
 * Swift (`energiasPorQuadro`) e confirma o andamento, os tempos fortes e onde
 * o som começa e acaba.
 */
import assert from 'node:assert/strict';
import { ataques, compactar, CONFIANCA_MINIMA, descompactar, energiasDoNativo, energiasPorQuadro, ritmoDaJanela } from '../src/lib/ritmo.ts';

function t(nome: string, f: () => void) {
  f();
  console.log(`  ok - ${nome}`);
}

const TAXA = 44100;

/** Uma batida a `bpm`, com `silencioAntes` e `silencioDepois` segundos calados. */
function batida(bpm: number, segundos: number, silencioAntes = 0, silencioDepois = 0, semente = 1): Float32Array {
  let r = semente;
  const ruido = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 1073741824 - 1; };
  const total = Math.round((silencioAntes + segundos + silencioDepois) * TAXA);
  const s = new Float32Array(total);
  const periodo = 60 / bpm;
  for (let b = 0; b * periodo < segundos; b++) {
    const inicio = Math.round((silencioAntes + b * periodo) * TAXA);
    const kick = b % 4 === 0 || b % 4 === 2;
    for (let i = 0; i < TAXA * 0.25 && inicio + i < total; i++) {
      const tempo = i / TAXA;
      if (silencioAntes + b * periodo + tempo > silencioAntes + segundos) break;
      if (kick) s[inicio + i] += 0.8 * Math.sin(2 * Math.PI * 55 * tempo) * Math.exp(-tempo * 14);
      else s[inicio + i] += 0.35 * ruido() * Math.exp(-tempo * 25);
    }
    // Pratos nas colcheias.
    for (const meio of [0, 0.5]) {
      const ini = Math.round((silencioAntes + (b + meio) * periodo) * TAXA);
      for (let i = 0; i < TAXA * 0.03 && ini + i < total; i++) s[ini + i] += 0.08 * ruido() * Math.exp(-(i / TAXA) * 120);
    }
  }
  return s;
}

const perto = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
/** O andamento a menos da oitava: com o bombo de dois em dois tempos, 160 e 80
 * são a mesma grelha, e o AutoMix aceita o dobro e a metade. */
const pertoNaOitava = (a: number, b: number, tol: number) =>
  assert.ok([a, a * 2, a / 2].some((x) => Math.abs(x - b) <= tol), `bpm: ${a} vs ${b}`);

t('140 BPM: o andamento, o primeiro tempo forte e onde o som começa', () => {
  const e = energiasPorQuadro(batida(140, 40, 1.5), TAXA);
  const r = ritmoDaJanela(e, 'inicio')!;
  assert.ok(r, 'sem ritmo');
  pertoNaOitava(r.bpm, 140, 0.6);
  perto(r.somS, 1.5, 0.05, 'onde começa');
  perto(r.temposFortesS[0], 1.5, 0.04, 'o primeiro tempo forte');
  perto(r.temposFortesS[1] - r.temposFortesS[0], (60 / 140) * 4, 0.02, 'um compasso');
  assert.ok(r.confianca > CONFIANCA_MINIMA * 3, `confiança ${r.confianca}`);
});

for (const bpm of [92, 128, 160]) {
  t(`${bpm} BPM`, () => {
    const r = ritmoDaJanela(energiasPorQuadro(batida(bpm, 35, 0.4, 0, bpm), TAXA), 'inicio')!;
    pertoNaOitava(r.bpm, bpm, 0.8);
    perto(r.temposFortesS[0], 0.4, 0.05, 'o primeiro tempo forte');
  });
}

t('a janela do fim: onde o som acaba, e os tempos fortes no tempo da faixa', () => {
  // A janela começa aos 150 s da faixa; a música acaba 3 s antes do fim dela.
  const e = energiasPorQuadro(batida(140, 40, 0, 3), TAXA, 150);
  const r = ritmoDaJanela(e, 'fim')!;
  perto(r.somS, 190, 0.35, 'onde acaba');
  assert.ok(r.temposFortesS.every((x) => x >= 150 && x <= 193));
  perto(r.temposFortesS[0], 150, 0.04, 'o primeiro tempo forte da janela');
});

/** Números ao acaso com semente (mulberry32): o mesmo ruído em todas as corridas. */
const acaso = (semente: number) => () => {
  semente = (semente + 0x6d2b79f5) | 0;
  let x = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

t('ruído sem batida: abaixo da confiança mínima', () => {
  for (const semente of [7, 11, 99]) {
    const r0 = acaso(semente);
    const s = new Float32Array(TAXA * 30).map(() => 0.2 * (r0() * 2 - 1));
    const r = ritmoDaJanela(energiasPorQuadro(s, TAXA), 'inicio');
    assert.ok(!r || r.confianca < CONFIANCA_MINIMA, `confiança ${r?.confianca}`);
  }
  // Ruído com o volume a mudar ao acaso, mais parecido com música sem batida.
  const r1 = acaso(3);
  const s = new Float32Array(TAXA * 30);
  let amp = 0.1;
  for (let i = 0; i < s.length; i++) { if (i % 2205 === 0) amp = 0.05 + 0.3 * r1(); s[i] = amp * (r1() * 2 - 1); }
  const r = ritmoDaJanela(energiasPorQuadro(s, TAXA), 'inicio');
  assert.ok(!r || r.confianca < CONFIANCA_MINIMA, `confiança ${r?.confianca}`);
});

t('silêncio ou janela curta: sem ritmo', () => {
  assert.equal(ritmoDaJanela(energiasPorQuadro(new Float32Array(TAXA * 20), TAXA), 'inicio'), null);
  assert.equal(ritmoDaJanela(energiasPorQuadro(batida(120, 4), TAXA), 'inicio'), null);
});

t('o que o nativo manda volta às duas listas', () => {
  const e = energiasDoNativo([86.13, 12.5, -30, -20, -28, -18, -40, -35])!;
  assert.equal(e.fps, 86.13);
  assert.equal(e.inicioS, 12.5);
  assert.deepEqual(e.graves, [-30, -28, -40]);
  assert.deepEqual(e.total, [-20, -18, -35]);
  assert.equal(energiasDoNativo([0, 0]), null);
});

t('os ataques nunca são negativos e não explodem na entrada do som', () => {
  const o = ataques(energiasPorQuadro(batida(120, 20, 2), TAXA));
  assert.ok(o.every((v) => v >= 0 && v <= 30));
});

t('guardado em seis números, volta igual (a grelha refaz-se)', () => {
  const r = ritmoDaJanela(energiasPorQuadro(batida(140, 40, 1.5), TAXA), 'inicio')!;
  const de = descompactar(JSON.parse(JSON.stringify(compactar(r))))!;
  assert.equal(de.temposFortesS.length, r.temposFortesS.length);
  de.temposFortesS.forEach((x, k) => assert.ok(Math.abs(x - r.temposFortesS[k]) < 1e-6));
  assert.ok(Math.abs(de.bpm - r.bpm) < 0.001 && Math.abs(de.somS - r.somS) < 0.001);
  assert.equal(compactar(null), null);
  assert.equal(descompactar(null), null);
  assert.equal(descompactar([1, 2, 3]), null);
  assert.equal(descompactar([140, 0, 1, 0, 3, 0]), null, 'período zero');
});

console.log('O ritmo de uma janela (AutoMix): andamentos, tempos fortes, início e fim do som passaram.');

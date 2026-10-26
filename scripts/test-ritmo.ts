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
import {
  ataques, camelot, compactar, CONFIANCA_MINIMA, descompactar, distanciaHarmonica, energiasDoNativo, energiasPorQuadro,
  nomeDoTom, ritmoDaJanela, semitonsParaCasar, TOM_CONFIAVEL, tomDoCroma,
} from '../src/lib/ritmo.ts';

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

/** Um tapete de acordes sem ataques (uma intro ou uma cauda só com melodia). */
function tapete(segundos: number, amplitude = 0.25): Float32Array {
  const s = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < s.length; i++) {
    const x = i / TAXA;
    // Entra e sai devagar: nada que pareça um bombo.
    const env = Math.min(1, x / 2, (segundos - x) / 2);
    s[i] = amplitude * env * (Math.sin(2 * Math.PI * 220 * x) + 0.6 * Math.sin(2 * Math.PI * 277.2 * x) + 0.5 * Math.sin(2 * Math.PI * 329.6 * x)) / 2.1;
  }
  return s;
}
const juntar = (...partes: Float32Array[]) => {
  const s = new Float32Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { s.set(p, i); i += p.length; }
  return s;
};

t('uma intro só com melodia: a batida começa depois dela, no tempo forte (26/10)', () => {
  const r = ritmoDaJanela(energiasPorQuadro(juntar(tapete(12), batida(124, 28)), TAXA), 'inicio')!;
  pertoNaOitava(r.bpm, 124, 0.8);
  perto(r.somS, 0, 0.5, 'o som começa logo');
  perto(r.batidaS!, 12, (60 / 124) * 4 + 0.1, 'a batida começa no fim da intro');
  assert.ok(r.temposFortesS.some((x) => Math.abs(x - r.batidaS!) < 0.05), 'num tempo forte');
});

t('uma cauda só com melodia: a batida acaba antes do som', () => {
  // Janela do fim aos 150 s: 30 s de batida e 10 s de cauda.
  const r = ritmoDaJanela(energiasPorQuadro(juntar(batida(124, 30), tapete(10)), TAXA, 150), 'fim')!;
  perto(r.batidaS!, 180, (60 / 124) * 4 + 0.1, 'a batida acaba aos 30 s da janela');
  assert.ok(r.somS > 187, `o som continua (${r.somS})`);
});

t('com batida do princípio ao fim: começa no primeiro tempo forte e acaba com o som', () => {
  const i = ritmoDaJanela(energiasPorQuadro(batida(140, 40, 1.5), TAXA), 'inicio')!;
  perto(i.batidaS!, i.temposFortesS[0], 0.01, 'início');
  const f = ritmoDaJanela(energiasPorQuadro(batida(140, 40, 0, 3), TAXA, 150), 'fim')!;
  perto(f.batidaS!, f.somS, (60 / 140) * 4 + 0.05, 'fim');
});

/**
 * Um trap: um 808 longo e sincopado (bombos na 1.ª, 8.ª e 11.ª semicolcheia,
 * com deslize), palmas no 3 e hi-hats em semicolcheias com rolos.
 */
function trap(bpm: number, segundos: number, hats: number, semente: number): Float32Array {
  const r = acaso(semente);
  const s = new Float32Array(Math.round(segundos * TAXA));
  const tempo = 60 / bpm;
  for (let c = 0; c * tempo * 4 < segundos; c++) {
    const t0 = c * tempo * 4;
    for (const k of [0, 7, 10]) {
      const ini = Math.round((t0 + (k * tempo) / 4) * TAXA);
      for (let i = 0; i < TAXA * 0.9 && ini + i < s.length; i++) {
        const x = i / TAXA;
        s[ini + i] += 0.7 * Math.sin(2 * Math.PI * (50 + 30 * Math.exp(-x * 20)) * x) * Math.exp(-x * 2.5);
      }
    }
    const palma = Math.round((t0 + 2 * tempo) * TAXA);
    for (let i = 0; i < TAXA * 0.15 && palma + i < s.length; i++) s[palma + i] += 0.4 * (r() * 2 - 1) * Math.exp(-(i / TAXA) * 30);
    for (let k = 0; k < 16; k++) {
      const passos = c % 2 === 1 && k >= 12 ? 2 : 1;
      for (let j = 0; j < passos; j++) {
        const ini = Math.round((t0 + ((k + j / passos) * tempo) / 4) * TAXA);
        for (let i = 0; i < TAXA * 0.025 && ini + i < s.length; i++) s[ini + i] += hats * (r() * 2 - 1) * Math.exp(-(i / TAXA) * 150);
      }
    }
  }
  return s;
}

t('trap: o 808 sincopado não engana o andamento (a soma dos múltiplos, 26/10)', () => {
  // Antes: 140 saía 81,7, 150 saía 87,5, 130 saía 73,1 (o intervalo entre dois 808).
  for (const [bpm, hats] of [[140, 0.12], [150, 0.2], [130, 0.08], [160, 0.12], [145, 0.15], [170, 0.1]] as const) {
    const r = ritmoDaJanela(energiasPorQuadro(trap(bpm, 40, hats, bpm), TAXA), 'inicio')!;
    pertoNaOitava(r.bpm, bpm, 0.8);
    assert.ok(r.confianca >= CONFIANCA_MINIMA, `${bpm}: confiança ${r.confianca}`);
  }
});

t('trap: com os agudos, o "um" cai no compasso e não no 808 sincopado (26/10)', () => {
  // Antes dos agudos, 150, 160 e 170 caíam três semicolcheias ao lado. O 150
  // (hi-hats muito fortes) ainda cai: fica de fora, e está na decisão.
  for (const [bpm, hats] of [[140, 0.12], [130, 0.08], [160, 0.12], [145, 0.15], [170, 0.1]] as const) {
    const r = ritmoDaJanela(energiasPorQuadro(trap(bpm, 40, hats, bpm), TAXA), 'inicio')!;
    const compasso = (60 / bpm) * 4;
    const resto = ((r.temposFortesS[0] % compasso) + compasso) % compasso;
    assert.ok(Math.min(resto, compasso - resto) < 0.05, `${bpm}: o primeiro tempo forte aos ${r.temposFortesS[0]}`);
  }
});

t('as 12 notas dão a tonalidade, e a roda Camelot diz quais casam (26/10)', () => {
  const maior = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const rodar = (perfil: number[], t: number) => perfil.map((_, i) => perfil[(i - t + 12) % 12]);
  const sol = tomDoCroma(rodar(maior, 7))!;
  assert.deepEqual([sol.tonica, sol.menor], [7, false]);
  assert.ok(sol.confianca > 0.99);
  // Dó-mi-sol é dó maior; um perfil plano não diz nada.
  const triade = Array(12).fill(0.05);
  triade[0] = 1; triade[4] = 0.8; triade[7] = 0.9;
  assert.deepEqual(tomDoCroma(triade)!.tonica, 0);
  assert.ok(tomDoCroma(Array(12).fill(1))!.confianca < TOM_CONFIAVEL);
  assert.equal(tomDoCroma(null), null);
  // A roda: dó maior 8B, lá menor 8A (a relativa), sol 9B, fá 7B.
  const tom = (tonica: number, menor = false) => ({ tonica, menor, confianca: 1 });
  assert.deepEqual([nomeDoTom(tom(0)), nomeDoTom(tom(9, true)), nomeDoTom(tom(7)), nomeDoTom(tom(5))], ['8B', '8A', '9B', '7B']);
  assert.deepEqual(camelot(tom(0)), { numero: 8, letra: 'B' });
  assert.equal(distanciaHarmonica(tom(0), tom(9, true)), 1, 'a relativa casa');
  assert.equal(distanciaHarmonica(tom(0), tom(7)), 1, 'uma quinta casa');
  assert.equal(distanciaHarmonica(tom(0), tom(2)), 2, 'dó e ré não');
  // Os semitons que casam: dó para ré, +2; já casadas, 0; longe de mais, null.
  assert.equal(semitonsParaCasar(tom(0), tom(2)), 2);
  assert.equal(semitonsParaCasar(tom(0), tom(7)), 0);
  assert.equal(semitonsParaCasar(tom(0), tom(6), 2), 1, 'ré bemol (3B) e fá sustenido (2B) estão a uma quinta');
  assert.equal(semitonsParaCasar(tom(0), tom(6, true), 2), null, 'fá sustenido menor (11A) fica longe de mais');
});

t('o formato novo do nativo: as bandas à frente, as 12 notas, e três números por quadro', () => {
  const notas = Array.from({ length: 12 }, (_, i) => (i === 0 ? 1 : 0.1));
  const e = energiasDoNativo([3, 86.13, 12.5, ...notas, -30, -20, -40, -28, -18, -38])!;
  assert.equal(e.fps, 86.13);
  assert.equal(e.inicioS, 12.5);
  assert.deepEqual(e.croma, notas);
  assert.deepEqual(e.graves, [-30, -28]);
  assert.deepEqual(e.total, [-20, -18]);
  assert.deepEqual(e.agudos, [-40, -38]);
  // O de antes continua a ler-se, sem agudos nem notas.
  assert.equal(energiasDoNativo([86.13, 12.5, -30, -20, -28, -18])!.agudos, undefined);
  // E a tonalidade guarda-se com o ritmo (dez números).
  const r = { bpm: 120, periodoS: 0.5, confianca: 9, temposFortesS: [1, 3], somS: 0.5, batidaS: 1, tom: { tonica: 9, menor: true, confianca: 0.8 } };
  const de = descompactar(JSON.parse(JSON.stringify(compactar(r))))!;
  assert.deepEqual(de.tom, { tonica: 9, menor: true, confianca: 0.8 });
});

t('o onde-há-batida também se guarda, e os ritmos antigos (seis números) continuam a ler-se', () => {
  const r = ritmoDaJanela(energiasPorQuadro(juntar(tapete(12), batida(124, 28)), TAXA), 'inicio')!;
  const de = descompactar(JSON.parse(JSON.stringify(compactar(r))))!;
  assert.ok(Math.abs(de.batidaS! - r.batidaS!) < 0.001);
  const antigo = descompactar([140, 0.43, 9, 1, 10, 0.5])!;
  assert.equal(antigo.batidaS, undefined);
});

console.log('O ritmo de uma janela (AutoMix): andamentos, tempos fortes, início e fim do som e da batida passaram.');

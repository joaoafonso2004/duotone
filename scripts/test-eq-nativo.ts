/**
 * O Swift do iOS nao se compila aqui. O que SE pode verificar e se a
 * matematica que la esta escrita produz a mesma curva que o PC ja usa.
 *
 * Porta-se `Coeficientes.peaking` e a recorrencia da forma direta II
 * transposta de `DuotoneEq.swift` para JS, linha a linha, e compara-se com o
 * `respostaDb` do lib/equalizer.ts -- que por sua vez ja esta validado digito
 * a digito contra o getFrequencyResponse do Chrome.
 *
 * Isto apanha o que mais provavelmente estaria errado e passaria despercebido:
 * um sinal trocado nos coeficientes ou na actualizacao do estado.
 */
import { BANDAS, PERFIS, respostaDb } from '../src/lib/equalizer.ts';

const TAXA = 48000;
const Q = 1;

/** Porte de `Coeficientes.peaking` (DuotoneEq.swift), normalizado por a0. */
function peaking(f0: number, ganhoDb: number) {
  if (ganhoDb === 0) return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  const A = Math.pow(10, ganhoDb / 40);
  const w0 = (2 * Math.PI * f0) / TAXA;
  const alfa = Math.sin(w0) / (2 * Q);
  const cos0 = Math.cos(w0);
  const a0 = 1 + alfa / A;
  return {
    b0: (1 + alfa * A) / a0,
    b1: (-2 * cos0) / a0,
    b2: (1 - alfa * A) / a0,
    a1: (-2 * cos0) / a0,
    a2: (1 - alfa / A) / a0,
  };
}

/** A magnitude analitica de um biquad ja normalizado. */
function magnitudeDb(c: ReturnType<typeof peaking>, f: number) {
  const w = (2 * Math.PI * f) / TAXA;
  const c1 = Math.cos(w), s1 = Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nRe = c.b0 + c.b1 * c1 + c.b2 * c2;
  const nIm = -(c.b1 * s1 + c.b2 * s2);
  const dRe = 1 + c.a1 * c1 + c.a2 * c2;
  const dIm = -(c.a1 * s1 + c.a2 * s2);
  return 20 * Math.log10(Math.hypot(nRe, nIm) / Math.hypot(dRe, dIm));
}

/**
 * Porte da recorrencia de `filtrar`: forma direta II transposta.
 * Corre um seno e mede a amplitude a saida -- e assim que se apanha um sinal
 * trocado na actualizacao do estado, que a magnitude analitica nao apanharia.
 */
function ganhoMedidoDb(ganhos: number[], f: number, margem = 1) {
  const cs = BANDAS.map((hz, i) => peaking(hz, ganhos[i] ?? 0));
  const estados = cs.map(() => ({ s1: 0, s2: 0 }));
  const N = 48000; // um segundo: chega para o transiente assentar
  let soma = 0;
  let contadas = 0;
  for (let n = 0; n < N; n++) {
    let x = Math.sin((2 * Math.PI * f * n) / TAXA);
    for (let b = 0; b < cs.length; b++) {
      const c = cs[b], e = estados[b];
      const y = c.b0 * x + e.s1;
      e.s1 = c.b1 * x - c.a1 * y + e.s2;
      e.s2 = c.b2 * x - c.a2 * y;
      x = y;
    }
    x *= margem;
    // So a segunda metade: a primeira ainda tem o transiente dos filtros.
    if (n > N / 2) { soma += x * x; contadas++; }
  }
  // RMS e nao pico. O pico de um seno AMOSTRADO depende da fase: a 4 kHz com
  // 48 kHz sao 12 amostras por periodo, e a amostra mais alta pode ficar a
  // cos(15 graus) do topo -- 0,3 dB abaixo do valor real. Isso chegou a fazer
  // este teste acusar o filtro de um erro que era do proprio teste.
  const rms = Math.sqrt(soma / contadas);
  return 20 * Math.log10(rms * Math.SQRT2);
}

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

console.log('\nos coeficientes do Swift dao a curva do PC');
for (const p of PERFIS) {
  for (const f of [40, 60, 100, 250, 1000, 4000, 12000]) {
    const doSwift = BANDAS.reduce((soma, hz, i) => soma + magnitudeDb(peaking(hz, p.ganhos[i]), f), 0);
    const doPc = respostaDb(p.ganhos, f);
    if (Math.abs(doSwift - doPc) > 0.01) {
      check(`${p.nome} @ ${f} Hz`, false, `swift ${doSwift.toFixed(3)} vs pc ${doPc.toFixed(3)}`);
    }
  }
  check(`${p.nome}: a curva bate certo em todas as frequencias`, true);
}

console.log('\na recorrencia (forma direta II transposta) esta certa');
// Se um sinal estivesse trocado na actualizacao do estado, a curva analitica
// continuaria certa mas o filtro a correr dava outra coisa.
for (const p of PERFIS.filter((x) => x.id !== 'flat')) {
  for (const f of [60, 250, 1000, 4000]) {
    const medido = ganhoMedidoDb(p.ganhos, f);
    const previsto = respostaDb(p.ganhos, f);
    const ok = Math.abs(medido - previsto) < 0.2;
    if (!ok) check(`${p.nome} @ ${f} Hz`, false, `medido ${medido.toFixed(2)} vs previsto ${previsto.toFixed(2)}`);
  }
  check(`${p.nome}: o filtro a correr da o que a curva promete`, true);
}

console.log('\na margem faz o que diz');
const bass = PERFIS.find((p) => p.id === 'bass')!.ganhos;
const semMargem = ganhoMedidoDb(bass, 60, 1);
const comMargem = ganhoMedidoDb(bass, 60, Math.pow(10, -8.1 / 20));
check('sem margem, passa de 0 dB', semMargem > 7.9, semMargem.toFixed(2));
check('com a margem, fica em 0 dB', Math.abs(comMargem) < 0.2, comMargem.toFixed(2));

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);

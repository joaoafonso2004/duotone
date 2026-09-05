import assert from 'node:assert/strict';
import {
  podeCrossfade, deveComecarCrossfade, volumesDoCrossfade, acaoAoInterromper,
} from '../src/lib/crossfade.ts';

const base = {
  duracaoDoFade: 6,
  duracaoSegundos: 200,
  posicaoSegundos: 100,
  temFaixaSeguinte: true,
  repeatUma: false,
  backendNativo: true,
  seguinteCarregada: true,
  aDecorrer: false,
};

// --- pode? ---
assert.equal(podeCrossfade(base), true);
assert.equal(podeCrossfade({ ...base, duracaoDoFade: 0 }), false, 'desligado nas definições');
assert.equal(podeCrossfade({ ...base, backendNativo: false }), false, 'o embed não tem dois motores');
assert.equal(podeCrossfade({ ...base, repeatUma: true }), false, 'repetir a mesma não é passagem');
assert.equal(podeCrossfade({ ...base, temFaixaSeguinte: false }), false);
// A duração do YouTube mente: sem ela não se sabe onde é o fim.
assert.equal(podeCrossfade({ ...base, duracaoSegundos: null }), false);
assert.equal(podeCrossfade({ ...base, duracaoSegundos: 0 }), false);
assert.equal(podeCrossfade({ ...base, duracaoSegundos: NaN }), false);
// Faixa curta de mais: cruzar 6s numa de 8s é quase só fade.
assert.equal(podeCrossfade({ ...base, duracaoSegundos: 8 }), false);
assert.equal(podeCrossfade({ ...base, duracaoSegundos: 12 }), true, 'o dobro do fade já chega');

// --- é agora? ---
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 100 }), false, 'ainda falta muito');
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 194 }), true, 'faltam exactamente 6s');
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 197 }), true);
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 193.9 }), false);
// Uma vez só: quem já está a passar não recomeça a cada tique.
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 197, aDecorrer: true }), false);
// Sem a seguinte pronta não se começa, senão entrava silêncio.
assert.equal(deveComecarCrossfade({ ...base, posicaoSegundos: 197, seguinteCarregada: false }), false);
// Numa faixa curta, o instante zero já cairia dentro da janela.
assert.equal(
  deveComecarCrossfade({ ...base, duracaoSegundos: 12, posicaoSegundos: 0 }), false,
  'a posição tem de ter andado',
);

// --- os volumes ---
const t = (x: number) => volumesDoCrossfade(x, 6, 1, 1);
assert.ok(Math.abs(t(0).sai - 1) < 1e-9 && Math.abs(t(0).entra) < 1e-9, 'começa com a antiga inteira');
assert.ok(Math.abs(t(6).sai) < 1e-9 && Math.abs(t(6).entra - 1) < 1e-9, 'acaba com a nova inteira');
// A prova da curva: a POTÊNCIA somada é constante. Com uma passagem linear,
// isto daria 0,5 a meio e ouvia-se o buraco.
for (const x of [0, 1.5, 3, 4.5, 6]) {
  const v = t(x);
  assert.ok(Math.abs(v.sai ** 2 + v.entra ** 2 - 1) < 1e-9, `potência constante em ${x}s`);
}
// Fora do intervalo não se estraga: nada de volumes negativos nem acima do teto.
assert.deepEqual(t(-5), t(0));
assert.deepEqual(t(99), t(6));
// Cada faixa respeita o SEU teto de loudness.
const comTetos = volumesDoCrossfade(3, 6, 0.8, 0.5);
assert.ok(comTetos.sai <= 0.8 && comTetos.entra <= 0.5);
assert.ok(Math.abs(comTetos.sai - 0.8 * Math.SQRT1_2) < 1e-9);
// Duração inválida não divide por zero: entrega a nova já no seu teto.
assert.deepEqual(volumesDoCrossfade(1, 0, 1, 0.9), { sai: 0, entra: 0.9 });

// --- interrupções ---
assert.equal(acaoAoInterromper('pausa'), 'suspender', 'quem pausa quer voltar');
for (const motivo of ['salto', 'anterior', 'faixa-nova', 'fechar'] as const) {
  assert.equal(acaoAoInterromper(motivo), 'cortar');
}
// Um seek tira a posição do fim: a razão da passagem desaparece.
assert.equal(acaoAoInterromper('seek'), 'cortar');

console.log('Crossfade: condições, momento, curva de igual potência e interrupções passaram.');

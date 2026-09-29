// O recuo da capa 3D quando a face encaixa (lib/recuoDoEncaixe.ts, 29/9,
// variante B da preview docs/capa-encaixe-recuo.html).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECUO_DO_ENCAIXE, curvaDoRecuo, recuoAos } from '../src/lib/recuoDoEncaixe.ts';

// A mola parte do sítio COM velocidade: no contacto já está a recuar.
assert.equal(recuoAos(0), 0);
assert.ok(recuoAos(8) > 0.1, 'o recuo começa no fotograma do contacto, sem pausa');

// Chega ao ponto mais recuado depressa e volta.
let pico = 0, emQue = 0;
for (let ms = 0; ms <= 400; ms++) { const x = recuoAos(ms); if (x > pico) { pico = x; emQue = ms; } }
assert.ok(Math.abs(pico - 1) < 1e-9, 'normalizada: o ponto mais recuado vale 1');
assert.ok(emQue >= 40 && emQue <= 120, `o ponto mais recuado aos ${emQue} ms`);

// Subtil: passa pouco para a frente e pára.
let frente = 0;
for (let ms = 0; ms <= RECUO_DO_ENCAIXE.duracaoMs; ms++) frente = Math.min(frente, recuoAos(ms));
assert.ok(frente > -0.12, `passa ${(-frente * 100).toFixed(1)}% para a frente -- é uma mola leve, não um salto`);
assert.ok(Math.abs(recuoAos(RECUO_DO_ENCAIXE.duracaoMs)) < 0.002, 'acaba parada no sítio');

// Sem saltos: de milissegundo em milissegundo muda pouco. O mais rápido é logo
// no contacto (~3% do recuo por ms), que é o empurrão; um salto seria muito mais.
for (let ms = 1; ms <= RECUO_DO_ENCAIXE.duracaoMs; ms++) {
  assert.ok(Math.abs(recuoAos(ms) - recuoAos(ms - 1)) < 0.05, `salto aos ${ms} ms`);
}

// A curva nativa: crescente na entrada, 0 nas pontas, fiel à mola.
const { inputRange, outputRange } = curvaDoRecuo();
assert.equal(inputRange.length, outputRange.length);
assert.equal(inputRange[0], 0);
assert.equal(inputRange[inputRange.length - 1], 1);
for (let i = 1; i < inputRange.length; i++) assert.ok(inputRange[i]! > inputRange[i - 1]!, 'a entrada tem de crescer');
assert.equal(outputRange[0], 0, 'no contacto está no sítio (e já em movimento)');
assert.equal(outputRange[outputRange.length - 1], 0, 'no fim, exatamente no sítio');
assert.ok(Math.max(...outputRange) > 0.97, 'a amostragem apanha o ponto mais recuado');
// Entre amostras, a reta não se afasta da mola mais do que 3% do recuo.
for (let ms = 0; ms <= RECUO_DO_ENCAIXE.duracaoMs; ms += 2) {
  const u = ms / RECUO_DO_ENCAIXE.duracaoMs;
  const j = inputRange.findIndex((x) => x >= u);
  const i0 = Math.max(0, j - 1);
  const f = inputRange[j] === inputRange[i0] ? 0 : (u - inputRange[i0]!) / (inputRange[j]! - inputRange[i0]!);
  const linear = outputRange[i0]! + (outputRange[j]! - outputRange[i0]!) * f;
  const esperado = ms === RECUO_DO_ENCAIXE.duracaoMs ? 0 : recuoAos(ms);
  assert.ok(Math.abs(linear - esperado) < 0.03, `a curva nativa afasta-se da mola aos ${ms} ms`);
}

// Os números da variante B.
assert.equal(RECUO_DO_ENCAIXE.profundidade, 0.04);
assert.equal(RECUO_DO_ENCAIXE.desce, 2);

// Ligado na app: a face bate (ease-in), o recuo corre a partir do contacto, e as
// laterais de cima e da direita só aparecem nele (sem a face, via-se o interior).
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hook = ler('src/hooks/useMontagemDaCapa.ts');
assert.match(hook, /Easing\.in\(Easing\.cubic\)/, 'a face chega a acelerar');
assert.match(hook, /Animated\.timing\(a\.encaixe, \{ toValue: 1, duration: RECUO_DO_ENCAIXE\.duracaoMs, easing: Easing\.linear/,
  'o recuo percorre a curva à velocidade do relógio');
assert.ok(!/Animated\.timing\(a\.assentar/.test(hook), 'o assentar de 2 pt depois de a face parar saiu');
const cubo = ler('src/components/ArtworkLyricsCube.tsx');
assert.match(cubo, /const fechaACaixa=lado==='direita'\|\|lado==='cima';/, 'as laterais escondidas fecham a caixa');
assert.match(cubo, /fechaACaixa\?Animated\.multiply\(pose3D\.pose,m\.fecho\)/, 'e só aparecem no contacto');
const capa = ler('src/components/CapaFlutuante3D.tsx');
assert.match(capa, /Animated\.add\(recuoZ, recuoDoEncaixe\)/, 'o recuo do encaixe soma-se ao do skip');

console.log('Recuo do encaixe: passou.');

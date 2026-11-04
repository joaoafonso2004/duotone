// A barra de volume do PC numa curva de ouvido (16/10; em dB desde 4/11).
// Correr: node --experimental-strip-types scripts/test-curva-do-volume.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  barraParaACurva, curvaQuadraticaParaDb, dbDaBarra, PISO_DB, volumeParaOMotor,
} from '../src/lib/curvaDoVolume.ts';

const db = (barra: number) => dbDaBarra(barra);

// --- o que não muda ---------------------------------------------------------
assert.equal(volumeParaOMotor(100), 100, 'o máximo é o mesmo: nada de ganho artificial');
assert.equal(volumeParaOMotor(0), 0, 'o zero cala');
assert.ok(volumeParaOMotor(0.5) >= 1, 'acima do zero nunca cala');
assert.equal(volumeParaOMotor(150), 100);
assert.equal(volumeParaOMotor(Number.NaN), 0);
for (let b = 0; b < 100; b++) {
  assert.ok(volumeParaOMotor(b + 1) >= volumeParaOMotor(b), 'nunca desce ao subir a barra');
}

// --- "não é constante": cada bocado da barra vale o mesmo --------------------
// A intenção da curva é linear em dB. Com a quadrática, 1% da barra valia
// 3,5 dB a 15% e 0,18 dB a 70% -- vinte vezes mais sensível em baixo.
const intencao = (p: number) => PISO_DB * (1 - p / 100);
const inclinacoes = [10, 30, 50, 70, 90].map((p) => intencao(p + 10) - intencao(p));
const menor = Math.min(...inclinacoes), maior = Math.max(...inclinacoes);
assert.ok(maior - menor < 0.01,
  `a barra tem de valer o mesmo em todo o lado (de ${menor.toFixed(2)} a ${maior.toFixed(2)} dB por 10%)`);
assert.ok(Math.abs(db(50) - PISO_DB / 2) < 1, 'a meio da barra, metade dos dB');
assert.ok(db(100) === 0 && db(1) <= PISO_DB + 1, 'o percurso inteiro são os dB do piso');

// --- "nos mínimos não baixa mais": a promessa que ficava por cumprir ---------
// Com inteiros na amplitude há sempre um bocado da barra, em baixo, que cai no
// mesmo inteiro do motor. O que se nota não é a zona parada, é quanto ela
// PROMETIA mudar. A quadrática parava 12,2% da barra depois de prometer ali
// 83 dB; isto falha se alguma zona parada voltar a prometer mais de 3 dB.
const PASSOS = 1000;
let piorCorrida = 0, prometidoNaPior = 0;
for (let i = 1; i <= PASSOS;) {
  const v = volumeParaOMotor((i / PASSOS) * 100);
  let j = i;
  while (j < PASSOS && volumeParaOMotor(((j + 1) / PASSOS) * 100) === v) j++;
  const prometido = Math.abs(intencao((j / PASSOS) * 100) - intencao((i / PASSOS) * 100));
  if (prometido > prometidoNaPior) { prometidoNaPior = prometido; piorCorrida = (100 * (j - i + 1)) / PASSOS; }
  i = j + 1;
}
assert.ok(prometidoNaPior <= 3,
  `uma zona parada de ${piorCorrida.toFixed(1)}% da barra prometia ${prometidoNaPior.toFixed(1)} dB`);

// --- as duas migrações: o volume guardado soa igual --------------------------
// Linear (antes de 16/10) -> agora.
for (const antes of [10, 30, 64, 80, 100]) {
  const depois = volumeParaOMotor(barraParaACurva(antes));
  assert.ok(Math.abs(20 * Math.log10(depois / 100) - 20 * Math.log10(antes / 100)) <= 1.5,
    `o volume linear ${antes} soa igual depois de migrar (deu ${depois})`);
}
// Quadrática (16/10 a 4/11) -> agora.
for (const antes of [30, 50, 70, 90, 100]) {
  const motorAntigo = Math.max(1, Math.round((antes / 100) ** 2 * 100));
  const depois = volumeParaOMotor(curvaQuadraticaParaDb(antes));
  assert.ok(Math.abs(20 * Math.log10(depois / 100) - 20 * Math.log10(motorAntigo / 100)) <= 1.5,
    `a barra quadrática ${antes} soa igual depois de migrar (${motorAntigo} -> ${depois})`);
}
assert.equal(curvaQuadraticaParaDb(100), 100, 'quem estava no máximo fica no máximo');
assert.equal(curvaQuadraticaParaDb(0), 0, 'quem estava calado fica calado');
// Quem estava abaixo do piso novo não tem sítio: fica no fundo, nunca calado.
assert.ok(curvaQuadraticaParaDb(5) >= 1, 'um volume antigo muito baixo não vira mudo');

// --- o motor do PC continua a passar tudo pela curva ------------------------
const motor = readFileSync(new URL('../src/components/YouTubePlayerView.web.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(motor, /setVolume\??\.?\((?:state|st|usePlayer\.getState\(\))\.volume\)/, 'um volume cru escapou à curva');
// Pela curva, e depois o abafo da pré-escuta do refrão (25/10: 1 sem ela).
assert.match(motor, /const volume = abafado\(volumeParaOMotor\(vol\)\);/, 'a barra e a roda do rato passam pela curva');
assert.match(motor, /ativo\?\.setVolume\(volume\);/, 'e é esse o volume que chega ao player');

console.log(`Curva do volume: linear em dB (piso ${PISO_DB}), mesmo máximo, nenhuma zona parada a prometer mais de ${prometidoNaPior.toFixed(1)} dB, e as duas migrações soam igual.`);

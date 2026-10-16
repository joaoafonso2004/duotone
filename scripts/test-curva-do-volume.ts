// A barra de volume do PC numa curva de ouvido (16/10).
// Correr: node --experimental-strip-types scripts/test-curva-do-volume.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barraParaACurva, volumeParaOMotor } from '../src/lib/curvaDoVolume.ts';

const db = (barra: number) => 20 * Math.log10(volumeParaOMotor(barra) / 100);
assert.equal(volumeParaOMotor(100), 100, 'o máximo é o mesmo: nada de ganho artificial');
assert.equal(volumeParaOMotor(0), 0);
assert.equal(volumeParaOMotor(1), 1, 'acima do zero nunca cala');
assert.ok(Math.abs(db(50) + 12) < 0.5, 'a meio, -12 dB (era -6: quase igual ao máximo)');
assert.ok(db(20) < -25, 'perto do mínimo é baixo a sério');
for (let b = 1; b < 100; b++) assert.ok(volumeParaOMotor(b + 1) >= volumeParaOMotor(b), 'nunca desce ao subir a barra');
assert.equal(volumeParaOMotor(150), 100);
assert.equal(volumeParaOMotor(Number.NaN), 0);
// A primeira vez: o volume guardado muda de sítio para soar igual.
for (const antes of [10, 30, 64, 80, 100]) {
  assert.ok(Math.abs(volumeParaOMotor(barraParaACurva(antes)) - antes) <= 2, `soa igual com ${antes}`);
}
// Nenhum sítio do motor do PC manda o volume da loja cru ao player.
const motor = readFileSync(new URL('../src/components/YouTubePlayerView.web.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(motor, /setVolume\??\.?\((?:state|st|usePlayer\.getState\(\))\.volume\)/, 'um volume cru escapou à curva');
assert.match(motor, /ativoRef\.current\?\.setVolume\(volumeParaOMotor\(vol\)\)/, 'a barra e a roda do rato passam pela curva');
console.log('Curva do volume: mesmo máximo, -12 dB a meio, sem calar acima do zero, e a mesma altura na primeira vez.');

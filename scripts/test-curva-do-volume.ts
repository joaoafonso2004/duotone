// A barra de volume do PC numa curva de ouvido (16/10; em dB desde 4/11; com o
// fundo a -50 dB e o ganho fino do grafo desde 5/11).
// Correr: node --experimental-strip-types scripts/test-curva-do-volume.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  barraParaACurva, curvaDe30DbParaANova, curvaQuadraticaParaDb, dbDaBarra, dbSoComOInteiro,
  ganhoFinoDaBarra, PISO_DB, PISO_DB_DE_4_11, volumeParaOMotor,
} from '../src/lib/curvaDoVolume.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// --- o que não muda ---------------------------------------------------------
assert.equal(volumeParaOMotor(100), 100, 'o máximo é o mesmo: nada de ganho artificial');
assert.equal(ganhoFinoDaBarra(100), 1);
assert.equal(volumeParaOMotor(0), 0, 'o zero cala');
assert.ok(volumeParaOMotor(0.5) >= 1, 'acima do zero o player nunca cala');
assert.equal(volumeParaOMotor(150), 100);
assert.equal(volumeParaOMotor(Number.NaN), 0);
for (let b = 0; b < 100; b++) {
  assert.ok(volumeParaOMotor(b + 1) >= volumeParaOMotor(b), 'o inteiro nunca desce ao subir a barra');
}

// --- "no mínimo continua alto" (5/11): o fundo vai a -50 dB ------------------
assert.equal(PISO_DB, -50);
assert.ok(dbDaBarra(1) <= -49, `no fundo da barra tem de estar perto dos -50 dB (deu ${dbDaBarra(1).toFixed(1)})`);
assert.ok(dbDaBarra(1) < PISO_DB_DE_4_11 - 15, 'o fundo novo é bem mais baixo do que o de 4/11');

// --- com o grafo: exatamente a curva, sem zona parada ------------------------
// O ganho fino acerta o arredondamento do inteiro: o som que chega é o que a
// barra pede, em qualquer ponto, e cada 1% vale o mesmo (0,5 dB).
for (let i = 1; i <= 1000; i++) {
  const p = i / 10;
  const g = ganhoFinoDaBarra(p);
  assert.ok(g > 0 && g <= 1, `o ganho fino fica entre 0 e 1 (a ${p}%: ${g})`);
  const pedido = PISO_DB * (1 - p / 100);
  assert.ok(Math.abs(dbDaBarra(p) - pedido) < 0.01, `a ${p}% a barra pede ${pedido.toFixed(2)} dB e soa ${dbDaBarra(p).toFixed(2)}`);
}
for (let i = 1; i < 1000; i++) {
  assert.ok(dbDaBarra((i + 1) / 10) > dbDaBarra(i / 10), `a barra parou entre ${i / 10}% e ${(i + 1) / 10}%`);
}

// --- sem o grafo: só o inteiro, nunca mais baixo do que a barra pede --------
for (let i = 1; i <= 1000; i++) {
  const p = i / 10;
  const excesso = dbSoComOInteiro(p) - dbDaBarra(p);
  assert.ok(excesso >= -1e-9, `sem grafo nunca soa abaixo da barra (a ${p}%)`);
  assert.ok(excesso <= 10.01, `sem grafo, no máximo 10 dB acima da barra, lá no fundo (a ${p}%: ${excesso.toFixed(1)})`);
  // Onde o inteiro chega (10 ou mais, -20 dB para cima) sobra menos de 1 dB.
  if (volumeParaOMotor(p) >= 10) assert.ok(excesso < 0.9, `a ${p}% sobram ${excesso.toFixed(2)} dB sem grafo`);
}
assert.ok(Math.abs(dbSoComOInteiro(1) + 40) < 0.01, 'sem grafo o fundo é o inteiro 1, a -40 dB');

// --- as três migrações: o volume guardado soa igual ---------------------------
// Linear (antes de 16/10) -> agora.
for (const antes of [10, 30, 64, 80, 100]) {
  const depois = dbDaBarra(barraParaACurva(antes));
  assert.ok(Math.abs(depois - 20 * Math.log10(antes / 100)) <= 1.5,
    `o volume linear ${antes} soa igual depois de migrar (deu ${depois.toFixed(1)} dB)`);
}
// Quadrática (16/10 a 4/11) -> agora.
for (const antes of [30, 50, 70, 90, 100]) {
  const motorAntigo = Math.max(1, Math.round((antes / 100) ** 2 * 100));
  const depois = dbDaBarra(curvaQuadraticaParaDb(antes));
  assert.ok(Math.abs(depois - 20 * Math.log10(motorAntigo / 100)) <= 1.5,
    `a barra quadrática ${antes} soa igual depois de migrar (${motorAntigo} -> ${depois.toFixed(1)} dB)`);
}
assert.equal(curvaQuadraticaParaDb(100), 100, 'quem estava no máximo fica no máximo');
assert.equal(curvaQuadraticaParaDb(0), 0, 'quem estava calado fica calado');
assert.ok(curvaQuadraticaParaDb(5) >= 1, 'um volume antigo muito baixo não vira mudo');
// Em dB com o fundo a -30 (4/11 a 5/11) -> agora: soa igual, e sobe na barra.
for (const antes of [1, 10, 30, 60, 80, 100]) {
  const motorAntigo = Math.max(1, Math.round(100 * 10 ** ((PISO_DB_DE_4_11 * (1 - antes / 100)) / 20)));
  const novo = curvaDe30DbParaANova(antes);
  const depois = dbDaBarra(novo);
  assert.ok(Math.abs(depois - 20 * Math.log10(motorAntigo / 100)) <= 1.5,
    `a barra de 4/11 em ${antes} soa igual depois de migrar (${motorAntigo} -> ${depois.toFixed(1)} dB)`);
  assert.ok(novo >= antes, `o volume de 4/11 em ${antes} sobe na barra (ficou ${novo}): ganhou espaço por baixo`);
}
assert.equal(curvaDe30DbParaANova(0), 0);
assert.equal(curvaDe30DbParaANova(100), 100);

// --- o motor do PC continua a passar tudo pela curva ------------------------
const motor = ler('src/components/YouTubePlayerView.web.tsx');
assert.doesNotMatch(motor, /setVolume\??\.?\((?:state|st|usePlayer\.getState\(\))\.volume\)/, 'um volume cru escapou à curva');
// Pela curva, e depois o abafo da pré-escuta do refrão (25/10: 1 sem ela).
assert.match(motor, /const volume = abafado\(volumeParaOMotor\(vol\)\);/, 'a barra e a roda do rato passam pela curva');
assert.match(motor, /ativo\?\.setVolume\(volume\);/, 'e é esse o volume que chega ao player');

// --- e o ganho fino chega ao grafo --------------------------------------------
const player = ler('src/state/player.ts');
assert.match(player, /ganhoFinoEnviado = ganhoFinoDaBarra\(st\.volume\);/, 'o EQ leva o ganho fino do volume');
assert.match(player, /const compensacao = Math\.min\(1, compensacaoLinear\(ganhos\) \* ganhoFinoEnviado\);/,
  'na "compensação", nunca acima de 1 (a ponte trata um valor maior como 1, e o ganho fino perdia-se)');
assert.match(player, /acompanharGanhoFino\(clamped\);/, 'mexer na barra manda o ganho fino');
assert.match(player, /localStorage\.setItem\('duotone-volume-curva', '3'\)/, 'o volume guardado é migrado para a curva nova');
assert.match(player, /marca === '2' \? curvaDe30DbParaANova\(parsed\)/, 'quem vinha da curva de 4/11 soa igual');
const main = ler('electron/main.cjs');
assert.match(main, /no\.connect\(margem\);\s*margem\.connect\(limitador\);/, 'o nó margem está no caminho do som');
assert.match(main, /Number\.isFinite\(m\) && m > 0 && m <= 1 \? m : 1/, 'a ponte aceita um ganho entre 0 e 1');

console.log(`Curva do volume: linear em dB até ${PISO_DB} dB, contínua com o grafo, nunca abaixo da barra sem ele, e as três migrações soam igual.`);

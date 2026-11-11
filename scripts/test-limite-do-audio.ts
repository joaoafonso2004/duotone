/**
 * O teto do áudio guardado no iPhone, escolhido nas Definições (11/11): era
 * 300 MB fixos, passou a uma barra de 10 MB até sem limite.
 *
 * Correr: node --experimental-strip-types scripts/test-limite-do-audio.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bytesDoDegrau, DEGRAUS_MB, degrauDoLimite, escreverLimite, LIMITE_DE_ORIGEM, lerLimite, rotuloDoLimite, SEM_LIMITE,
} from '../src/lib/limiteDoAudio.ts';

const MB = 1024 * 1024;
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\na escala');
caso('vai de 10 MB até sem limite, sempre a subir', () => {
  assert.equal(bytesDoDegrau(0), 10 * MB);
  assert.equal(bytesDoDegrau(DEGRAUS_MB.length - 1), SEM_LIMITE);
  for (let i = 1; i < DEGRAUS_MB.length; i++) assert.ok(DEGRAUS_MB[i] > DEGRAUS_MB[i - 1]);
  assert.ok(DEGRAUS_MB.length <= 16, 'mais degraus e o polegar deixa de os distinguir');
});
caso('os 300 MB de sempre são um degrau, e a barra começa neles', () => {
  assert.equal(LIMITE_DE_ORIGEM, 300 * MB);
  assert.equal(bytesDoDegrau(degrauDoLimite(LIMITE_DE_ORIGEM)), LIMITE_DE_ORIGEM);
});
caso('cada degrau volta a si, e um valor fora da escala cai no vizinho', () => {
  for (let i = 0; i < DEGRAUS_MB.length; i++) assert.equal(degrauDoLimite(bytesDoDegrau(i)), i);
  assert.equal(bytesDoDegrau(degrauDoLimite(280 * MB)), 300 * MB);
  assert.equal(bytesDoDegrau(degrauDoLimite(1 * MB)), 10 * MB);
  assert.equal(bytesDoDegrau(degrauDoLimite(99_999 * MB)), 20480 * MB, 'um número enorme não é "sem limite"');
  assert.equal(bytesDoDegrau(-3), 10 * MB);
  assert.equal(bytesDoDegrau(99), SEM_LIMITE);
});
caso('os rótulos', () => {
  assert.equal(rotuloDoLimite(10 * MB), '10 MB');
  assert.equal(rotuloDoLimite(750 * MB), '750 MB');
  assert.equal(rotuloDoLimite(1024 * MB), '1 GB');
  assert.equal(rotuloDoLimite(20480 * MB), '20 GB');
  assert.equal(rotuloDoLimite(1536 * MB), '1.5 GB');
  assert.equal(rotuloDoLimite(SEM_LIMITE), 'Unlimited');
});

console.log('\nguardado no aparelho');
caso('ida e volta, sem limite incluído', () => {
  for (let i = 0; i < DEGRAUS_MB.length; i++) assert.equal(lerLimite(escreverLimite(bytesDoDegrau(i))), bytesDoDegrau(i));
  assert.equal(escreverLimite(SEM_LIMITE), 'unlimited');
});
caso('nada, lixo ou um zero são os 300 MB: um valor estragado nunca apaga tudo', () => {
  for (const mau of [null, undefined, '', 'lixo', '0', '-5', '3', 'NaN', 'Infinity'])
    assert.equal(lerLimite(mau), LIMITE_DE_ORIGEM, String(mau));
});

console.log('\nligado');
caso('o arranque lê o teto antes de ligar a limpeza', () => {
  const app = ler('App.tsx');
  const leitura = app.indexOf('.then(() => getLimiteDoAudio().then(definirLimiteDoAudioGuardado))');
  assert.ok(leitura > 0, 'o App.tsx não lê o teto');
  assert.ok(leitura < app.indexOf('pararLimpeza = iniciarLimpezaAutomaticaDoAudio('), 'a primeira limpeza corria com os 300 MB');
});
caso('a limpeza usa o teto em vigor, e as Definições mostram-no e mudam-no', () => {
  assert.match(ler('src/lib/youtubeCache.ts'), /export function pruneAudioCacheLRU\(protectedIds: string\[\] = \[\], limiteBytes = limiteDoAudio\)/);
  const definicoes = ler('src/screens/SettingsScreen.tsx');
  assert.match(definicoes, /<BarraDoLimite valor=\{limitePorConfirmar \?\? limiteDoAudio\} aoMudar=\{mudarLimite\} \/>/);
  // Abaixo do que está guardado apaga músicas: pergunta antes.
  assert.match(definicoes, /if \(bytes < getAudioCacheBytes\(\)\) \{ setLimitePorConfirmar\(bytes\); return; \}/);
  assert.match(definicoes, /title="Lower the storage limit\?"/);
  assert.doesNotMatch(definicoes, /MAX_CACHE_BYTES/, 'o rodapé ainda diz os 300 MB fixos');
  assert.doesNotMatch(ler('src/screens/DownloadsScreen.tsx'), /MAX_CACHE_BYTES/);
});
caso('a barra só aplica ao largar', () => {
  const barra = ler('src/components/BarraDoLimite.tsx');
  assert.match(barra, /<PanGestureHandler minDist=\{0\}/);
  assert.equal((barra.match(/aoMudarRef\.current\(bytesDoDegrau\(novo\)\)/g) ?? []).length, 2, 'só no fim do gesto e no VoiceOver');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exitCode = 1; }
else console.log('\nTodos os casos passaram.');

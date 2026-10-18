/**
 * Pausar e retomar fora da app no iPhone (18/10): ecrã bloqueado, Centro de
 * Controlo, AirPods, carro. A pausa de fora passa a ser a intenção da pessoa
 * (antes o watchdog julgava o stream preso e a música voltava sozinha); um
 * stream à espera de dados, um arranque, uma troca de fonte e o fim da faixa
 * não contam. Ver lib/pausaDeFora.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-pausa-de-fora.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANDAVA_HA_MENOS_DE_MS, estadoDoMotor, marcarPausaDeFora, pausaDeFora, pausouDeForaHaPouco, playDeFora,
} from '../src/lib/pausaDeFora.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// O relatório do João (5.1.8): pausou no ecrã bloqueado a meio de uma música.
const PAUSADO = 'rate=0.000 default=1.000 status=0 waits=1';
const A_ESPERA = 'rate=1.000 default=1.000 status=1 waiting=AVPlayerWaitingToMinimizeStallsReason waits=1';
const A_TOCAR = 'rate=1.000 default=1.000 status=2 waits=1';
const base = {
  queriaTocar: true, motorAtivoEDestaFaixa: true, aTocar: false, estadoNativo: PAUSADO,
  posicaoS: 120, duracaoS: 240, msDesdeOUltimoAvanco: 900, entregaAMeio: false,
};

console.log('\no estado do AVPlayer');
caso('lê o timeControlStatus do texto nativo', () => {
  assert.equal(estadoDoMotor(PAUSADO), 0);
  assert.equal(estadoDoMotor(A_ESPERA), 1);
  assert.equal(estadoDoMotor(A_TOCAR), 2);
  assert.equal(estadoDoMotor('native=n/a'), null, 'um binário sem ele: não se decide nada');
  assert.equal(estadoDoMotor('native=error'), null);
});

console.log('\na pausa de fora');
caso('a meio de uma música que andava, pausado: foi a pessoa', () => assert.equal(pausaDeFora(base), true));
caso('à espera de dados (stream preso) não é pausa: o watchdog continua a tratar dele', () =>
  assert.equal(pausaDeFora({ ...base, estadoNativo: A_ESPERA }), false));
caso('sem o estado nativo, como antes', () => assert.equal(pausaDeFora({ ...base, estadoNativo: 'native=n/a' }), false));
caso('a app já não queria tocar (uma chamada, os auscultadores, o botão da app)', () =>
  assert.equal(pausaDeFora({ ...base, queriaTocar: false }), false));
caso('o motor que parou já não é o ativo (a troca do crossfade)', () =>
  assert.equal(pausaDeFora({ ...base, motorAtivoEDestaFaixa: false }), false));
caso('voltou a tocar entretanto', () => assert.equal(pausaDeFora({ ...base, aTocar: true }), false));
caso('no arranque (posição ~0) não é pausa de ninguém', () => assert.equal(pausaDeFora({ ...base, posicaoS: 0.4 }), false));
caso('no fim da música é o fim, não uma pausa', () => assert.equal(pausaDeFora({ ...base, posicaoS: 239 }), false));
caso('a posição já estava parada (uma troca de fonte depois de encravar)', () =>
  assert.equal(pausaDeFora({ ...base, msDesdeOUltimoAvanco: ANDAVA_HA_MENOS_DE_MS + 1 }), false));
caso('com a passagem a entregar a faixa seguinte', () => assert.equal(pausaDeFora({ ...base, entregaAMeio: true }), false));

console.log('\no play de fora');
caso('a app em pausa e o motor a tocar: foi a pessoa (no ecrã bloqueado)', () =>
  assert.equal(playDeFora({ queriaTocar: false, motorAtivoEDestaFaixa: true, aTocar: true, estadoNativo: A_TOCAR }), true));
caso('a app já queria tocar: é o nosso próprio play', () =>
  assert.equal(playDeFora({ queriaTocar: true, motorAtivoEDestaFaixa: true, aTocar: true, estadoNativo: A_TOCAR }), false));
caso('o motor em espera a preparar a seguinte não conta', () =>
  assert.equal(playDeFora({ queriaTocar: false, motorAtivoEDestaFaixa: false, aTocar: true, estadoNativo: A_TOCAR }), false));
caso('à espera de dados não é tocar', () =>
  assert.equal(playDeFora({ queriaTocar: false, motorAtivoEDestaFaixa: true, aTocar: true, estadoNativo: A_ESPERA }), false));

console.log('\numa chamada logo a seguir');
caso('uma interrupção mesmo depois de uma pausa de fora conta como "estava a tocar"', () => {
  marcarPausaDeFora(1_000);
  assert.equal(pausouDeForaHaPouco(1_500), true);
  assert.equal(pausouDeForaHaPouco(10_000), false);
});

console.log('\nligado');
caso('o motor do iPhone decide no playingChange, depois de esperar', () => {
  const y = ler('src/components/YouTubePlayerView.tsx');
  assert.match(y, /if \(!isPlaying\) recuperarSeParouAoArrancar\(\);\n\s+verSeFoiDeFora\(player, isPlaying\);/);
  assert.match(y, /const msDesdeOUltimoAvanco = Date\.now\(\) - lastProgressRef\.current\.at;/, 'medido no instante do evento');
  assert.match(y, /marcarPausaDeFora\(\);\n\s+st\.pausePlayback\(\);/, 'a pausa de fora passa a ser a intenção');
  assert.match(y, /void st\.togglePlay\(\);/, 'e o play de fora também');
  assert.match(y, /\}, aTocarAgora \? 400 : PAUSA_DE_FORA_MS\);/);
  const r = ler('src/components/PlayerRoot.tsx');
  assert.match(r, /tocavaAntes: st\.isPlaying \|\| pausouDeForaHaPouco\(\)/, 'a chamada a seguir ainda retoma');
});

console.log(falhas ? `\n  ${falhas} caso(s) a falhar.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

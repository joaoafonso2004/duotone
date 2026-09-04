import assert from 'node:assert/strict';
import { acaoDoWatchdog } from '../src/lib/fimDeFaixa.ts';

const base = {
  querTocar: true,
  paradoMs: 0,
  posicaoSegundos: 0,
  duracaoSegundos: 187,
  jaDescarregou: false,
};

// O bug: preso no último segundo sem o AVPlayer anunciar o fim.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 186, paradoMs: 5000 }), 'avancar');

// Ainda não parou tempo suficiente: a reprodução normal não pode saltar.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 186, paradoMs: 2000 }), 'nada');

// Em pausa no fim não se avança faixa nenhuma.
assert.equal(
  acaoDoWatchdog({ ...base, querTocar: false, posicaoSegundos: 186, paradoMs: 30000 }),
  'nada'
);

// Preso a meio continua a ser caso de trocar para o ficheiro.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 40, paradoMs: 7000 }), 'descarregar');

// A meio, mas já se tentou o download: não insistir em ciclo.
assert.equal(
  acaoDoWatchdog({ ...base, posicaoSegundos: 40, paradoMs: 7000, jaDescarregou: true }),
  'nada'
);

// Preso no fim avança mesmo depois de o download já ter sido tentado -- era
// aqui que a guarda antiga deixava a faixa encravada para sempre.
assert.equal(
  acaoDoWatchdog({ ...base, posicaoSegundos: 186, paradoMs: 9000, jaDescarregou: true }),
  'avancar'
);

// Buffering a meio, ainda dentro da folga.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 40, paradoMs: 3000 }), 'nada');

// Sem duração conhecida não se adivinha o fim: trata-se como paragem a meio.
assert.equal(
  acaoDoWatchdog({ ...base, duracaoSegundos: 0, posicaoSegundos: 186, paradoMs: 9000 }),
  'descarregar'
);

// A fronteira: exatamente dois segundos do fim já conta como fim.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 185, paradoMs: 5000 }), 'avancar');
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 184.9, paradoMs: 5000 }), 'nada');

console.log('Fim de faixa: encravado no fim, buffering a meio, pausa, download já tentado e fronteiras passaram.');

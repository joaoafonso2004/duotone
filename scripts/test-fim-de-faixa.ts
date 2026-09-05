import assert from 'node:assert/strict';
import { acaoDoWatchdog } from '../src/lib/fimDeFaixa.ts';

const base = {
  querTocar: true,
  paradoMs: 0,
  posicaoSegundos: 0,
  duracaoSegundos: 187,
  jaDescarregou: false,
};

// Perto do fim este caminho NÃO decide nada: parado por pausa e parado por
// encravamento são iguais vistos daqui. Quem trata do fim é o
// `fimPorFaltaDeDados`, que tem o sinal para os separar.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 186, paradoMs: 5000 }), 'nada');

// E também não decide nada com pouco tempo parado.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 186, paradoMs: 2000 }), 'nada');

// Em pausa declarada, muito menos.
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

// Perto do fim, com o download já tentado, continua a não haver nada a fazer
// por este caminho.
assert.equal(
  acaoDoWatchdog({ ...base, posicaoSegundos: 186, paradoMs: 9000, jaDescarregou: true }),
  'nada'
);

// Buffering a meio, ainda dentro da folga.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 40, paradoMs: 3000 }), 'nada');

// Sem duração conhecida não se adivinha o fim: trata-se como paragem a meio.
assert.equal(
  acaoDoWatchdog({ ...base, duracaoSegundos: 0, posicaoSegundos: 186, paradoMs: 9000 }),
  'descarregar'
);

// A fronteira: a dois segundos do fim já conta como fim, e por isso cala-se;
// mais atrás do que isso volta a ser uma paragem a meio.
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 185, paradoMs: 5000 }), 'nada');
assert.equal(acaoDoWatchdog({ ...base, posicaoSegundos: 184.9, paradoMs: 7000 }), 'descarregar');

console.log('Watchdog do relógio: só trata de paragens a meio; o fim é do statusChange.');

// --- O caminho que sobrevive ao ecrã bloqueado ---
import { fimPorFaltaDeDados } from '../src/lib/fimDeFaixa.ts';

const semDados = {
  querTocar: true,
  aCarregar: true,
  aTocar: false,
  posicaoSegundos: 186,
  duracaoSegundos: 187,
};

// Buffer vazio em cima do fim: não vem mais áudio.
assert.equal(fimPorFaltaDeDados(semDados), true);

// Uma PAUSA deixa o status em readyToPlay, nunca em loading -- é isto que
// impede o salto de uma faixa pausada nos últimos segundos.
assert.equal(fimPorFaltaDeDados({ ...semDados, aCarregar: false }), false);

// Buffer a encher a meio da música não é fim nenhum.
assert.equal(fimPorFaltaDeDados({ ...semDados, posicaoSegundos: 90 }), false);

// Aviso de buffer com o motor ainda a tocar: deixa-o continuar.
assert.equal(fimPorFaltaDeDados({ ...semDados, aTocar: true }), false);

// Em pausa declarada pela app não se avança.
assert.equal(fimPorFaltaDeDados({ ...semDados, querTocar: false }), false);

// Sem duração conhecida não se adivinha.
assert.equal(fimPorFaltaDeDados({ ...semDados, duracaoSegundos: 0 }), false);

console.log('Fim sem dados: buffer vazio no fim, pausa, buffer a meio e motor a tocar passaram.');

// --- Que duração dar aos dois detetores ---
import { duracaoParaDetetarOFim } from '../src/lib/fimDeFaixa.ts';

// A conhecida ganha sempre, mesmo com o motor a dizer o dobro.
assert.equal(duracaoParaDetetarOFim(187, 374), 187);

// Sem nenhuma conhecida vale a do motor. É isto que destrava as faixas que
// chegam à fila sem duração -- as sugestões do shuffle inteligente, quando o
// InnerTube não manda o `lengthText`.
assert.equal(duracaoParaDetetarOFim(null, 132), 132);
assert.equal(duracaoParaDetetarOFim(undefined, 132), 132);
assert.equal(duracaoParaDetetarOFim(0, 132), 132);

// Sem nenhuma das duas continua a não se adivinhar nada.
assert.equal(duracaoParaDetetarOFim(null, null), 0);
assert.equal(duracaoParaDetetarOFim(null, 0), 0);

// Antes de o item carregar, o AVPlayer devolve NaN ou Infinity: não passam.
assert.equal(duracaoParaDetetarOFim(null, NaN), 0);
assert.equal(duracaoParaDetetarOFim(null, Infinity), 0);
assert.equal(duracaoParaDetetarOFim(NaN, 132), 132);
assert.equal(duracaoParaDetetarOFim(Infinity, 132), 132);

// O SENTIDO DO ERRO, que é o que torna seguro deixar entrar o `player.duration`
// aqui e em mais lado nenhum: com o m4a que declara o dobro, a posição real
// nunca chega ao fim menos dois -- perde-se a deteção, que é exatamente o que
// já acontecia sem duração nenhuma. Nunca se avança cedo, que é o que não se
// pode fazer.
assert.equal(
  fimPorFaltaDeDados({
    ...semDados,
    posicaoSegundos: 132,
    duracaoSegundos: duracaoParaDetetarOFim(null, 264),
  }),
  false,
  'duração a dobrar: perde a deteção, não salta',
);

// Com a duração do motor certa, a mesma posição já é reconhecida como fim.
assert.equal(
  fimPorFaltaDeDados({
    ...semDados,
    posicaoSegundos: 132,
    duracaoSegundos: duracaoParaDetetarOFim(null, 132),
  }),
  true,
  'o caso da faixa presa a 2:12 de 2:12',
);

console.log('Duração para detetar o fim: a conhecida ganha, o motor é o último recurso, e errar por excesso só perde a deteção.');

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

// --- A faixa que NUNCA arranca -------------------------------------------
//
// Isto e o bug que obrigava a reiniciar a app: `jaDescarregou` e posto a
// verdadeiro ANTES de o download comecar, por isso entrar no caminho
// progressivo desarmava o watchdog. Se o download encravasse, a faixa ficava
// em 0:00 sem erro, sem recuperacao e sem limite de tempo.

const parado = { ...base, jaDescarregou: true, posicaoSegundos: 0 };

// O caso reportado: varias faixas nao descarregadas seguidas, tudo parado em
// 0:00, e a app so voltava a si depois de ser reiniciada.
assert.equal(
  acaoDoWatchdog({ ...parado, paradoMs: 50000, downloadParadoMs: null }),
  'desistir',
  'a faixa presa em 0:00 tem de ser dada por perdida, nao ficar a fingir que carrega'
);

// Um download LENTO nao e um download encravado. Enquanto entrarem bytes,
// ninguem desiste -- 4G a puxar um ficheiro grande demora mesmo.
assert.equal(
  acaoDoWatchdog({ ...parado, paradoMs: 120000, downloadParadoMs: 3000 }),
  'nada',
  'um download que avanca nao pode ser interrompido so por demorar'
);

// Download em curso mas parado ha muito: nem posicao nem bytes.
assert.equal(
  acaoDoWatchdog({ ...parado, paradoMs: 50000, downloadParadoMs: 50000 }),
  'desistir'
);

// Antes do limite, nao. A app tem de ter espaco para arrancar devagar.
assert.equal(
  acaoDoWatchdog({ ...parado, paradoMs: 30000, downloadParadoMs: null }),
  'nada'
);

// Ja arrancou -- parou a meio, nao no arranque. Esse caso e outro, e ja se
// tentou o ficheiro: aqui nao ha nada a fazer.
assert.equal(
  acaoDoWatchdog({ ...parado, posicaoSegundos: 40, paradoMs: 90000, downloadParadoMs: null }),
  'nada'
);

// Em pausa nao se desiste de nada.
assert.equal(
  acaoDoWatchdog({ ...parado, querTocar: false, paradoMs: 90000, downloadParadoMs: null }),
  'nada'
);

// Sem o download tentado, o primeiro remedio continua a ser o antigo: trocar
// para o ficheiro. Passados os 6 segundos, e antes dos 45.
//
// Este caso tinha 50000 e passava -- ou seja, estava a FIXAR um bug em vez de o
// apanhar. Aos cinquenta segundos parado em 0:00, desistir e o comportamento
// certo; o numero e que estava mal escolhido para exprimir a intencao.
assert.equal(
  acaoDoWatchdog({ ...base, posicaoSegundos: 0, paradoMs: 10000, downloadParadoMs: null }),
  'descarregar'
);

// O caminho que nao tinha saida nenhuma, e que obrigava a reiniciar a app.
//
// Quando o que encrava e a RESOLUCAO do stream, o download nunca chega a ser
// tentado e o `jaDescarregou` fica FALSO. Com ele a ser lido primeiro, a funcao
// devolvia `descarregar` para sempre: quem chamava tentava trocar para um
// ficheiro que ainda nao existe, falhava, e voltava tudo ao inicio. Ciclo
// silencioso -- 0:00 eterno, sem erro e sem recuperacao.
//
// E exactamente o caso de trocar de musica depressa, que e quando ha
// resolucoes a mais em curso ao mesmo tempo.
assert.equal(
  acaoDoWatchdog({ ...base, posicaoSegundos: 0, paradoMs: 50000, downloadParadoMs: null }),
  'desistir',
  'a resolucao encravada continua sem saida: 0:00 eterno e so reiniciar resolve'
);

// Mas desistir continua a exigir que NADA ande: um download a progredir segura
// tudo, mesmo muito depois do prazo.
assert.equal(
  acaoDoWatchdog({ ...base, posicaoSegundos: 0, paradoMs: 90000, downloadParadoMs: 2000 }),
  'descarregar',
  'desistiu de um download que estava a andar'
);

// A fronteira do "nunca arrancou": meio segundo ainda conta como parado.
assert.equal(
  acaoDoWatchdog({ ...parado, posicaoSegundos: 0.5, paradoMs: 50000, downloadParadoMs: null }),
  'desistir'
);
assert.equal(
  acaoDoWatchdog({ ...parado, posicaoSegundos: 0.6, paradoMs: 50000, downloadParadoMs: null }),
  'nada'
);

console.log('Watchdog do relógio: paragens a meio, e faixas que nunca chegam a arrancar.');

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

// O relógio partilhado e a decisão de correcção. Onda 1 do ouvir-juntos.
//
// Nada disto toca na app: são contas. Estão sozinhas de propósito, porque se
// estiverem erradas nenhum sintoma aparece no telemóvel de quem está a
// programar -- aparece a duas pessoas em sítios diferentes, que é o caso mais
// caro de testar que existe neste projecto.
import assert from 'node:assert/strict';
import {
  agoraNoServidor, desvioDaAmostra, idaEVolta, melhorEstimativa,
  precisaDeMedir, RTT_MAXIMO_MS, VALIDADE_MS, type Amostra,
} from '../src/lib/relogioPartilhado.ts';
import {
  correccaoNecessaria, posicaoDaSessao, TOLERANCIA_MS,
} from '../src/lib/sincronizacao.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
}

console.log('Relógio partilhado:');

verificar('uma ida e volta simétrica dá o desvio exacto', () => {
  // O telemovel esta 5000 ms ATRASADO. Pedido sai as 1000 (local), a rede leva
  // 20 para cada lado, o servidor le o relogio dele a meio: 1020 local = 6020
  // no servidor.
  const a: Amostra = { enviadoEm: 1000, servidorEm: 6020, recebidoEm: 1040 };
  const e = desvioDaAmostra(a)!;
  assert.equal(e.desvioMs, 5000);
  assert.equal(e.incertezaMs, 20, 'a incerteza é metade da ida e volta');
});

verificar('a incerteza é metade do tempo total, sempre', () => {
  for (const rtt of [0, 10, 100, RTT_MAXIMO_MS]) {
    const a: Amostra = { enviadoEm: 0, servidorEm: rtt / 2, recebidoEm: rtt };
    assert.equal(desvioDaAmostra(a)!.incertezaMs, rtt / 2);
  }
});

verificar('uma amostra lenta de mais é deitada fora', () => {
  const a: Amostra = { enviadoEm: 0, servidorEm: 400, recebidoEm: RTT_MAXIMO_MS + 1 };
  assert.equal(desvioDaAmostra(a), null);
});

verificar('uma amostra impossível é deitada fora', () => {
  // A resposta a chegar antes de o pedido sair: o relogio local mexeu a meio.
  assert.equal(desvioDaAmostra({ enviadoEm: 100, servidorEm: 50, recebidoEm: 90 }), null);
  assert.equal(desvioDaAmostra({ enviadoEm: 0, servidorEm: NaN, recebidoEm: 20 }), null);
});

// ---- a parte que se erra por instinto -------------------------------------
//
// A media parece mais robusta e e pior. O atraso de rede tem um chao -- a
// distancia -- e tudo o que esta acima e fila de espera. Nenhum atraso e
// NEGATIVO, por isso o ruido e todo para o mesmo lado: fazer media e deixar as
// amostras mas contaminarem as boas. Guarda-se a de menor ida e volta.

verificar('fica com a amostra mais rápida, não com a média', () => {
  // O desvio verdadeiro e 0. Tres amostras: uma rapida e certa, duas lentas e
  // enviesadas (a resposta demorou mais a voltar do que a ir).
  const amostras: Amostra[] = [
    { enviadoEm: 0, servidorEm: 10, recebidoEm: 20 },      // rtt 20, desvio 0
    { enviadoEm: 0, servidorEm: 40, recebidoEm: 300 },     // rtt 300, desvio -110
    { enviadoEm: 0, servidorEm: 60, recebidoEm: 400 },     // rtt 400, desvio -140
  ];
  const e = melhorEstimativa(amostras)!;
  assert.equal(e.desvioMs, 0, 'apanhou o enviesamento das amostras lentas');
  assert.equal(e.incertezaMs, 10);

  const media = amostras.reduce((s, a) => s + desvioDaAmostra(a)!.desvioMs, 0) / 3;
  assert.ok(
    Math.abs(media) > 50,
    'o cenário deixou de mostrar a diferença -- sem enviesamento este teste não prova nada'
  );
});

verificar('sem nenhuma amostra boa não se inventa um desvio de zero', () => {
  // Zero e uma AFIRMACAO ("os relogios estao iguais"), nao uma ausencia de
  // informacao. Quem chama tem de saber a diferenca.
  const lentas: Amostra[] = [{ enviadoEm: 0, servidorEm: 100, recebidoEm: 5000 }];
  assert.equal(melhorEstimativa(lentas), null);
  assert.equal(melhorEstimativa([]), null);
});

verificar('mede-se outra vez quando a estimativa envelhece', () => {
  const e = melhorEstimativa([{ enviadoEm: 0, servidorEm: 10, recebidoEm: 20 }])!;
  assert.equal(precisaDeMedir(e, e.medidaEm + VALIDADE_MS - 1), false);
  assert.equal(precisaDeMedir(e, e.medidaEm + VALIDADE_MS + 1), true);
  assert.equal(precisaDeMedir(null, 0), true, 'sem estimativa mede-se sempre');
});

verificar('as horas do servidor são o local mais o desvio', () => {
  const e = { desvioMs: 5000, incertezaMs: 10, medidaEm: 0 };
  assert.equal(agoraNoServidor(e, 1000), 6000);
  assert.equal(agoraNoServidor(null, 1000), 1000, 'sem estimativa devolve o local');
});

verificar('a ida e volta é a subtracção simples', () => {
  assert.equal(idaEVolta({ enviadoEm: 100, servidorEm: 0, recebidoEm: 180 }), 80);
});

console.log('\nPosição da sessão:');

const base = { comecouEmServidor: 1000, pausadaEmMs: null, aTocar: true, duracaoMs: 200_000 };

verificar('a tocar, a posição deriva do instante de início', () => {
  assert.equal(posicaoDaSessao(base, 1000), 0);
  assert.equal(posicaoDaSessao(base, 31_000), 30_000);
});

verificar('a posição não passa do fim da faixa', () => {
  assert.equal(posicaoDaSessao(base, 1000 + 500_000), 200_000);
});

verificar('sem duração conhecida não se corta', () => {
  assert.equal(posicaoDaSessao({ ...base, duracaoMs: 0 }, 1000 + 500_000), 500_000);
});

verificar('em pausa a posição está parada e não deriva', () => {
  const p = { ...base, aTocar: false, pausadaEmMs: 42_000 };
  assert.equal(posicaoDaSessao(p, 1000), 42_000);
  assert.equal(posicaoDaSessao(p, 999_000), 42_000, 'a pausa andou sozinha');
});

verificar('sem informação suficiente devolve null e não um palpite', () => {
  assert.equal(posicaoDaSessao({ ...base, comecouEmServidor: null }, 5000), null);
  assert.equal(posicaoDaSessao({ ...base, aTocar: false, pausadaEmMs: null }, 5000), null);
});

console.log('\nCorrecção:');

const sit = (local: number, sessao: number | null) =>
  correccaoNecessaria({ posicaoLocalMs: local, posicaoDaSessaoMs: sessao, aTocar: true, pronta: true });

verificar('dentro da tolerância não se mexe no som', () => {
  assert.deepEqual(sit(10_000, 10_000), { tipo: 'nada' });
  assert.deepEqual(sit(10_000 + TOLERANCIA_MS, 10_000), { tipo: 'nada' });
});

verificar('desvios até 600 ms não mexem no som em nenhum sentido', () => {
  for (const desvio of [-600, -300, -150, 0, 150, 300, 600]) {
    assert.deepEqual(sit(10_000 + desvio, 10_000), { tipo: 'nada' });
  }
});

verificar('acima do limite salta para o sítio certo', () => {
  assert.deepEqual(sit(30_000, 10_000), { tipo: 'saltar', paraMs: 10_000 });
  assert.deepEqual(sit(10_000 - TOLERANCIA_MS - 1, 10_000), { tipo: 'saltar', paraMs: 10_000 });
  assert.equal(sit(10_000 + TOLERANCIA_MS, 10_000).tipo, 'nada');
});

verificar('em pausa não se mexe na velocidade', () => {
  // No AVFoundation `rate != 0` E play: corrigir em pausa arrancava a musica.
  const c = correccaoNecessaria({
    posicaoLocalMs: 10_500, posicaoDaSessaoMs: 10_000, aTocar: false, pronta: true,
  });
  assert.deepEqual(c, { tipo: 'nada' });
});

verificar('sem o ficheiro cá não há nada a corrigir', () => {
  const c = correccaoNecessaria({
    posicaoLocalMs: 0, posicaoDaSessaoMs: 60_000, aTocar: true, pronta: false,
  });
  assert.deepEqual(c, { tipo: 'nada' }, 'ia mandar saltar uma faixa que ainda não existe cá');
});

verificar('sem posição da sessão não se adivinha', () => {
  assert.deepEqual(sit(10_000, null), { tipo: 'nada' });
});

verificar('amostras inválidas não provocam seeks', () => {
  assert.deepEqual(sit(NaN, 10_000), { tipo: 'nada' });
  assert.deepEqual(sit(10_000, Infinity), { tipo: 'nada' });
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nOnda 1: o relógio e as contas da sincronia estão de pé.');

/**
 * Duotone Connect -- src/lib/duotoneConnect.ts.
 *
 * O que se prende aqui: a quem se pode mandar uma ordem (e porque não, quando
 * não), e que uma ordem velha nunca é executada.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-duotone-connect.ts
 *
 * Leva o resolver porque este módulo importa o `lib/handoff.ts` sem extensão,
 * e o `--experimental-strip-types` sozinho não resolve isso.
 */
import assert from 'node:assert/strict';
import {
  ACORDADO_MS, VALIDADE_DO_PEDIDO_MS, aparelhoQueToca, aparelhosDisponiveis, avisoDoPedido,
  devoExecutar, estaAcordado, estadoDoPedido, motivoDeNaoAlcancar, pedidoExpirou,
  ESQUECER_APARELHO_MS, fantasmasDeSessoes, podeExecutarNoArranque,
  type Pedido,
} from '../src/lib/duotoneConnect.ts';
import { SESSAO_PAUSADA_TTL_MS, type RemoteSession } from '../src/lib/handoff.ts';
import type { Track } from '../src/types.ts';

const AGORA = 1_800_000_000_000;

const faixa: Track = {
  source: 'youtube', sourceId: 'abc', title: 'Lucid Dreams', artist: 'Juice WRLD',
  album: null, artworkUrl: null, durationSeconds: 239,
};

function sessao(over: Partial<RemoteSession> & { deviceId: string }): RemoteSession {
  return {
    deviceName: '', deviceKind: 'desktop', track: faixa, queue: [faixa], queueIndex: 0,
    positionMs: 0, isPlaying: false, updatedAt: new Date(AGORA).toISOString(),
    idadeMs: 0, lidaEm: AGORA, ritmo: 1, ...over,
  };
}

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\nquem está à escuta');
caso('um aparelho que bateu agora está acordado; um de há dez minutos não', () => {
  assert.ok(estaAcordado(sessao({ deviceId: 'pc', idadeMs: 5_000 }), AGORA));
  assert.ok(!estaAcordado(sessao({ deviceId: 'pc', idadeMs: 10 * 60_000 }), AGORA));
});
caso('a folga é a do batimento (3 min), não a das sessões em pausa (30)', () => {
  const quaseVelha = sessao({ deviceId: 'pc', idadeMs: ACORDADO_MS - 1_000 });
  const emPausaHaMuito = sessao({ deviceId: 'pc', idadeMs: SESSAO_PAUSADA_TTL_MS - 60_000 });
  assert.ok(estaAcordado(quaseVelha, AGORA));
  assert.ok(!estaAcordado(emPausaHaMuito, AGORA), 'a sessão ainda vale para o handoff, mas ninguém a ouve');
});
caso('o relógio deste aparelho só entra por diferença', () => {
  const lidaHaUmMinuto = sessao({ deviceId: 'pc', idadeMs: 60_000, lidaEm: AGORA - 60_000 });
  assert.ok(estaAcordado(lidaHaUmMinuto, AGORA), '60 s de idade + 60 s desde a leitura = 2 min');
  assert.ok(!estaAcordado(lidaHaUmMinuto, AGORA + 3 * 60_000));
});

console.log('\na lista de "Play on…"');
caso('o próprio aparelho nunca aparece na lista', () => {
  const lista = aparelhosDisponiveis([sessao({ deviceId: 'eu' }), sessao({ deviceId: 'pc' })], 'eu', AGORA);
  assert.deepEqual(lista.map((a) => a.deviceId), ['pc']);
});
caso('primeiro o que está acordado, e entre esses o que toca', () => {
  // Nomes distintos de propósito: com o mesmo nome estes seriam o MESMO
  // aparelho visto três vezes, e a lista colapsa-os (ver mais abaixo).
  const lista = aparelhosDisponiveis([
    sessao({ deviceId: 'dormente', deviceName: 'Portátil', idadeMs: 20 * 60_000 }),
    sessao({ deviceId: 'parado', deviceName: 'Torre', idadeMs: 10_000 }),
    sessao({ deviceId: 'a-tocar', deviceName: 'Sala', idadeMs: 4_000, isPlaying: true }),
  ], 'eu', AGORA);
  assert.deepEqual(lista.map((a) => a.deviceId), ['a-tocar', 'parado', 'dormente']);
});
caso('o que não está acordado fica na lista, apagado e a dizer porquê', () => {
  const [phone] = aparelhosDisponiveis([
    sessao({ deviceId: 'phone', deviceKind: 'ios', idadeMs: 20 * 60_000 }),
  ], 'eu', AGORA);
  assert.equal(phone!.acordado, false);
  assert.equal(phone!.motivo, 'Open Duotone on your iPhone');
  assert.equal(phone!.aTocar, false, 'não se diz que toca o que já não responde');
});
caso('o nome sai do aparelho, e sem nome é "PC" ou "phone"', () => {
  const lista = aparelhosDisponiveis([
    sessao({ deviceId: 'a', deviceName: 'Sala' }),
    sessao({ deviceId: 'b', deviceKind: 'ios' }),
    sessao({ deviceId: 'c', deviceKind: 'desktop' }),
  ], 'eu', AGORA);
  assert.deepEqual(lista.map((a) => a.nome).sort(), ['PC', 'Sala', 'phone']);
});
caso('o motivo é em inglês e diz o que fazer', () => {
  assert.equal(motivoDeNaoAlcancar('ios'), 'Open Duotone on your iPhone');
  assert.equal(motivoDeNaoAlcancar('desktop'), 'Open Duotone on that PC');
});
caso('o aparelho que toca é o alvo dos comandos -- e não há nenhum se estiver dormente', () => {
  const sessoes = [sessao({ deviceId: 'pc', idadeMs: 3_000, isPlaying: true, deviceName: 'PC' })];
  assert.equal(aparelhoQueToca(sessoes, 'eu', AGORA)?.nome, 'PC');
  assert.equal(aparelhoQueToca(sessoes, 'eu', AGORA + 30 * 60_000), null);
});

console.log('\numa ordem velha não se executa');
function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1', deAparelho: 'phone', paraAparelho: 'pc', tipo: 'seguinte',
    criadoEm: AGORA, estado: 'pendente', detalhe: null, ...over,
  };
}
caso('dentro dos 30 s está pendente; depois expira', () => {
  assert.ok(!pedidoExpirou(pedido(), AGORA + VALIDADE_DO_PEDIDO_MS));
  assert.ok(pedidoExpirou(pedido(), AGORA + VALIDADE_DO_PEDIDO_MS + 1));
  assert.equal(estadoDoPedido(pedido(), AGORA + 5_000), 'pendente');
  assert.equal(estadoDoPedido(pedido(), AGORA + 60_000), 'expirado');
});
caso('respondida é respondida, por muito tempo que passe', () => {
  assert.equal(estadoDoPedido(pedido({ estado: 'feito' }), AGORA + 60 * 60_000), 'feito');
  assert.equal(estadoDoPedido(pedido({ estado: 'recusado' }), AGORA + 60 * 60_000), 'recusado');
});
caso('só executo o que é para mim, pendente e fresco', () => {
  assert.ok(devoExecutar(pedido(), 'pc', AGORA + 1_000));
  assert.ok(!devoExecutar(pedido(), 'outro', AGORA + 1_000), 'não é para este aparelho');
  assert.ok(!devoExecutar(pedido({ estado: 'feito' }), 'pc', AGORA + 1_000), 'já foi feita');
  assert.ok(!devoExecutar(pedido(), 'pc', AGORA + 60_000), 'um telemóvel que acorda tarde não salta faixas sozinho');
});

console.log('\no resto');
caso('o que se diz a quem manda, em inglês e curto', () => {
  assert.match(avisoDoPedido('pendente', 'PC', 'assumir'), /Sending to PC/);
  assert.match(avisoDoPedido('feito', 'PC', 'assumir'), /Playing on PC/);
  assert.match(avisoDoPedido('expirado', 'iPhone', 'seguinte'), /did not answer/);
  assert.match(avisoDoPedido('recusado', 'PC', 'pausar'), /could not/);
  for (const estado of ['pendente', 'feito', 'recusado', 'expirado'] as const) {
    const frase = avisoDoPedido(estado, 'PC', 'assumir');
    assert.ok(frase.length <= 64, frase);
    assert.ok(!/[ãõçáéíóú]/i.test(frase), frase);
  }
});

console.log('\numa linha por aparelho, e nao uma por instalacao');
caso('sete fantasmas do mesmo iPhone dao UMA linha', () => {
  // O caso real do Joao a 12/9: uma instalacao por versao, cada uma com o seu
  // device_id e todas com o nome "iPhone".
  const fantasmas = [1, 2, 3, 4, 5, 6, 7].map((i) => sessao({
    deviceId: `iphone-${i}`, deviceKind: 'ios', idadeMs: i * 60 * 60_000,
  }));
  const lista = aparelhosDisponiveis(fantasmas, 'pc', AGORA);
  assert.equal(lista.length, 1);
  // Fica o mais recente, e diz porque nao da para o comandar.
  assert.equal(lista[0].deviceId, 'iphone-1');
  assert.equal(lista[0].motivo, motivoDeNaoAlcancar('ios'));
});

caso('com o verdadeiro acordado, os fantasmas desaparecem', () => {
  const lista = aparelhosDisponiveis([
    sessao({ deviceId: 'velho-a', deviceKind: 'ios', idadeMs: 3 * 60 * 60_000 }),
    sessao({ deviceId: 'velho-b', deviceKind: 'ios', idadeMs: 20 * 60_000 }),
    sessao({ deviceId: 'agora', deviceKind: 'ios', idadeMs: 3_000, isPlaying: true }),
  ], 'pc', AGORA);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].deviceId, 'agora');
  assert.ok(lista[0].aTocar);
});

caso('dois aparelhos DIFERENTES continuam a ser dois', () => {
  const lista = aparelhosDisponiveis([
    sessao({ deviceId: 'pc-casa', deviceKind: 'desktop', deviceName: 'PC', idadeMs: 4_000 }),
    sessao({ deviceId: 'telemovel', deviceKind: 'ios', idadeMs: 4_000 }),
  ], 'outro', AGORA);
  assert.equal(lista.length, 2);
});

caso('dois com o mesmo nome, ambos acordados, ficam ambos', () => {
  // Nao se colapsa o que esta mesmo la: um deles responde a ordem.
  const lista = aparelhosDisponiveis([
    sessao({ deviceId: 'um', deviceKind: 'ios', idadeMs: 4_000 }),
    sessao({ deviceId: 'dois', deviceKind: 'ios', idadeMs: 9_000 }),
  ], 'pc', AGORA);
  assert.equal(lista.length, 2);
});

caso('um aparelho que nunca mais abriu a app sai da lista', () => {
  const velho = sessao({ deviceId: 'antigo', deviceKind: 'ios', idadeMs: ESQUECER_APARELHO_MS + 60_000 });
  assert.equal(aparelhosDisponiveis([velho], 'pc', AGORA).length, 0);
  const quase = sessao({ deviceId: 'antigo', deviceKind: 'ios', idadeMs: ESQUECER_APARELHO_MS - 60_000 });
  assert.equal(aparelhosDisponiveis([quase], 'pc', AGORA).length, 1);
});

caso('os que a lista esconde sao os que se podem apagar', () => {
  const sessoes = [
    sessao({ deviceId: 'pc', deviceKind: 'desktop', idadeMs: 4_000 }),
    sessao({ deviceId: 'agora', deviceKind: 'ios', idadeMs: 3_000, isPlaying: true }),
    sessao({ deviceId: 'fantasma-1', deviceKind: 'ios', idadeMs: 2 * 60 * 60_000 }),
    sessao({ deviceId: 'fantasma-2', deviceKind: 'ios', idadeMs: 5 * 60 * 60_000 }),
    sessao({ deviceId: 'eu', deviceKind: 'ios', idadeMs: 1_000 }),
  ];
  const lista = aparelhosDisponiveis(sessoes, 'eu', AGORA).map((a) => a.deviceId);
  const apagar = fantasmasDeSessoes(sessoes, 'eu', AGORA);
  assert.deepEqual(apagar.sort(), ['fantasma-1', 'fantasma-2']);
  // O proprio aparelho NUNCA entra: apagar a propria linha era desaparecer do
  // "continuar aqui" dos outros.
  assert.ok(!apagar.includes('eu'));
  // E o que se apaga e exatamente o que a lista nao mostra.
  assert.equal(apagar.some((id) => lista.includes(id)), false);
});

caso('sem fantasmas nao se apaga nada', () => {
  const sessoes = [
    sessao({ deviceId: 'pc', deviceKind: 'desktop', idadeMs: 4_000 }),
    sessao({ deviceId: 'telemovel', deviceKind: 'ios', idadeMs: 9_000 }),
  ];
  assert.deepEqual(fantasmasDeSessoes(sessoes, 'eu', AGORA), []);
});

console.log('\nabrir a app nao pode por musica a tocar');
caso('no arranque so passa o que nao arranca som', () => {
  assert.ok(!podeExecutarNoArranque('assumir'));
  assert.ok(!podeExecutarNoArranque('tocar-pausa'));
  assert.ok(!podeExecutarNoArranque('seguinte'));
  assert.ok(!podeExecutarNoArranque('anterior'));
  assert.ok(podeExecutarNoArranque('pausar'));
});

caso('um assumir que ficou pendente NAO e executado ao abrir a app', () => {
  // O caso real: mandado do PC com o iPhone fechado. Fresco pelo relogio (que
  // e o que nao se pode usar para decidir isto) e para este aparelho.
  const pedido: Pedido = {
    id: 'p1', deAparelho: 'pc', paraAparelho: 'iphone', tipo: 'assumir',
    criadoEm: AGORA - 5_000, estado: 'pendente', detalhe: null,
  };
  assert.ok(devoExecutar(pedido, 'iphone', AGORA), 'com a app aberta, executa-se');
  assert.ok(!devoExecutar(pedido, 'iphone', AGORA, true), 'no arranque, nao');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

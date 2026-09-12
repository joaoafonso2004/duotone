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
  const lista = aparelhosDisponiveis([
    sessao({ deviceId: 'dormente', idadeMs: 20 * 60_000 }),
    sessao({ deviceId: 'parado', idadeMs: 10_000 }),
    sessao({ deviceId: 'a-tocar', idadeMs: 4_000, isPlaying: true }),
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

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

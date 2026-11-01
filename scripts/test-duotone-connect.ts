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
  ACORDADO_MS, VALIDADE_DO_PEDIDO_MS, avisoDoPedido,
  devoExecutar, estaAcordado, estadoDoPedido, pedidoExpirou, podeExecutarNoArranque,
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

/**
 * O que é um download, separado do que está em disco -- src/lib/downloadsExplicitos.ts.
 * Inclui a migração dos fixados antigos e a semana de proteção.
 *
 * Correr: node --experimental-strip-types scripts/test-downloads-explicitos.ts
 */
import assert from 'node:assert/strict';
import {
  comPedido, downloadNoMenu, escreverRegisto, faixaDoPedido, lerFixadosAntigos, lerRegisto,
  migrarDosFixados, pedidosPorOrdem, projecaoAntiga, PROTECAO_DA_MIGRACAO_MS, protegidosDaLimpeza,
  registoVazio, semPedido, situacaoDoDownload,
} from '../src/lib/downloadsExplicitos.ts';
import type { Track } from '../src/types.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const faixa = (id: string, titulo = `Música ${id}`): Track => ({
  id: `db-${id}`, source: 'youtube', sourceId: id, title: titulo, artist: 'Artista',
  album: null, artworkUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, durationSeconds: 200,
});
const DIA = 86_400_000;

console.log('\nestar em disco não é ter sido descarregada');
caso('a tabela de estados', () => {
  const s = (pedido: boolean, emDisco: boolean, aDescarregar: boolean) => situacaoDoDownload({ pedido, emDisco, aDescarregar });
  assert.equal(s(false, true, false), 'nenhum', 'cache automática: toca, mas não é download');
  assert.equal(s(false, false, false), 'nenhum');
  assert.equal(s(true, true, false), 'descarregada');
  assert.equal(s(true, false, true), 'a-descarregar');
  assert.equal(s(true, false, false), 'em-falta', 'pedido sem ficheiro nunca aparece concluído');
  assert.equal(s(true, true, true), 'descarregada', 'o ficheiro em disco manda');
});
caso('no menu, um pedido em falta volta a oferecer "Download"', () => {
  assert.equal(downloadNoMenu('em-falta'), 'nenhum');
  assert.equal(downloadNoMenu('descarregada'), 'descarregada');
  assert.equal(downloadNoMenu('a-descarregar'), 'a-descarregar');
});

console.log('\npedir e tirar');
caso('o pedido guarda uma cópia da faixa, sem o id da base de dados', () => {
  const r = comPedido(registoVazio(), faixa('a'), 1000);
  assert.deepEqual(r.pedidos.a, {
    pedidoEm: 1000,
    faixa: { sourceId: 'a', title: 'Música a', artist: 'Artista', album: null, artworkUrl: 'https://i.ytimg.com/vi/a/hqdefault.jpg', durationSeconds: 200 },
  });
});
caso('pedir outra vez mantém a data do primeiro pedido', () => {
  const r = comPedido(comPedido(registoVazio(), faixa('a'), 1000), faixa('a', 'Novo título'), 5000);
  assert.equal(r.pedidos.a.pedidoEm, 1000);
  assert.equal(r.pedidos.a.faixa?.title, 'Novo título');
});
caso('tirar leva o pedido e a proteção da migração dessa faixa', () => {
  const r = { ...comPedido(registoVazio(), faixa('a'), 1), migracao: { ate: 10 * DIA, ids: ['a', 'b'] } };
  const sem = semPedido(r, 'a');
  assert.equal('a' in sem.pedidos, false);
  assert.deepEqual(sem.migracao?.ids, ['b']);
});
caso('tirar o que não existe devolve o mesmo registo', () => {
  const r = comPedido(registoVazio(), faixa('a'), 1);
  assert.equal(semPedido(r, 'zz'), r);
});
caso('uma faixa sem cópia toca na mesma, com o id no lugar do título', () => {
  const t = faixaDoPedido('xyz', { pedidoEm: 0, faixa: null });
  assert.equal(t.source, 'youtube');
  assert.equal(t.sourceId, 'xyz');
  assert.equal(t.title, 'xyz');
});
caso('a lista vem dos mais recentes para os mais antigos', () => {
  let r = registoVazio();
  r = comPedido(r, faixa('velha'), 1);
  r = comPedido(r, faixa('nova'), 3);
  r = comPedido(r, faixa('meio'), 2);
  assert.deepEqual(pedidosPorOrdem(r), ['nova', 'meio', 'velha']);
});

console.log('\na migração (primeira abertura desta versão)');
caso('os fixados antigos passam a pedidos, o resto do disco fica uma semana protegido', () => {
  const r = migrarDosFixados(['p1', 'p2'], ['p1', 'c1', 'c2', 'c2'], 1000);
  assert.deepEqual(Object.keys(r.pedidos).sort(), ['p1', 'p2']);
  assert.equal(r.pedidos.p1.faixa, null);
  assert.deepEqual(r.migracao, { ate: 1000 + PROTECAO_DA_MIGRACAO_MS, ids: ['c1', 'c2'] });
  assert.equal(PROTECAO_DA_MIGRACAO_MS, 7 * DIA);
});
caso('um fixado sem ficheiro é pedido, mas não aparece concluído', () => {
  const r = migrarDosFixados(['sem-ficheiro'], [], 0);
  assert.ok('sem-ficheiro' in r.pedidos);
  assert.equal(situacaoDoDownload({ pedido: true, emDisco: false, aDescarregar: false }), 'em-falta');
  assert.equal(r.migracao, null, 'nada em disco, nada a proteger');
});
caso('a limpeza protege os pedidos sempre e a migração só durante a semana', () => {
  const r = migrarDosFixados(['p'], ['p', 'c'], 0);
  assert.deepEqual(protegidosDaLimpeza(r, 6 * DIA).sort(), ['c', 'p']);
  assert.deepEqual(protegidosDaLimpeza(r, 7 * DIA), ['p'], 'passados os 7 dias é cache como a outra');
});
caso('a chave antiga é uma projeção dos pedidos, e não leva a proteção temporária', () => {
  const r = migrarDosFixados(['p'], ['c'], 0);
  assert.deepEqual(projecaoAntiga(r), ['p']);
});
caso('a lista antiga lê-se com tolerância', () => {
  assert.deepEqual(lerFixadosAntigos(null), []);
  assert.deepEqual(lerFixadosAntigos('isto não é json'), []);
  assert.deepEqual(lerFixadosAntigos('{"a":1}'), []);
  assert.deepEqual(lerFixadosAntigos('["a", 3, "", "b"]'), ['a', 'b']);
});

console.log('\nguardar e ler');
caso('o que se escreve lê-se igual', () => {
  let r = migrarDosFixados(['antigo'], ['c'], 5);
  r = comPedido(r, faixa('novo'), 9);
  assert.deepEqual(lerRegisto(escreverRegisto(r)), r);
});
caso('sem chave é a primeira abertura: `null`, para migrar', () => {
  assert.equal(lerRegisto(null), null);
});
caso('uma chave ilegível ATIRA, e não passa por vazia', () => {
  // Vazio seria gravado por cima na primeira mudança e os downloads iam-se.
  assert.throws(() => lerRegisto('{estragado'));
  assert.throws(() => lerRegisto('{"versao":2,"pedidos":{}}'));
  assert.throws(() => lerRegisto('null'));
});
caso('campos estranhos dentro de um pedido não o deitam fora', () => {
  const r = lerRegisto('{"versao":1,"pedidos":{"a":{"pedidoEm":"x","faixa":{"title":"T","artist":5}},"b":{"pedidoEm":1,"faixa":7}},"migracao":{"ate":"x"}}');
  assert.ok(r);
  assert.equal(r.pedidos.a.pedidoEm, 0);
  assert.equal(r.pedidos.a.faixa?.title, 'T');
  assert.equal(r.pedidos.a.faixa?.artist, null);
  assert.equal(r.pedidos.b.faixa, null);
  assert.equal(r.migracao, null);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

/**
 * Pedir, tirar e limpar downloads, com o registo guardado a sério (o duplo do
 * AsyncStorage) e o download a fingir -- src/lib/acoesDeDownload.ts +
 * src/lib/downloadsFixados.ts. É aqui que ficam presas as corridas: tirar a
 * meio, pedir outra vez, limpar tudo, gravações lentas e gravações que falham.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-downloads-acoes.ts
 */
import assert from 'node:assert/strict';
import AsyncStorage, { guardado } from '@react-native-async-storage/async-storage';
import { criarAcoesDeDownload } from '../src/lib/acoesDeDownload.ts';
import {
  carregarFixados, esquecerPedido, esquecerTodos, idsProtegidos, marcarADescarregar, podeLimpar,
  registarPedido, reporParaTestes, temPedido, useDownloadsFixados,
} from '../src/lib/downloadsFixados.ts';
import { PROTECAO_DA_MIGRACAO_MS } from '../src/lib/downloadsExplicitos.ts';
import type { Track } from '../src/types.ts';

const ABORTADO = 'Download aborted';
const CHAVE = 'downloads_explicitos:v1';
const CHAVE_ANTIGA = 'downloads_fixados';

let falhas = 0;
async function caso(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).stack}`); }
}

const faixa = (id: string): Track => ({
  source: 'youtube', sourceId: id, title: `Música ${id}`, artist: 'A', album: null, artworkUrl: null, durationSeconds: 100,
});

/** Uma promessa que o teste resolve quando quer. */
function portao() {
  let abrir!: () => void;
  const p = new Promise<void>((r) => { abrir = r; });
  return { p, abrir };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

const setItemVerdadeiro = AsyncStorage.setItem;
const getItemVerdadeiro = AsyncStorage.getItem;

/** Um mundo novo: disco, rede e o download a fingir, e o registo real por cima. */
async function mundo(opts: { disco?: string[]; fixadosAntigos?: string[]; carregar?: boolean } = {}) {
  reporParaTestes();
  guardado.clear();
  (AsyncStorage as any).setItem = setItemVerdadeiro;
  (AsyncStorage as any).getItem = getItemVerdadeiro;
  if (opts.fixadosAntigos) guardado.set(CHAVE_ANTIGA, JSON.stringify(opts.fixadosAntigos));
  const disco = new Set(opts.disco ?? []);
  const estado = {
    offline: false,
    descarregados: [] as string[],
    /** Se definido, cada download espera por ele antes de "acabar". */
    portao: null as null | { p: Promise<void>; abrir: () => void },
    falhar: false,
    apagouTudo: 0,
    gravadoAoComecar: [] as boolean[],
  };
  const acoes = criarAcoesDeDownload({
    registar: (t) => registarPedido(t),
    esquecer: esquecerPedido,
    esquecerTodos,
    temPedido,
    emDisco: (id) => disco.has(id),
    marcarADescarregar,
    semRede: () => estado.offline,
    async descarregar(t, parar) {
      estado.descarregados.push(t.sourceId);
      estado.gravadoAoComecar.push(JSON.parse(guardado.get(CHAVE) ?? '{"pedidos":{}}').pedidos[t.sourceId] !== undefined);
      if (estado.portao) await estado.portao.p;
      if (parar()) throw new Error(ABORTADO);
      if (estado.falhar) throw new Error('HTTP 403');
      disco.add(t.sourceId);
    },
    apagarFicheiro: (id) => { disco.delete(id); },
    apagarTudo: () => { disco.clear(); estado.apagouTudo++; },
    avisarCancelamentos: () => {},
    foiCancelado: (e) => e instanceof Error && e.message === ABORTADO,
    avisar: () => {},
  });
  if (opts.carregar !== false) await carregarFixados(() => [...disco], 1000);
  const gravado = () => JSON.parse(guardado.get(CHAVE) ?? 'null');
  return { acoes, disco, estado, gravado };
}

console.log('\nabrir a versão nova');
await caso('os fixados antigos passam a downloads; o resto do disco fica uma semana protegido', async () => {
  const { gravado } = await mundo({ fixadosAntigos: ['p'], disco: ['p', 'c'] });
  assert.ok(temPedido('p'));
  assert.equal(temPedido('c'), false, 'o que só tocou não passa a download');
  assert.deepEqual(idsProtegidos(1000).sort(), ['c', 'p']);
  assert.deepEqual(idsProtegidos(1000 + PROTECAO_DA_MIGRACAO_MS), ['p']);
  assert.deepEqual(Object.keys(gravado().pedidos), ['p'], 'a migração fica gravada');
  assert.deepEqual(JSON.parse(guardado.get(CHAVE_ANTIGA)!), ['p']);
});
await caso('a segunda abertura não migra outra vez (a semana não recomeça)', async () => {
  const { gravado } = await mundo({ fixadosAntigos: ['p'], disco: ['p', 'c'] });
  const antes = gravado().migracao.ate;
  reporParaTestes();
  await carregarFixados(() => ['p', 'c', 'novo'], 999_999);
  assert.equal(useDownloadsFixados.getState().registo.migracao?.ate, antes);
  assert.deepEqual(useDownloadsFixados.getState().registo.migracao?.ids, ['c']);
});
await caso('um toque antes de acabar de carregar não se perde', async () => {
  await mundo({ carregar: false, fixadosAntigos: ['p'] });
  const pedido = registarPedido(faixa('cedo'));
  await carregarFixados(() => [], 1000);
  assert.equal(await pedido, true);
  assert.ok(temPedido('cedo') && temPedido('p'));
  assert.ok(JSON.parse(guardado.get(CHAVE)!).pedidos.cedo);
});
await caso('se a leitura falhar, não se limpa nem se grava por cima', async () => {
  await mundo({ carregar: false });
  guardado.set(CHAVE, JSON.stringify({ versao: 1, pedidos: { importante: { pedidoEm: 1, faixa: null } }, migracao: null }));
  (AsyncStorage as any).getItem = () => Promise.reject(new Error('disco em baixo'));
  await carregarFixados(() => [], 1000);
  assert.equal(podeLimpar(), false, 'a limpeza do arranque não corre');
  assert.equal(await registarPedido(faixa('x')), false, 'não se promete o que não fica gravado');
  assert.equal(temPedido('x'), false);
  assert.ok(JSON.parse(guardado.get(CHAVE)!).pedidos.importante, 'o que estava guardado ficou');
});
await caso('um registo ilegível conta como leitura falhada, e não como vazio', async () => {
  await mundo({ carregar: false });
  guardado.set(CHAVE, '{estragado');
  await carregarFixados(() => ['a'], 1000);
  assert.equal(podeLimpar(), false);
  assert.equal(guardado.get(CHAVE), '{estragado');
});

console.log('\n"Download"');
await caso('sobre uma faixa que já tocou (em disco) só a guarda: sem rede e sem download', async () => {
  const { acoes, estado } = await mundo({ disco: ['a'] });
  estado.offline = true;
  assert.equal(await acoes.pedir(faixa('a')), 'descarregada');
  assert.deepEqual(estado.descarregados, []);
  assert.ok(idsProtegidos(1000).includes('a'));
});
await caso('o pedido fica gravado ANTES de o download começar', async () => {
  const { acoes, estado, disco } = await mundo();
  assert.equal(await acoes.pedir(faixa('a')), 'descarregada');
  assert.deepEqual(estado.gravadoAoComecar, [true]);
  assert.ok(disco.has('a'));
  assert.equal(useDownloadsFixados.getState().aDescarregar.has('a'), false);
});
await caso('enquanto descarrega diz que está a descarregar, e um segundo pedido não descarrega outra vez', async () => {
  const { acoes, estado } = await mundo();
  estado.portao = portao();
  const primeiro = acoes.pedir(faixa('a'));
  await esperar();
  assert.ok(useDownloadsFixados.getState().aDescarregar.has('a'));
  assert.equal(await acoes.pedir(faixa('a')), 'a-descarregar');
  estado.portao.abrir();
  assert.equal(await primeiro, 'descarregada');
  assert.deepEqual(estado.descarregados, ['a']);
});
await caso('se a gravação falhar não se descarrega nem se promete', async () => {
  const { acoes, estado } = await mundo();
  (AsyncStorage as any).setItem = () => Promise.reject(new Error('disco cheio'));
  assert.equal(await acoes.pedir(faixa('a')), 'nao-gravado');
  assert.equal(temPedido('a'), false);
  assert.deepEqual(estado.descarregados, []);
});
await caso('um download que falha fica em falta, e continua pedido', async () => {
  const { acoes, estado, gravado } = await mundo();
  estado.falhar = true;
  assert.equal(await acoes.pedir(faixa('a')), 'em-falta');
  assert.ok(temPedido('a') && gravado().pedidos.a);
  estado.falhar = false;
  assert.equal(await acoes.pedir(faixa('a')), 'descarregada', 'e pedir outra vez resolve');
});
await caso('perder a rede a meio deixa-o em falta, não o esquece', async () => {
  const { acoes, estado } = await mundo();
  estado.portao = portao();
  const p = acoes.pedir(faixa('a'));
  await esperar();
  estado.offline = true;
  estado.portao.abrir();
  assert.equal(await p, 'em-falta');
  assert.ok(temPedido('a'));
});

console.log('\ntirar e limpar a meio');
await caso('"Cancel download" a meio: nada publica, nada fica pedido nem gravado', async () => {
  const { acoes, estado, disco, gravado } = await mundo();
  estado.portao = portao();
  const p = acoes.pedir(faixa('a'));
  await esperar();
  await acoes.tirar('a');
  estado.portao.abrir();
  assert.equal(await p, 'desistiu');
  assert.equal(disco.has('a'), false);
  assert.equal(temPedido('a'), false);
  assert.equal(gravado().pedidos.a, undefined);
  assert.equal(useDownloadsFixados.getState().aDescarregar.has('a'), false);
});
await caso('tirar enquanto o pedido ainda se grava ganha ao pedido', async () => {
  const { acoes, estado, gravado } = await mundo();
  const lento = portao();
  (AsyncStorage as any).setItem = async (k: string, v: string) => { await lento.p; guardado.set(k, v); };
  const p = acoes.pedir(faixa('a'));
  const t = acoes.tirar('a');
  lento.abrir();
  assert.equal(await p, 'desistiu');
  await t;
  assert.deepEqual(estado.descarregados, []);
  assert.equal(gravado().pedidos.a, undefined, 'a gravação lenta do pedido não acaba por cima da remoção');
});
await caso('tirar e voltar a pedir a meio: o antigo para, o novo acaba', async () => {
  const { acoes, estado, disco } = await mundo();
  const primeiro = portao();
  estado.portao = primeiro;
  const antigo = acoes.pedir(faixa('a'));
  await esperar();
  await acoes.tirar('a');
  estado.portao = null;
  const novo = acoes.pedir(faixa('a'));
  primeiro.abrir();
  assert.equal(await antigo, 'desistiu');
  assert.equal(await novo, 'descarregada');
  assert.ok(disco.has('a') && temPedido('a'));
  assert.equal(useDownloadsFixados.getState().aDescarregar.has('a'), false, 'o antigo não larga o lugar do novo');
});
await caso('"Remove download" apaga o ficheiro; ouvir a seguir volta a ser só cache', async () => {
  const { acoes, disco } = await mundo({ disco: ['a'] });
  await acoes.pedir(faixa('a'));
  await acoes.tirar('a');
  assert.equal(disco.has('a'), false);
  disco.add('a'); // tocou outra vez
  assert.equal(temPedido('a'), false, 'sem ↓: não foi pedido');
});
await caso('limpar tudo a meio: pedidos, proteção, ficheiros, e o download que ia a meio não volta', async () => {
  const { acoes, estado, disco, gravado } = await mundo({ fixadosAntigos: ['p'], disco: ['p', 'c'] });
  estado.portao = portao();
  const p = acoes.pedir(faixa('a'));
  await esperar();
  await acoes.limparTudo();
  estado.portao.abrir();
  assert.equal(await p, 'desistiu');
  assert.equal(disco.size, 0);
  assert.equal(estado.apagouTudo, 1);
  assert.deepEqual(gravado(), { versao: 1, pedidos: {}, migracao: null });
  assert.deepEqual(JSON.parse(guardado.get(CHAVE_ANTIGA)!), []);
  assert.deepEqual(idsProtegidos(1000), []);
  assert.equal(await acoes.pedir(faixa('b')), 'descarregada', 'e depois de limpar pede-se como sempre');
});

console.log('\no botão dos menus');
await caso('alterna pela situação: pedir, e depois tirar', async () => {
  const { acoes, disco } = await mundo();
  await acoes.alternar(faixa('a'), 'nenhum');
  assert.ok(temPedido('a') && disco.has('a'));
  await acoes.alternar(faixa('a'), 'descarregada');
  assert.ok(!temPedido('a') && !disco.has('a'));
});
await caso('em falta, o botão volta a pedir (não tira)', async () => {
  const { acoes, estado } = await mundo();
  estado.falhar = true;
  await acoes.pedir(faixa('a'));
  estado.falhar = false;
  await acoes.alternar(faixa('a'), 'em-falta');
  assert.ok(temPedido('a'));
  assert.deepEqual(estado.descarregados, ['a', 'a']);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

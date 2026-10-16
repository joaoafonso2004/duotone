/**
 * Os pedidos ao YouTube (16/10): medir, recuar quando ele recusa, e não
 * repetir as mesmas procuras. Ver lib/pedidosAoYouTube.ts e
 * api/procurasNoYouTube.ts.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-pedidos-ao-youtube.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  contarPedido, emRecuo, estadoDoErro, faltaDoRecuo, limparPedidos, RECUO_INICIAL_MS, RECUO_MAXIMO_MS,
  registarPedidoAoYouTube, resumoDosPedidos, textoDosPedidos,
} from '../src/lib/pedidosAoYouTube.ts';
import { ACHADA_VALE_MS, chaveDaProcura, FALHADA_VALE_MS, guardarProcura, procuraGuardada } from '../src/api/procurasNoYouTube.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
const T0 = 1_800_000_000_000;

console.log('\nmedir');
await caso('conta por tipo, na última hora e no dia', () => {
  limparPedidos();
  registarPedidoAoYouTube('pesquisa', 200, T0);
  registarPedidoAoYouTube('procura-de-musica', 200, T0 + 1000);
  registarPedidoAoYouTube('procura-de-musica', 200, T0 - 2 * 60 * 60_000);
  const hora = resumoDosPedidos(60 * 60_000, T0 + 2000);
  assert.equal(hora.total, 2);
  assert.equal(hora.porTipo['procura-de-musica'], 1);
  assert.equal(resumoDosPedidos(24 * 60 * 60_000, T0 + 2000).total, 3);
});
await caso('o estado vem do texto do erro (a ponte do PC diz "InnerTube HTTP 403")', () => {
  assert.equal(estadoDoErro(new Error("Error invoking remote method 'yt:pesquisa': Error: InnerTube HTTP 403")), 403);
  assert.equal(estadoDoErro(new Error('YouTube Music HTTP 429')), 429);
  assert.equal(estadoDoErro(new Error('Aborted')), 'erro');
});
await caso('contarPedido conta a resposta e a falha, e a falha continua a subir', async () => {
  limparPedidos();
  assert.equal(await contarPedido('ytm-radio', async () => 7), 7);
  await assert.rejects(contarPedido('ytm-radio', async () => { throw new Error('YouTube Music HTTP 403'); }));
  const r = resumoDosPedidos(60_000);
  assert.equal(r.total, 2);
  assert.equal(r.recusados, 1);
});

console.log('\nrecuar');
await caso('à primeira recusa, o fundo pára 5 min', () => {
  limparPedidos();
  assert.equal(emRecuo(T0), false);
  registarPedidoAoYouTube('pesquisa', 403, T0);
  assert.equal(emRecuo(T0 + 1000), true);
  assert.equal(faltaDoRecuo(T0), RECUO_INICIAL_MS);
  assert.equal(emRecuo(T0 + RECUO_INICIAL_MS + 1), false);
});
await caso('uma recusa a meio do recuo não o encurta nem o dobra; uma depois dele, dobra', () => {
  limparPedidos();
  registarPedidoAoYouTube('pesquisa', 403, T0);
  registarPedidoAoYouTube('procura-de-musica', 429, T0 + 60_000);
  assert.equal(faltaDoRecuo(T0), RECUO_INICIAL_MS + 60_000);
  const depois = T0 + RECUO_INICIAL_MS + 60_001;
  registarPedidoAoYouTube('pesquisa', 403, depois);
  assert.equal(faltaDoRecuo(depois), 2 * RECUO_INICIAL_MS);
});
await caso('nunca mais de 30 min, e uma resposta boa depois do recuo limpa tudo', () => {
  limparPedidos();
  let t = T0;
  for (let i = 0; i < 8; i++) { registarPedidoAoYouTube('pesquisa', 403, t); t += faltaDoRecuo(t) + 1; }
  registarPedidoAoYouTube('pesquisa', 403, t);
  assert.ok(faltaDoRecuo(t) <= RECUO_MAXIMO_MS);
  t += faltaDoRecuo(t) + 1;
  registarPedidoAoYouTube('pesquisa', 200, t);
  registarPedidoAoYouTube('pesquisa', 403, t + 1);
  assert.equal(faltaDoRecuo(t + 1), RECUO_INICIAL_MS, 'recomeça nos 5 min');
});
await caso('um vídeo que não existe (404) não é recusa', () => {
  limparPedidos();
  registarPedidoAoYouTube('ytm-pagina', 404, T0);
  assert.equal(emRecuo(T0 + 1), false);
});
await caso('o relatório diz quantos, quantos recusados e se está a recuar', () => {
  limparPedidos();
  registarPedidoAoYouTube('pesquisa', 200, Date.now());
  registarPedidoAoYouTube('procura-de-musica', 403, Date.now());
  const texto = textoDosPedidos();
  assert.match(texto, /== YouTube requests/);
  assert.match(texto, /last hour: 2 requests, 1 refused/);
  assert.match(texto, /backing off: background work paused for 5 more min/);
});

console.log('\nnão repetir as mesmas procuras');
await caso('a procura guarda-se 30 dias, a que não achou 3', async () => {
  const chave = chaveDaProcura('Isak', 'Max  Win');
  assert.equal(chave, 'isak|max win');
  assert.equal(await procuraGuardada(chave, T0), undefined);
  guardarProcura(chave, { source: 'youtube', sourceId: 'abc', title: 'Max Win', artist: 'Isak', album: 'x', artworkUrl: null, durationSeconds: 180 }, T0);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal((await procuraGuardada(chave, T0 + ACHADA_VALE_MS - 1))?.faixa?.sourceId, 'abc');
  assert.equal(await procuraGuardada(chave, T0 + ACHADA_VALE_MS + 1), undefined);
  guardarProcura('ninguem|nada', null, T0);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(await procuraGuardada('ninguem|nada', T0 + FALHADA_VALE_MS - 1), { faixa: null });
  assert.equal(await procuraGuardada('ninguem|nada', T0 + FALHADA_VALE_MS + 1), undefined);
});
await caso('a descoberta usa a guardada, e em recuo não pede', () => {
  const d = ler('src/api/descoberta.ts');
  const corpo = d.slice(d.indexOf('export async function procurarNoYouTube('), d.indexOf('const resultado: Track = {'));
  assert.ok(corpo.indexOf('procuraGuardada(chave)') < corpo.indexOf('if (emRecuo()) return null;'));
  assert.ok(corpo.indexOf('if (emRecuo()) return null;') < corpo.indexOf('searchYouTubeFreeWithChannel('));
  assert.match(d, /const EM_PARALELO = 2;/);
});
await caso('o Radio e os lançamentos não pedem durante o recuo', () => {
  const r = ler('src/api/radio.ts');
  assert.match(r, /if \(artists\[0\] && !emRecuo\(\)\) \{/);
  assert.match(r, /for \(const daMusica of comVideo\) \{\s*if \(emRecuo\(\)\) break;/);
  const n = ler('src/state/novosLancamentos.ts');
  assert.match(n, /if \(emRecuo\(\)\) \{ agendar\(daConta, minha, faltaDoRecuo\(\) \+ 60_000\); return; \}/);
});
await caso('as pesquisas contam-se nos dois caminhos (o direto e a ponte do PC)', () => {
  const s = ler('src/api/ytSearchFree.ts');
  assert.match(s, /return contarPedido\(tipo, \(\) => pedirAoYouTubeSemContar\(alvo, signal\)\);/);
  const m = ler('src/api/ytMusic.ts');
  assert.match(m, /registarPedidoAoYouTube\(TIPO_DO_CAMINHO\[caminho\], r\.status\);/);
  assert.match(m, /contarPedido\('ytm-radio', \(\) => ponte\(/);
  assert.match(m, /contarPedido\('ytm-pagina', \(\) => ponte\(\{ browseId/);
  // os relatórios dos dois mostram-nos
  assert.match(ler('src/lib/relatorioDeReproducao.ts'), /textoDosPedidos\(\)/);
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /textoDosPedidos\(\)/);
});

console.log(falhas ? `\n  ${falhas} caso(s) a falhar.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

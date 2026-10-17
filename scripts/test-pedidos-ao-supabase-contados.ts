/**
 * Os pedidos ao Supabase (17/10): contados por caminho no relatório, e no PC
 * pelo processo principal (sem o OPTIONS do CORS). Ver lib/pedidosAoSupabase.ts
 * e lib/fetchDoSupabase.ts.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-pedidos-ao-supabase-contados.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  limparPedidosAoSupabase, nomeDoPedido, registarPedidoAoSupabase, resumoDoSupabase, textoDoSupabase,
} from '../src/lib/pedidosAoSupabase.ts';
import { criarFetchDoSupabase, PELA_PONTE, type PedidoPelaPonte, type RespostaPelaPonte } from '../src/lib/fetchDoSupabase.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
const T0 = 1_800_000_000_000;
const BASE = 'https://abcdefghijklmnopqrst.supabase.co';

console.log('\ncontar');
await caso('o nome curto: método e tabela, função ou parte da API', () => {
  assert.equal(nomeDoPedido(`${BASE}/rest/v1/rpc/publish_social_presence`, 'post'), 'POST rpc/publish_social_presence');
  assert.equal(nomeDoPedido(`${BASE}/rest/v1/player_sessions?select=*&user_id=eq.1`), 'GET player_sessions');
  assert.equal(nomeDoPedido(`${BASE}/auth/v1/token?grant_type=refresh_token`, 'POST'), 'POST auth/token');
  assert.equal(nomeDoPedido(`${BASE}/storage/v1/object/avatars/x.png`, 'PUT'), 'PUT storage/object');
  assert.equal(nomeDoPedido('https://exemplo.pt/qualquer'), 'GET outro');
});
await caso('conta na última hora e no dia, do mais pedido para o menos', () => {
  limparPedidosAoSupabase();
  registarPedidoAoSupabase(`${BASE}/rest/v1/rpc/publish_social_presence`, 'POST', T0);
  registarPedidoAoSupabase(`${BASE}/rest/v1/rpc/publish_social_presence`, 'POST', T0 + 1000);
  registarPedidoAoSupabase(`${BASE}/rest/v1/yt_cache?id=eq.1`, 'GET', T0 + 2000);
  registarPedidoAoSupabase(`${BASE}/rest/v1/yt_cache?id=eq.2`, 'GET', T0 - 2 * 60 * 60_000);
  const hora = resumoDoSupabase(60 * 60_000, T0 + 3000);
  assert.equal(hora.total, 3);
  assert.deepEqual(hora.porNome, [['POST rpc/publish_social_presence', 2], ['GET yt_cache', 1]]);
  assert.equal(resumoDoSupabase(24 * 60 * 60_000, T0 + 3000).total, 4);
  const texto = textoDoSupabase(T0 + 3000);
  assert.match(texto, /== Server requests/);
  assert.match(texto, /last hour: 3 requests/);
  assert.match(texto, /   2  POST rpc\/publish_social_presence/);
  assert.doesNotMatch(texto, /youtube/i, 'o relatório também não fala do YouTube por aqui');
});
await caso('mais de 12 caminhos: o resto vai junto em "others"', () => {
  limparPedidosAoSupabase();
  for (let i = 0; i < 14; i++) registarPedidoAoSupabase(`${BASE}/rest/v1/tabela${i}`, 'GET', T0);
  assert.match(textoDoSupabase(T0), /\n {7}2 {2}\(others\)/);
});

console.log('\no fetch do cliente');
type Chamada = { pela: 'ponte' | 'janela'; url: string };
function preparar(responder?: (p: PedidoPelaPonte) => Promise<RespostaPelaPonte>) {
  const chamadas: Chamada[] = [];
  const pedidos: PedidoPelaPonte[] = [];
  const base = (async (entrada: RequestInfo | URL) => {
    chamadas.push({ pela: 'janela', url: String(entrada) });
    return new Response('{"da":"janela"}', { status: 200 });
  }) as typeof fetch;
  const ponte = responder && (async (p: PedidoPelaPonte) => {
    chamadas.push({ pela: 'ponte', url: p.url });
    pedidos.push(p);
    return responder(p);
  });
  return { chamadas, pedidos, fetch: criarFetchDoSupabase(ponte, base) };
}
const respostaBoa = async (): Promise<RespostaPelaPonte> =>
  ({ status: 200, statusText: 'OK', headers: [['content-type', 'application/json'], ['content-range', '0-0/1']], corpo: '[{"id":1}]' });

await caso('no iPhone (sem ponte) sai pela janela, e conta', async () => {
  limparPedidosAoSupabase();
  const { chamadas, fetch } = preparar();
  const r = await fetch(`${BASE}/rest/v1/plays`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 200);
  assert.deepEqual(chamadas.map((c) => c.pela), ['janela']);
  assert.equal(resumoDoSupabase(60_000).porNome[0][0], 'POST plays');
});
await caso('no PC, REST e autenticação vão pela ponte, com método, cabeçalhos e corpo', async () => {
  const { chamadas, pedidos, fetch } = preparar(respostaBoa);
  const h = new Headers({ apikey: 'k', Authorization: 'Bearer t', 'Content-Type': 'application/json' });
  const r = await fetch(`${BASE}/rest/v1/rpc/publish_social_presence`, { method: 'post', headers: h, body: '{"a":1}' });
  assert.deepEqual(chamadas.map((c) => c.pela), ['ponte']);
  assert.equal(pedidos[0].method, 'POST');
  assert.equal(pedidos[0].body, '{"a":1}');
  assert.deepEqual(Object.fromEntries(pedidos[0].headers), { apikey: 'k', authorization: 'Bearer t', 'content-type': 'application/json' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-range'), '0-0/1', 'o supabase-js lê as contagens daqui');
  assert.deepEqual(await r.json(), [{ id: 1 }]);
  await fetch(new URL(`${BASE}/auth/v1/token?grant_type=refresh_token`), { method: 'POST', body: '{}' });
  assert.deepEqual(chamadas.map((c) => c.pela), ['ponte', 'ponte']);
});
await caso('um 204 chega sem corpo (o construtor da Response recusava-o)', async () => {
  const { fetch } = preparar(async () => ({ status: 204, statusText: 'No Content', headers: [], corpo: '' }));
  const r = await fetch(`${BASE}/rest/v1/rpc/publish_social_presence`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
});
await caso('uma falha de rede do outro lado é o TypeError do fetch, e não sai outra vez pela janela', async () => {
  const { chamadas, fetch } = preparar(async () => ({ falhou: 'net::ERR_INTERNET_DISCONNECTED' }));
  await assert.rejects(fetch(`${BASE}/rest/v1/plays`), (e: Error) => e instanceof TypeError && /Failed to fetch/.test(e.message));
  assert.deepEqual(chamadas.map((c) => c.pela), ['ponte'], 'pedir duas vezes era mais uma linha de log');
});
await caso('a ponte recusou (ou não existe nesta versão do processo principal): sai pela janela', async () => {
  const { chamadas, fetch } = preparar(async () => { throw new Error("No handler registered for 'supabase:pedir'"); });
  const r = await fetch(`${BASE}/rest/v1/plays`);
  assert.deepEqual(await r.json(), { da: 'janela' });
  assert.deepEqual(chamadas.map((c) => c.pela), ['ponte', 'janela']);
});
await caso('Storage, corpos que não são texto e outros endereços ficam na janela', async () => {
  const { chamadas, fetch } = preparar(respostaBoa);
  await fetch(`${BASE}/storage/v1/object/avatars/a.png`, { method: 'PUT', body: '{}' });
  await fetch(`${BASE}/rest/v1/plays`, { method: 'POST', body: new Blob(['x']) });
  await fetch('https://api.deezer.com/search?q=x');
  assert.deepEqual(chamadas.map((c) => c.pela), ['janela', 'janela', 'janela']);
});
await caso('abortar desiste logo, como o fetch', async () => {
  const { fetch } = preparar(() => new Promise(() => {}));
  const c = new AbortController();
  const p = fetch(`${BASE}/rest/v1/plays`, { signal: c.signal });
  c.abort();
  await assert.rejects(p, (e: Error) => e.name === 'AbortError');
  const ja = new AbortController(); ja.abort();
  await assert.rejects(fetch(`${BASE}/rest/v1/plays`, { signal: ja.signal }), (e: Error) => e.name === 'AbortError');
});

console.log('\nligado');
await caso('o cliente usa este fetch, com a ponte do PC', () => {
  const s = ler('src/lib/supabase.ts');
  assert.match(s, /global: \{ fetch: criarFetchDoSupabase\(ponte\) \}/);
  assert.match(s, /window\.duotoneDesktop\?\.pedirAoSupabase/);
  assert.match(ler('electron/preload.cjs'), /pedirAoSupabase: \(pedido\) => ipcRenderer\.invoke\('supabase:pedir', pedido\)/);
});
await caso('o processo principal aceita exatamente o mesmo que o renderer manda', () => {
  const main = ler('electron/main.cjs');
  const m = /const PELA_PONTE_DO_SUPABASE = (\/.+\/);/.exec(main);
  assert.ok(m, 'a regra existe no main.cjs');
  assert.equal(m![1], String(PELA_PONTE));
  assert.match(main, /ipcMain\.handle\('supabase:pedir', async \(event, pedido\) => \{\s+if \(!daJanelaPrincipal\(event\)\) throw/);
});
await caso('os relatórios dos dois mostram os pedidos', () => {
  assert.match(ler('src/lib/relatorioDeReproducao.ts'), /textoDoSupabase\(\)/);
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /textoDoSupabase\(\)/);
});

console.log(falhas ? `\n  ${falhas} caso(s) a falhar.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

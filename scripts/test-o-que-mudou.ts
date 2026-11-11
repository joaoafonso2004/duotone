/**
 * "O que mudou?" num só pedido (11/11, supabase/o-que-mudou.sql).
 *
 * Os logs do Supabase são uma linha por pedido, e cada regresso à app relia o
 * Social, os ajustes, os presets e os favoritos. Agora as tabelas marcam o que
 * mudou, por conta e por aparelho, e a app pergunta uma vez.
 *
 *   - o porteiro (lib/porteiroDasMudancas.ts): o que confirma, o que partilha, e
 *     que sem a migração tudo funciona como antes;
 *   - o cabeçalho do aparelho nos pedidos à API (lib/fetchDoSupabase.ts);
 *   - a migração: as marcas nunca partem uma escrita;
 *   - quem pergunta (o Social corre a sério em scripts/test-pedidos-ao-supabase.cjs).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-o-que-mudou.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarPorteiro, PARTILHA_MS } from '../src/lib/porteiroDasMudancas.ts';
import { CABECALHO_DO_APARELHO, criarFetchDoSupabase, definirAparelhoDosPedidos } from '../src/lib/fetchDoSupabase.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

function montar(resposta: () => Record<string, string> | null | 'sem-funcao') {
  const estado = { agora: 1_000_000, conta: 'eu' as string | null, pedidos: 0 };
  const porteiro = criarPorteiro({
    conta: async () => estado.conta,
    agora: () => estado.agora,
    pedir: async () => { estado.pedidos++; return resposta(); },
  });
  return { porteiro, estado };
}

console.log('\no porteiro');
await caso('a primeira vez muda; confirmada, a mesma marca já não; uma marca nova muda', async () => {
  const marcas: Record<string, string> = { mensagens: 'm1' };
  const { porteiro, estado } = montar(() => ({ ...marcas }));
  const a = await porteiro.verificar(['mensagens']);
  assert.equal(a.mudou, true, 'nunca confirmada');
  a.confirmar();
  estado.agora += PARTILHA_MS;
  assert.equal((await porteiro.verificar(['mensagens'])).mudou, false);
  marcas.mensagens = 'm2';
  estado.agora += PARTILHA_MS;
  assert.equal((await porteiro.verificar(['mensagens'])).mudou, true);
});
await caso('uma parte sem marca nenhuma (ninguém a mudou) fica em dia depois de confirmada', async () => {
  const { porteiro, estado } = montar(() => ({}));
  (await porteiro.verificar(['ajustes'])).confirmar();
  estado.agora += PARTILHA_MS;
  assert.equal((await porteiro.verificar(['ajustes'])).mudou, false);
});
await caso('confirma-se a marca de ANTES da leitura: uma mudança a meio relê na vez seguinte', async () => {
  const marcas: Record<string, string> = { prefs: 'p1' };
  const { porteiro, estado } = montar(() => ({ ...marcas }));
  const g = await porteiro.verificar(['prefs']);
  marcas.prefs = 'p2'; // chegou enquanto se lia
  g.confirmar();
  estado.agora += PARTILHA_MS;
  assert.equal((await porteiro.verificar(['prefs'])).mudou, true);
});
await caso('as partes da app no mesmo regresso partilham um pedido; `fresco` pede outro', async () => {
  const { porteiro, estado } = montar(() => ({}));
  await Promise.all([porteiro.verificar(['mensagens']), porteiro.verificar(['ajustes']), porteiro.verificar(['presets'])]);
  assert.equal(estado.pedidos, 1);
  estado.agora += PARTILHA_MS - 1;
  await porteiro.verificar(['prefs']);
  assert.equal(estado.pedidos, 1, 'ainda dentro da partilha');
  await porteiro.verificar(['prefs'], { fresco: true });
  assert.equal(estado.pedidos, 2);
  estado.agora += PARTILHA_MS;
  await porteiro.verificar(['prefs']);
  assert.equal(estado.pedidos, 3, 'passada a partilha, pergunta outra vez');
});
await caso('sem a migração: muda sempre, e não volta a perguntar nesta sessão', async () => {
  const { porteiro, estado } = montar(() => 'sem-funcao');
  const a = await porteiro.verificar(['mensagens']);
  a.confirmar();
  estado.agora += PARTILHA_MS;
  const b = await porteiro.verificar(['mensagens'], { fresco: true });
  assert.equal(a.mudou && b.mudou, true);
  assert.equal(estado.pedidos, 1);
});
await caso('sem rede (ou um erro), e sem sessão: muda, como antes', async () => {
  const semRede = montar(() => null);
  (await semRede.porteiro.verificar(['mensagens'])).confirmar();
  semRede.estado.agora += PARTILHA_MS;
  assert.equal((await semRede.porteiro.verificar(['mensagens'])).mudou, true);
  const semConta = montar(() => ({}));
  semConta.estado.conta = null;
  assert.equal((await semConta.porteiro.verificar(['mensagens'])).mudou, true);
  assert.equal(semConta.estado.pedidos, 0, 'sem sessão nem pergunta');
});
await caso('outra conta começa do zero, e a confirmação da anterior não lhe toca', async () => {
  const { porteiro, estado } = montar(() => ({ mensagens: 'x' }));
  const daAntiga = await porteiro.verificar(['mensagens']);
  estado.conta = 'outra';
  estado.agora += PARTILHA_MS;
  const daNova = await porteiro.verificar(['mensagens']);
  daAntiga.confirmar();
  estado.agora += PARTILHA_MS;
  assert.equal(daNova.mudou, true);
  assert.equal((await porteiro.verificar(['mensagens'])).mudou, true, 'a confirmação da conta antiga não conta');
});

console.log('\no aparelho nos pedidos');
const REST = 'https://abcdefghijabcdefghij.supabase.co/rest/v1/user_prefs?select=prefs';
const AUTH = 'https://abcdefghijabcdefghij.supabase.co/auth/v1/token';
async function cabecalhoEnviado(url: string, comPonte: boolean): Promise<{ janela: string | null; ponte: string | null }> {
  let janela: string | null = null, ponte: string | null = null;
  const base = (async (_e: RequestInfo | URL, init?: RequestInit) => {
    janela = new Headers(init?.headers).get(CABECALHO_DO_APARELHO);
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  const pelaPonte = comPonte ? async (p: { headers: [string, string][] }) => {
    ponte = new Map(p.headers).get(CABECALHO_DO_APARELHO) ?? null;
    return { status: 200, statusText: 'OK', headers: [] as [string, string][], corpo: '[]' };
  } : undefined;
  await criarFetchDoSupabase(pelaPonte, base)(url, { method: 'GET', headers: { apikey: 'k' } });
  return { janela, ponte };
}
await caso('sem aparelho definido, nada muda', async () => {
  definirAparelhoDosPedidos(null);
  assert.deepEqual(await cabecalhoEnviado(REST, false), { janela: null, ponte: null });
});
await caso('no iPhone vai em cada pedido à API REST, e não na autenticação', async () => {
  definirAparelhoDosPedidos('mf3k2a-abc123def456', false);
  assert.equal((await cabecalhoEnviado(REST, false)).janela, 'mf3k2a-abc123def456');
  assert.equal((await cabecalhoEnviado(AUTH, false)).janela, null);
});
await caso('no PC só pela ponte: pela janela um cabeçalho novo podia esbarrar no CORS', async () => {
  definirAparelhoDosPedidos('mf3k2a-abc123def456', true);
  assert.deepEqual(await cabecalhoEnviado(REST, true), { janela: null, ponte: 'mf3k2a-abc123def456' });
  assert.equal((await cabecalhoEnviado(REST, false)).janela, null, 'sem ponte, pela janela, não vai');
});
await caso('um id esquisito não vai', async () => {
  definirAparelhoDosPedidos('tem espaços e "aspas"', false);
  assert.equal((await cabecalhoEnviado(REST, false)).janela, null);
  definirAparelhoDosPedidos(null);
});

console.log('\na migração');
const sql = ler('supabase/o-que-mudou.sql');
await caso('cada tabela que o regresso relia marca a sua parte', () => {
  for (const [tabela, funcao] of [
    ['shared_items', 'marcar_mudanca_da_mensagem()'], ['item_reactions', 'marcar_mudanca_da_reacao()'],
    ['chat_reads', 'marcar_mudanca_da_leitura()'], ['chat_groups', 'marcar_mudanca_do_grupo()'],
    ['chat_group_members', 'marcar_mudanca_do_membro()'], ['friendships', 'marcar_mudanca_da_amizade()'],
    ['user_track_adjustments', "marcar_mudanca_da_conta('ajustes')"], ['user_eq_presets', "marcar_mudanca_da_conta('presets')"],
    ['user_prefs', "marcar_mudanca_da_conta('prefs')"],
  ]) {
    assert.ok(sql.includes(`after insert or update or delete on public.${tabela}\n  for each row execute function public.${funcao};`), tabela);
  }
});
await caso('uma marca que falha nunca parte a escrita', () => {
  const corpos = sql.split('create or replace function').slice(1).filter((f) => /returns (trigger|void)/.test(f));
  assert.ok(corpos.length >= 8);
  for (const f of corpos) assert.match(f, /exception when others then\n(\s+--[^\n]*\n)?\s+(null|return null);/, f.slice(0, 60));
});
await caso('as marcas só se leem pela função, e a função só com sessão', () => {
  assert.match(sql, /revoke all on table public\.mudancas_da_conta from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.o_que_mudou\(text\) from public, anon;\ngrant execute on function public\.o_que_mudou\(text\) to authenticated;/);
  assert.match(sql, /where user_id = auth\.uid\(\)/);
  assert.match(sql, /\(coalesce\(p_aparelho, ''\) = '' or aparelho <> p_aparelho\)/, 'sem aparelho conta tudo; com ele, só os outros');
  assert.match(sql, /v !~ '\^\[A-Za-z0-9_-\]\{4,64\}\$'/, 'o cabeçalho é validado');
});
await caso('a app sabe da migração (relatório e "This needs a database update")', () => {
  assert.match(ler('src/lib/migracoes.ts'), /\{ ficheiro: 'o-que-mudou\.sql', marca: 'fn:o_que_mudou'/);
});

console.log('\nquem pergunta');
await caso('ajustes, presets e favoritos perguntam antes de reler, e só confirmam o que gravou bem', () => {
  const ajustes = ler('src/state/trackAdjustments.ts');
  assert.match(ajustes, /void verificarMudancas\(\['ajustes'\]\)\.then\(g=>\{/);
  assert.match(ajustes, /useAdjustmentSync\.getState\(\)\.status==='saved'\)g\.confirmar\(\)/);
  const presets = ler('src/state/presets.ts');
  assert.match(presets, /void verificarMudancas\(\['presets'\]\)\.then\(\(g\) => \{/);
  assert.match(presets, /if \(estado === 'pending' \|\| estado === 'error'\) flush\(\); else aoVoltar\(\);/);
  const fav = ler('src/state/artistasFavoritos.ts');
  assert.match(fav, /void verificarMudancas\(\['prefs'\]\)\.then\(\(g\) => \{/);
  assert.match(fav, /if \(jaLigou\) verSeMudou\(\); else refresh\(\);/, 'a primeira ligação do canal lê como antes');
});
await caso('o Social pergunta pelas mensagens e pelas amizades, e o canal a religar pergunta de fresco', () => {
  const s = ler('src/state/social.ts');
  assert.match(s, /verificarMudancas\(\['mensagens', 'amizades'\], \{ fresco \}\)/);
  assert.match(s, /if \(jaLigouOCanal && appEstaVisivel\(\)\) \{ void lerSeMudou\(true, comoAntes\); return; \}/);
  assert.match(s, /if \(gen === generation && !useSocial\.getState\(\)\.inboxError\) g\.confirmar\(\);/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

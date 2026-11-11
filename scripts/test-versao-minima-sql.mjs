// supabase/versao-minima.sql num Postgres a sério (PGlite) (12/11): o
// "pre-request" do PostgREST recusa as versões da app que não mandam o
// cabeçalho `x-duotone-versao` (até à 5.8.6) e as abaixo da mínima, com 426.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = readFileSync(new URL('../supabase/versao-minima.sql', import.meta.url), 'utf8');

await db.exec(`create role anon; create role authenticated; create role service_role; create role authenticator;`);

// A migração, duas vezes (tem de se poder correr outra vez).
await db.exec(sql);
await db.exec(sql);
console.log('migração corrida duas vezes: ok');

/** Um pedido como o PostgREST o prepara: os cabeçalhos e o papel do JWT. */
async function pedido({ versao, papel = 'authenticated', conta, aparelho } = {}) {
  const cabecalhos = {
    ...(versao === undefined ? {} : { 'x-duotone-versao': versao }),
    ...(aparelho === undefined ? {} : { 'x-duotone-aparelho': aparelho }),
  };
  await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(cabecalhos)]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: papel, ...(conta ? { sub: conta } : {}) })]);
  await db.exec(`set role ${papel}`);
  try {
    await db.query('select public.recusar_versoes_antigas()');
    return null;
  } catch (e) {
    return e;
  } finally {
    await db.exec('reset role');
  }
}

const recusado = (e, como) => {
  assert.ok(e, `${como}: devia ser recusado`);
  assert.equal(e.code, 'PGRST', `${como}: o PostgREST usa o código PGRST para o estado HTTP`);
  assert.equal(JSON.parse(e.detail).status, 426, `${como}: 426 Upgrade Required`);
  assert.match(JSON.parse(e.message).message, /no longer supported\. Update the app/, `${como}: a mensagem`);
};

recusado(await pedido(), 'sem o cabeçalho (a 5.8.6 e anteriores)');
recusado(await pedido({ papel: 'anon' }), 'sem sessão e sem cabeçalho');
recusado(await pedido({ versao: '5.8.6' }), 'abaixo da mínima');
recusado(await pedido({ versao: 'lixo' }), 'um cabeçalho que não é uma versão');
recusado(await pedido({ versao: '' }), 'um cabeçalho vazio');
recusado(await pedido({ versao: '5.8.8' }), 'a mínima de antes (11/11)');
recusado(await pedido({ versao: '5.9.2' }), 'a última antes da mínima');
assert.equal(await pedido({ versao: '5.9.3' }), null, 'a mínima passa');
assert.equal(await pedido({ versao: '5.9.10' }), null, 'acima passa (compara números)');
assert.equal(await pedido({ versao: '5.10.0' }), null, 'compara números, não texto');
assert.equal(await pedido({ versao: '6.0.0' }), null);
assert.equal(await pedido({ papel: 'service_role' }), null, 'o painel e o servidor passam sempre');
console.log('quem passa e quem não passa: ok');

// O PostgREST é que a chama: fica no papel `authenticator`.
const r = await db.query(`
  select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator'`);
assert.ok(r.rows.some((l) => l.setconfig.includes('pgrst.db_pre_request=public.recusar_versoes_antigas')),
  'o authenticator chama a função antes de cada pedido');
console.log('ligada ao PostgREST: ok');

const texto = sql.replace(/\r\n/g, '\n');
assert.match(texto, /alter role authenticator reset pgrst\.db_pre_request;/, 'diz como se desliga');

// Banir (11/11, supabase/banir.sql): a conta, as sessões e os aparelhos dela.
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key, banned_until timestamptz);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
  create table public.profiles (id uuid primary key, username text);
  create table public.player_sessions (user_id uuid, device_id text);
  create table public.social_presence_sessions (user_id uuid, device_id text);
  insert into auth.users values ('${A}', null), ('${B}', null);
  insert into auth.sessions (user_id) values ('${A}'), ('${A}'), ('${B}');
  insert into public.profiles values ('${A}', 'Banido1'), ('${B}', 'outro');
  insert into public.player_sessions values ('${A}', 'iphone-de-a'), ('${B}', 'pc-de-b');
  insert into public.social_presence_sessions values ('${A}', 'pc-de-a'), ('${A}', 'iphone-de-a');
`);
// Os nomes só se escrevem no SQL Editor (o repositório é público): o teste troca o exemplo.
const banir = readFileSync(new URL('../supabase/banir.sql', import.meta.url), 'utf8')
  .replace("values ('nome_de_utilizador')", "values ('banido1')");
assert.match(readFileSync(new URL('../supabase/banir.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
  /with nomes\(nome\) as \(\n\s+values \('nome_de_utilizador'\)\n\)/, 'no repositório, só o exemplo: os nomes escrevem-se no SQL Editor');
await db.exec(banir);
await db.exec(banir);
const banidos = (await db.query(`select tipo, valor from public.banidos order by tipo, valor`)).rows.map((l) => `${l.tipo}:${l.valor}`);
assert.deepEqual(banidos, [`aparelho:iphone-de-a`, `aparelho:pc-de-a`, `conta:${A}`], 'a conta pelo nome (sem maiúsculas) e os aparelhos dela, uma vez');
assert.equal((await db.query(`select banned_until = 'infinity'::timestamptz as banida from auth.users where id = '${A}'`)).rows[0].banida, true, 'banida no login');
assert.equal((await db.query(`select banned_until from auth.users where id = '${B}'`)).rows[0].banned_until, null);
assert.equal(Number((await db.query(`select count(*) as n from auth.sessions where user_id = '${A}'`)).rows[0].n), 0, 'as sessões dela fecham-se');
assert.equal(Number((await db.query(`select count(*) as n from auth.sessions where user_id = '${B}'`)).rows[0].n), 1);

const banido = (e, como) => {
  assert.ok(e, `${como}: devia ser recusado`);
  assert.equal(JSON.parse(e.detail).status, 403, `${como}: 403`);
  assert.match(JSON.parse(e.message).message, /can no longer use Duotone/, `${como}: a mensagem`);
};
banido(await pedido({ versao: '5.9.3', conta: A }), 'a conta banida, mesmo numa versão nova');
banido(await pedido({ versao: '5.9.3', conta: B, aparelho: 'iphone-de-a' }), 'uma conta nova no aparelho de quem foi banido');
assert.equal(await pedido({ versao: '5.9.3', conta: B, aparelho: 'pc-de-b' }), null, 'os outros passam');
assert.equal(await pedido({ papel: 'service_role', conta: A }), null, 'o painel passa sempre');
assert.equal((await db.query(`select has_table_privilege('authenticated', 'public.banidos', 'select') as pode`)).rows[0].pode, false,
  'ninguém lê a lista de fora do painel');
console.log('banir: a conta, as sessões e os aparelhos: ok');

console.log('\nVersão mínima no Supabase: as antigas recebem 426, as novas e o servidor passam; as banidas, 403.');

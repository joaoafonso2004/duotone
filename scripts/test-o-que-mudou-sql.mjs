// supabase/o-que-mudou.sql num Postgres a sério (PGlite), com as tabelas mínimas (11/11).
// As marcas: quem as vê, de que aparelho, e que nunca partem uma escrita.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = readFileSync(new URL('../supabase/o-que-mudou.sql', import.meta.url), 'utf8');

await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key);
create table public.chat_groups (id uuid primary key default gen_random_uuid(), name text, created_by uuid not null references public.profiles(id), created_at timestamptz default now());
create table public.chat_group_members (group_id uuid references public.chat_groups(id) on delete cascade, user_id uuid references public.profiles(id), joined_at timestamptz default now(), primary key (group_id, user_id));
create table public.shared_items (id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id), recipient_id uuid references public.profiles(id), group_id uuid references public.chat_groups(id) on delete cascade, item_type text default 'track', message text, archived_at timestamptz, created_at timestamptz default now());
create table public.item_reactions (item_id uuid references public.shared_items(id) on delete cascade, user_id uuid references public.profiles(id), emoji text, primary key (item_id, user_id));
create table public.chat_reads (user_id uuid references public.profiles(id), conversation text, last_read_at timestamptz, primary key (user_id, conversation));
create table public.friendships (user_id_1 uuid references public.profiles(id), user_id_2 uuid references public.profiles(id), status text, primary key (user_id_1, user_id_2));
create table public.user_track_adjustments (user_id uuid references public.profiles(id), source text, source_id text, rate real, seen_at timestamptz, primary key (user_id, source, source_id));
create table public.user_eq_presets (user_id uuid references public.profiles(id), preset_id text, data jsonb, seen_at timestamptz, primary key (user_id, preset_id));
create table public.user_prefs (user_id uuid primary key references public.profiles(id), prefs jsonb default '{}', updated_at timestamptz default now());
`);

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into public.profiles values ('${A}'), ('${B}'), ('${C}');`);

// A migração, duas vezes (tem de se poder correr outra vez).
await db.exec(sql);
await db.exec(sql);
console.log('migração corrida duas vezes: ok');

const comoAparelho = async (aparelho, sub) => {
  await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(aparelho ? { 'x-duotone-aparelho': aparelho } : {})]);
  await db.exec(`select set_config('request.jwt.claim.sub', '${sub ?? ''}', false);`);
};
const mudou = async (conta, aparelho) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${conta}', false);`);
  await db.exec('set role authenticated');
  const r = await db.query(`select public.o_que_mudou($1) as r`, [aparelho]);
  await db.exec('reset role');
  return Object.keys(r.rows[0].r.marcas).sort();
};

// 1. A manda uma mensagem a B, do aparelho "iphone-de-a".
await comoAparelho('iphone-de-a', A);
await db.exec(`insert into public.shared_items (sender_id, recipient_id, message) values ('${A}', '${B}', 'olá');`);
assert.deepEqual(await mudou(B, 'pc-de-b'), ['mensagens'], 'B vê que há mensagens novas');
assert.deepEqual(await mudou(A, 'iphone-de-a'), [], 'o aparelho que escreveu não relê o que ele mesmo mudou');
assert.deepEqual(await mudou(A, 'pc-de-a'), ['mensagens'], 'o outro aparelho de A vê');
assert.deepEqual(await mudou(A, ''), ['mensagens'], 'sem aparelho conta tudo');
assert.deepEqual(await mudou(C, 'x-de-c'), [], 'C não tem nada a ver com isto');
console.log('mensagem direta: ok');

// 2. Mensagem de grupo: todos os membros.
await comoAparelho('pc-de-b', B);
const g = (await db.query(`insert into public.chat_groups (name, created_by) values ('g', '${B}') returning id`)).rows[0].id;
await db.exec(`insert into public.chat_group_members (group_id, user_id) values ('${g}', '${B}'), ('${g}', '${C}');`);
await comoAparelho('pc-de-b', B);
// Ao microssegundo e em texto de largura fixa: em Date (milissegundos), duas
// marcas seguidas numa máquina carregada saíam iguais e o teste falhava (11/11).
const marcaDeC = async () => (await db.query(`select to_char(mudou_em, 'YYYYMMDDHH24MISSUS') as m from public.mudancas_da_conta where user_id = '${C}' and dominio = 'mensagens'`)).rows[0]?.m;
const antes = await marcaDeC();
await db.exec(`insert into public.shared_items (sender_id, group_id, message) values ('${B}', '${g}', 'grupo');`);
const depois = await marcaDeC();
assert.ok(!antes || depois > antes, 'C (membro) ficou marcado');
assert.deepEqual(await mudou(C, 'iphone-de-c'), ['mensagens']);
console.log('grupo: ok');

// 3. Reação, leitura, arquivar, apagar.
await comoAparelho('pc-de-a', A);
const item = (await db.query(`select id from public.shared_items where recipient_id = '${B}' limit 1`)).rows[0].id;
await db.exec(`insert into public.item_reactions values ('${item}', '${A}', '🔥');`);
await db.exec(`insert into public.chat_reads values ('${A}', 'ana', now()) on conflict (user_id, conversation) do update set last_read_at = excluded.last_read_at;`);
await db.exec(`update public.shared_items set archived_at = now() where id = '${item}';`);
await db.exec(`delete from public.shared_items where id = '${item}';`);
console.log('reação, leitura, arquivar e apagar (com a reação em cascata): ok');

// 4. Amizades e as tabelas de uma conta.
await comoAparelho('pc-de-a', A);
await db.exec(`insert into public.friendships values ('${A}', '${B}', 'pending');`);
await db.exec(`insert into public.user_track_adjustments values ('${A}', 'youtube', 'x', 1.1, now());`);
await db.exec(`insert into public.user_eq_presets values ('${A}', 'p1', '{}', now());`);
await db.exec(`insert into public.user_prefs (user_id) values ('${A}');`);
assert.deepEqual(await mudou(B, 'pc-de-b'), ['amizades', 'mensagens']);
assert.deepEqual(await mudou(A, 'iphone-de-a'), ['ajustes', 'amizades', 'mensagens', 'prefs', 'presets']);
assert.deepEqual(await mudou(A, 'pc-de-a'), ['mensagens'], 'do pc-de-a só o que o iphone-de-a mudou');
console.log('amizades, ajustes, presets, preferências: ok');

// 5. Um cabeçalho com lixo conta como sem aparelho.
await comoAparelho(`lixo'; drop table x; --`, A);
await db.exec(`update public.user_prefs set prefs = '{"a":1}' where user_id = '${A}';`);
const lixo = await db.query(`select aparelho from public.mudancas_da_conta where user_id = '${A}' and dominio = 'prefs' order by mudou_em desc limit 1`);
assert.equal(lixo.rows[0].aparelho, '');
console.log('cabeçalho inválido: ok');

// 6. Uma marca que falha nunca parte a escrita.
await db.exec(`alter table public.mudancas_da_conta rename to mudancas_escondidas;`);
await comoAparelho('pc-de-a', A);
await db.exec(`insert into public.shared_items (sender_id, recipient_id, message) values ('${A}', '${B}', 'sem marcas');`);
await db.exec(`update public.user_prefs set prefs = '{"b":2}' where user_id = '${A}';`);
const n = (await db.query(`select count(*)::int as n from public.shared_items where message = 'sem marcas'`)).rows[0].n;
assert.equal(n, 1, 'a mensagem entrou mesmo com as marcas partidas');
await db.exec(`alter table public.mudancas_escondidas rename to mudancas_da_conta;`);
console.log('marca partida não parte a escrita: ok');

// 7. Permissões: o anon não chama a função, o authenticated sim; a tabela fechada.
const priv = await db.query(`select
  has_function_privilege('anon', 'public.o_que_mudou(text)', 'execute') as anon_fn,
  has_function_privilege('authenticated', 'public.o_que_mudou(text)', 'execute') as auth_fn,
  has_table_privilege('authenticated', 'public.mudancas_da_conta', 'select') as auth_tab,
  has_function_privilege('authenticated', 'public.marcar_mudanca(uuid[], text)', 'execute') as auth_marcar`);
assert.deepEqual(priv.rows[0], { anon_fn: false, auth_fn: true, auth_tab: false, auth_marcar: false });
console.log('permissões: ok');

console.log('O que mudou (SQL): as marcas por conta e por aparelho, sem partir escritas.');

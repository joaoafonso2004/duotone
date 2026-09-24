/**
 * supabase/escritas-atomicas.sql numa base a sério (PGlite), com a RLS ligada.
 *
 * O que se prende: o grupo e os membros entram juntos ou não entra nada; a
 * função não deixa criar um grupo em nome de outra pessoa; e o ajuste de uma
 * faixa segue a regra que os dois pedidos seguiam (não substitui uma edição
 * mais recente), sem tocar nos ajustes de outra conta.
 *
 * Correr: node scripts/test-escritas-atomicas-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${n ? uid(n) : ''}',false);`);
const admin = () => db.exec('reset role;');
const q = (sql, args = []) => db.query(sql, args);

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
`);
for (const f of ['schema.sql', 'listening-stats.sql', 'funcoes-existentes.sql', 'social-setup.sql', 'group-chats.sql', 'track-adjustments.sql']) {
  await db.exec(ler(f).replace('create extension if not exists "pgcrypto";', ''));
}
await db.exec('grant all on all tables in schema public to authenticated;');
// Duas vezes: tem de se poder voltar a correr.
await db.exec(ler('escritas-atomicas.sql'));
await db.exec(ler('escritas-atomicas.sql'));
await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'um@x.test','{}'),($2,'dois@x.test','{}'),($3,'tres@x.test','{}')`, [uid(1), uid(2), uid(3)]);
await q(`insert into public.profiles (id) values ($1),($2),($3) on conflict do nothing`, [uid(1), uid(2), uid(3)]);

console.log('\ncriar_grupo');
await caso('cria o grupo com quem cria e os membros, sem repetidos', async () => {
  await como(1);
  const { rows } = await q(`select public.criar_grupo('  Amigos  ', $1::uuid[]) as id`, [[uid(2), uid(3), uid(2), uid(1)]]);
  const id = rows[0].id;
  await admin();
  const g = await q('select name, created_by from public.chat_groups where id = $1', [id]);
  assert.deepEqual(g.rows[0], { name: 'Amigos', created_by: uid(1) });
  const m = await q('select user_id from public.chat_group_members where group_id = $1 order by user_id', [id]);
  assert.deepEqual(m.rows.map((r) => r.user_id), [uid(1), uid(2), uid(3)]);
});
await caso('um membro que não existe desfaz tudo: não fica grupo vazio', async () => {
  await admin();
  const antes = (await q('select count(*)::int as n from public.chat_groups')).rows[0].n;
  await como(1);
  await assert.rejects(q(`select public.criar_grupo('Falha', $1::uuid[])`, [[uid(99)]]));
  await admin();
  assert.equal((await q('select count(*)::int as n from public.chat_groups')).rows[0].n, antes);
});
await caso('um nome vazio falha e não deixa nada', async () => {
  await admin();
  const antes = (await q('select count(*)::int as n from public.chat_groups')).rows[0].n;
  await como(1);
  await assert.rejects(q(`select public.criar_grupo('   ', '{}'::uuid[])`));
  await admin();
  assert.equal((await q('select count(*)::int as n from public.chat_groups')).rows[0].n, antes);
});
await caso('sem sessão não cria nada', async () => {
  await como(null);
  await assert.rejects(q(`select public.criar_grupo('Anónimo', '{}'::uuid[])`), /Not signed in/);
});

console.log('\nguardar_ajuste_da_faixa');
const ajuste = (rate, em) => q(`select public.guardar_ajuste_da_faixa('youtube','abc',$1,null,$2)`, [rate, em]);
const rateDe = async (n) => { await admin(); return (await q(`select rate from public.user_track_adjustments where user_id=$1 and source_id='abc'`, [uid(n)])).rows[0]?.rate; };
await caso('insere quando não há', async () => {
  await como(1); await ajuste(0.75, '2026-09-24T10:00:00Z');
  assert.equal(await rateDe(1), 0.75);
});
await caso('uma edição mais recente substitui', async () => {
  await como(1); await ajuste(1.25, '2026-09-24T12:00:00Z');
  assert.equal(await rateDe(1), 1.25);
});
await caso('um envio atrasado (mais antigo) não volta atrás', async () => {
  await como(1); await ajuste(0.5, '2026-09-24T11:00:00Z');
  assert.equal(await rateDe(1), 1.25);
});
await caso('cada conta escreve só a sua linha', async () => {
  await como(2); await ajuste(0.9, '2026-09-24T09:00:00Z');
  assert.equal(await rateDe(2), 0.9);
  assert.equal(await rateDe(1), 1.25);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) a falhar.\n`); process.exit(1); }
console.log('\n  Escritas atómicas: grupo em transação e ajuste num só comando passaram.\n');

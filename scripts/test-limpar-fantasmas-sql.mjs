/**
 * O SQL que apaga os aparelhos fantasma, ensaiado numa base de dados a sério
 * (PGlite): supabase/limpar-aparelhos-fantasma.sql.
 *
 * O que se prende aqui é o que distingue "apagar os fantasmas" de "apagar
 * aparelhos": fica UMA linha por conta e por tipo+nome, e é a mais recente;
 * nomes diferentes sobrevivem; e a conta de outra pessoa não é tocada -- o
 * DELETE não leva `user_id` nenhum, é o `exists` que o prende.
 *
 * Correr: node scripts/test-limpar-fantasmas-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args);

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
`);
await db.exec(ler('schema.sql').replace('create extension if not exists "pgcrypto";', ''));
await db.exec('grant all on all tables in schema public to authenticated;');
await db.exec(ler('player-sessions.sql'));

// Duas contas. A primeira é o caso real: um PC, e o mesmo iPhone instalado
// oito vezes. A segunda existe só para provar que não lhe tocam.
await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'um@x.test','{}'),($2,'dois@x.test','{}')`, [uid(1), uid(2)]);
const linha = (u, id, kind, nome, horas) => q(
  `insert into public.player_sessions (user_id, device_id, device_name, device_kind, track, queue, queue_index, position_ms, is_playing, updated_at)
   values ($1, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, 0, 0, false, now() - ($5 || ' hours')::interval)`,
  [uid(u), id, nome, kind, String(horas)],
);

await linha(1, 'pc', 'desktop', 'PC', 0.1);
for (let i = 1; i <= 8; i++) await linha(1, `iphone-${i}`, 'ios', 'iPhone', i);
await linha(2, 'iphone-da-outra', 'ios', 'iPhone', 3);
await linha(2, 'iphone-da-outra-2', 'ios', 'iPhone', 9);

// O ficheiro tem três passos (ver, apagar, conferir); interessa o DELETE.
const sql = ler('limpar-aparelhos-fantasma.sql');
const apagar = sql.slice(sql.indexOf('delete from public.player_sessions'));
const delete_ = apagar.slice(0, apagar.indexOf(';') + 1);

await caso('antes: nove linhas do João, duas da outra conta', async () => {
  const n = await q(`select count(*)::int as n from public.player_sessions where user_id = $1`, [uid(1)]);
  assert.equal(n.rows[0].n, 9);
});

await db.exec(delete_);

await caso('fica UMA linha por tipo+nome, e é a mais recente', async () => {
  const r = await q(
    `select device_id, device_kind from public.player_sessions where user_id = $1 order by device_kind`,
    [uid(1)],
  );
  assert.equal(r.rows.length, 2, 'o PC e um iPhone');
  assert.deepEqual(r.rows.map((x) => x.device_id).sort(), ['iphone-1', 'pc']);
});

await caso('a conta de outra pessoa fica com a dela, e só com a mais recente', async () => {
  const r = await q(`select device_id from public.player_sessions where user_id = $1`, [uid(2)]);
  assert.deepEqual(r.rows.map((x) => x.device_id), ['iphone-da-outra']);
});

await caso('correr outra vez não apaga mais nada', async () => {
  const antes = await q('select count(*)::int as n from public.player_sessions');
  await db.exec(delete_);
  const depois = await q('select count(*)::int as n from public.player_sessions');
  assert.equal(depois.rows[0].n, antes.rows[0].n);
});

await caso('nomes diferentes não se colapsam', async () => {
  await linha(1, 'portatil', 'desktop', 'Portátil', 2);
  await db.exec(delete_);
  const r = await q(
    `select device_id from public.player_sessions where user_id = $1 and device_kind = 'desktop' order by device_id`,
    [uid(1)],
  );
  assert.deepEqual(r.rows.map((x) => x.device_id), ['pc', 'portatil']);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\nLimpar os fantasmas: fica um aparelho por nome, e só o dono é tocado.\n');

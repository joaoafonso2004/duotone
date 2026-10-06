/**
 * O Radio no Jam (supabase/radio-no-jam.sql, 6/10), ensaiado numa base de
 * dados a sério (PGlite) com o ouvir-juntos.sql por baixo, como no Supabase.
 *
 * Correr: node scripts/test-radio-no-jam-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args);
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const admin = () => db.exec('reset role;');

let falhas = 0;
async function caso(nome, fn) {
  try { await admin(); await fn(); console.log(`  ok - ${nome}`); }
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
await db.exec(ler('social-setup.sql'));
await db.exec(ler('ouvir-juntos.sql'));
await db.exec(ler('radio-no-jam.sql'));
await db.exec(ler('radio-no-jam.sql')); // correr duas vezes não parte nada
await db.exec('grant all on all tables in schema public to authenticated;');

for (let n = 1; n <= 3; n++) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid(n), `${n}@x.test`]);
}
for (const [a, b] of [[1, 2], [1, 3]]) {
  await q(`insert into public.friendships (user_id_1, user_id_2, status) values ($1, $2, 'accepted')`, [uid(a), uid(b)]);
}

const abrir = async (n) => { await como(n); return (await q(`select public.criar_sessao_de_escuta(null) as id`)).rows[0].id; };
const entrar = async (n, s) => { await como(n); await q(`select public.entrar_na_sessao($1)`, [s]); };
const radio = async (s) => { await admin(); return (await q(`select radio from public.listening_sessions where id = $1`, [s])).rows[0].radio; };
const ligar = async (n, s, v) => { await como(n); await q(`select public.definir_radio_do_jam($1, $2)`, [s, v]); };
const recusa = async (fn, padrao) => {
  let erro = null;
  try { await fn(); } catch (e) { erro = e; }
  assert.ok(erro, 'devia ter sido recusado');
  assert.match(erro.message, padrao);
};

await caso('uma sessão nova começa com o Radio desligado', async () => {
  const s = await abrir(1);
  assert.equal(await radio(s), false);
});

await caso('o anfitrião liga e desliga o Radio da sala', async () => {
  const s = await abrir(1);
  await ligar(1, s, true);
  assert.equal(await radio(s), true);
  await ligar(1, s, false);
  assert.equal(await radio(s), false);
});

await caso('um convidado sem controlo não mexe no Radio', async () => {
  const s = await abrir(1);
  await entrar(2, s);
  await recusa(() => ligar(2, s, true), /anfitrião controla/);
  assert.equal(await radio(s), false);
});

await caso('com os convidados a controlar, um convidado liga-o', async () => {
  const s = await abrir(1);
  await entrar(2, s);
  await como(1);
  await q(`select public.permitir_controlo_aos_convidados($1, true)`, [s]);
  await ligar(2, s, true);
  assert.equal(await radio(s), true);
});

await caso('quem não está na sessão não mexe nela, mesmo com controlo dos convidados', async () => {
  const s = await abrir(1);
  await como(1);
  await q(`select public.permitir_controlo_aos_convidados($1, true)`, [s]);
  await recusa(() => ligar(3, s, true), /Não estás nesta sessão/);
  assert.equal(await radio(s), false);
});

await caso('uma sessão acabada não liga o Radio', async () => {
  const s = await abrir(1);
  await admin();
  await q(`update public.listening_sessions set ended_at = clock_timestamp() where id = $1`, [s]);
  await recusa(() => ligar(1, s, true), /já acabou/);
});

await caso('anónimos não chamam a função', async () => {
  const s = await abrir(1);
  await db.exec(`reset role; set role anon;`);
  await recusa(() => q(`select public.definir_radio_do_jam($1, true)`, [s]), /permission denied/);
});

if (falhas) { console.error(`Radio no Jam (SQL): ${falhas} falharam.`); process.exitCode = 1; }
else console.log('Radio no Jam (SQL): passou.');

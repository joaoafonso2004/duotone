/**
 * O anfitrião sai e a Jam continua (supabase/jam-passa-o-anfitriao.sql, 28/9),
 * ensaiado numa base de dados a sério (PGlite) com o ouvir-juntos.sql e o
 * passa-o-aux.sql por baixo, como no Supabase.
 *
 * Correr: node scripts/test-jam-passa-o-anfitriao-sql.mjs
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
await db.exec(ler('passa-o-aux.sql'));
await db.exec(ler('jam-passa-o-anfitriao.sql'));
await db.exec(ler('jam-passa-o-anfitriao.sql')); // correr duas vezes não parte nada
await db.exec('grant all on all tables in schema public to authenticated;');

// Quatro contas, todas amigas da 1 (a primeira anfitriã).
for (let n = 1; n <= 4; n++) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid(n), `${n}@x.test`]);
}
// O perfil nasce do gatilho do auth.users (schema.sql).
for (const [a, b] of [[1, 2], [1, 3], [1, 4], [2, 3]]) {
  await q(`insert into public.friendships (user_id_1, user_id_2, status) values ($1, $2, 'accepted')`, [uid(a), uid(b)]);
}

const abrir = async (n) => { await como(n); return (await q(`select public.criar_sessao_de_escuta(null) as id`)).rows[0].id; };
const entrar = async (n, s) => { await como(n); await q(`select public.entrar_na_sessao($1)`, [s]); };
const sair = async (n, s) => { await como(n); await q(`select public.sair_da_sessao($1)`, [s]); };
const sessao = async (s) => { await admin(); return (await q(`select host_id, ended_at, aux_de from public.listening_sessions where id = $1`, [s])).rows[0]; };
const visto = async (n, s, minutos) => { await admin(); await q(`update public.listening_members set last_seen = clock_timestamp() - ($3 || ' minutes')::interval where session_id = $1 and user_id = $2`, [s, uid(n), String(minutos)]); };

await caso('o anfitrião sai e a Jam fica com quem deu sinal há menos tempo', async () => {
  const s = await abrir(1);
  await entrar(2, s); await entrar(3, s);
  await visto(2, s, 5); await visto(3, s, 1);
  await sair(1, s);
  const depois = await sessao(s);
  assert.equal(depois.ended_at, null, 'a Jam continua');
  assert.equal(depois.host_id, uid(3), 'o 3 bateu há 1 min, o 2 há 5');
  const membros = (await q(`select user_id from public.listening_members where session_id = $1 order by user_id`, [s])).rows;
  assert.deepEqual(membros.map((m) => m.user_id), [uid(2), uid(3)], 'quem saiu saiu');
});

await caso('o novo anfitrião manda: pode sair ele, e a Jam passa outra vez', async () => {
  const s = await abrir(1);
  await entrar(2, s); await entrar(3, s);
  await visto(2, s, 1); await visto(3, s, 2);
  await sair(1, s);
  assert.equal((await sessao(s)).host_id, uid(2));
  await como(2);
  await q(`select public.permitir_controlo_aos_convidados($1, true)`, [s]); // só o anfitrião pode
  await sair(2, s);
  assert.equal((await sessao(s)).host_id, uid(3));
});

await caso('sem ninguém, a Jam acaba', async () => {
  const s = await abrir(1);
  await sair(1, s);
  assert.notEqual((await sessao(s)).ended_at, null);
});

await caso('só com fantasmas (sem sinal há mais de 30 min), a Jam acaba em vez de passar', async () => {
  const s = await abrir(1);
  await entrar(2, s);
  await visto(2, s, 45);
  await sair(1, s);
  const depois = await sessao(s);
  assert.notEqual(depois.ended_at, null);
  assert.equal(depois.host_id, uid(1), 'não se passa a quem não está');
});

await caso('um convidado a sair não mexe no anfitrião', async () => {
  const s = await abrir(1);
  await entrar(2, s);
  await sair(2, s);
  const depois = await sessao(s);
  assert.equal(depois.host_id, uid(1));
  assert.equal(depois.ended_at, null);
});

await caso('a vez de escolher de quem sai passa à roda', async () => {
  const s = await abrir(1);
  await entrar(2, s); await entrar(3, s);
  await como(1);
  await q(`select public.definir_aux($1, true)`, [s]);
  assert.equal((await sessao(s)).aux_de, uid(1));
  await sair(1, s);
  const depois = await sessao(s);
  assert.ok([uid(2), uid(3)].includes(depois.aux_de), 'o aux não fica preso em quem saiu');
});

await caso('abrir uma Jam nova passa a antiga a quem lá estava, em vez de a fechar', async () => {
  const velha = await abrir(1);
  await entrar(2, velha);
  const nova = await abrir(1);
  assert.notEqual(nova, velha);
  const v = await sessao(velha);
  assert.equal(v.ended_at, null);
  assert.equal(v.host_id, uid(2));
  await admin();
  const ainda = (await q(`select 1 from public.listening_members where session_id = $1 and user_id = $2`, [velha, uid(1)])).rows;
  assert.equal(ainda.length, 0, 'o anfitrião antigo saiu da velha');
});

await caso('ninguém chama a função interna para ficar com a Jam de outro', async () => {
  const s = await abrir(1);
  await entrar(2, s);
  await como(2);
  await assert.rejects(q(`select public.passar_ou_fechar_sessao($1, $2)`, [s, uid(1)]), /permission denied/);
  assert.equal((await sessao(s)).host_id, uid(1));
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('Jam: o anfitrião sai e a Jam continua -- passou.');

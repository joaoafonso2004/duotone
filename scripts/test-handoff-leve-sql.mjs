/**
 * Ensaio em PGlite de supabase/handoff-leve.sql: cada escrita numa sessão
 * deixa um aviso pequeno, a leitura leve dá o mesmo resumo da fila que o
 * `resumoDaFila` do cliente, a `player_sessions` sai do Realtime e apagar a
 * conta não parte no gatilho.
 *
 * Correr: node scripts/test-handoff-leve-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const U = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key);
  insert into public.profiles values ('${U}'), ('${V}');
  create publication supabase_realtime;
`);
await db.exec(ler('player-sessions.sql'));
await db.exec(ler('handoff-ao-vivo.sql'));
const publicadas = async () => (await db.query(
  `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`,
)).rows.map((r) => r.tablename);
assert.deepEqual(await publicadas(), ['player_sessions'], 'antes: a tabela com as filas está no Realtime');

await db.exec(ler('handoff-leve.sql'));
await db.exec(ler('handoff-leve.sql')); // idempotente
assert.deepEqual(await publicadas(), ['player_sessions_avisos'], 'depois: só os avisos');

const faixa = (id) => ({ source: 'youtube', sourceId: id, title: id });
const escrever = (uid, aparelho, fila, indice) => db.query(
  `insert into public.player_sessions (user_id, device_id, track, queue, queue_index, position_ms, is_playing)
   values ($1, $2, $3::jsonb, $4::jsonb, $5, 1000, true)
   on conflict (user_id, device_id) do update set queue = excluded.queue, queue_index = excluded.queue_index`,
  [uid, aparelho, JSON.stringify(faixa('atual')), JSON.stringify(fila), indice],
);
const avisos = async () => (await db.query(
  `select user_id, device_id, mudou_em from public.player_sessions_avisos order by user_id, device_id`,
)).rows;

const fila = ['a', 'b', 'c', 'd'].map(faixa);
await escrever(U, 'iphone', fila, 1);
await escrever(U, 'pc', fila, 0);
await escrever(V, 'iphone', fila, 0);
assert.equal((await avisos()).length, 3, 'cada aparelho tem o seu aviso');

const antes = (await avisos()).find((a) => a.device_id === 'iphone' && a.user_id === U).mudou_em.getTime();
await new Promise((r) => setTimeout(r, 15));
await escrever(U, 'iphone', fila, 2);
const depois = (await avisos()).find((a) => a.device_id === 'iphone' && a.user_id === U).mudou_em.getTime();
assert.ok(depois > antes, 'uma escrita nova volta a avisar');
assert.equal((await avisos()).length, 3, 'e não cria linhas novas');

// A leitura leve, vista pelo PC do utilizador U.
await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
const leves = (await db.query(`select * from public.sessoes_dos_outros_dispositivos_leves('pc')`)).rows;
assert.equal(leves.length, 1, 'só as dos OUTROS aparelhos, e só as da própria conta');
assert.equal(leves[0].device_id, 'iphone');
assert.equal('queue' in leves[0], false, 'a fila não viaja');
assert.equal(leves[0].proxima.sourceId, 'd', 'a seguinte à atual (índice 2)');
assert.equal(leves[0].depois, 0, 'e depois dela não há mais');

// O mesmo resumo que o `resumoDaFila` do cliente, nos casos da borda.
const resumo = async (fila, indice) => {
  await escrever(U, 'iphone', fila, indice);
  const [r] = (await db.query(`select proxima, depois from public.sessoes_dos_outros_dispositivos_leves('pc')`)).rows;
  return { proxima: r.proxima?.sourceId ?? null, depois: r.depois };
};
assert.deepEqual(await resumo(fila, 0), { proxima: 'b', depois: 2 });
assert.deepEqual(await resumo(fila, 3), { proxima: null, depois: 0 }, 'a última da fila');
assert.deepEqual(await resumo(fila, 9), { proxima: null, depois: 0 }, 'um índice fora da fila');
assert.deepEqual(await resumo([], 0), { proxima: null, depois: 0 }, 'fila vazia');

// Apagar a sessão avisa, e apagar a CONTA não parte no gatilho.
await db.exec(`reset all`);
await new Promise((r) => setTimeout(r, 15));
await db.query(`delete from public.player_sessions where user_id = $1 and device_id = 'iphone'`, [U]);
const apagada = (await avisos()).find((a) => a.device_id === 'iphone' && a.user_id === U).mudou_em.getTime();
assert.ok(apagada > depois, 'apagar uma sessão também avisa');
await db.query(`delete from public.profiles where id = $1`, [V]);
assert.equal((await avisos()).filter((a) => a.user_id === V).length, 0, 'a conta apagada leva os avisos');
assert.equal((await db.query(`select count(*)::int as n from public.player_sessions where user_id = $1`, [V])).rows[0].n, 0);

console.log('Handoff leve (SQL): passou.');

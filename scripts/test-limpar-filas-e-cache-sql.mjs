/**
 * A limpeza da noite (supabase/limpar-filas-e-cache.sql), ensaiada numa base de
 * dados a sério (PGlite), com as colunas que ela usa das três tabelas.
 *
 * O que se prende aqui:
 * - sai a fila das Jams acabadas há mais de 7 dias, e só essa: a de uma Jam
 *   viva e a de uma acabada ontem ficam, e a SESSÃO acabada fica sempre (o
 *   convite no chat aponta para ela);
 * - o yt_cache sai pela validade de cada tipo, e o que é da conta não se toca;
 * - o `_` do LIKE está escapado: uma chave parecida não é apanhada;
 * - correr duas vezes não apaga mais nada.
 *
 * Correr: node scripts/test-limpar-filas-e-cache-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/limpar-filas-e-cache.sql', import.meta.url), 'utf8');
const db = new PGlite();
const q = (texto, args = []) => db.query(texto, args);
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

await db.exec(`
  create role anon; create role authenticated;
  create table public.listening_sessions (id uuid primary key, ended_at timestamptz);
  create table public.listening_queue (id bigserial primary key, session_id uuid not null references public.listening_sessions (id) on delete cascade, faixa text);
  create table public.yt_cache (user_id uuid not null, cache_key text not null, payload jsonb not null default '{}', fetched_at timestamptz not null default now(), primary key (user_id, cache_key));
`);

// Quatro Jams: viva, acabada ontem, acabada há 8 dias, acabada há 30.
const sessoes = { viva: [uid(1), null], ontem: [uid(2), 1], oito: [uid(3), 8], trinta: [uid(4), 30] };
for (const [id, dias] of Object.values(sessoes)) {
  await q(`insert into public.listening_sessions (id, ended_at) values ($1, case when $2::int is null then null else now() - ($2::int || ' days')::interval end)`, [id, dias]);
  for (let i = 0; i < 3; i++) await q(`insert into public.listening_queue (session_id, faixa) values ($1, $2)`, [id, `f${i}`]);
}

// O yt_cache: [chave, idade em horas, deve sair?]
const cache = [
  ['deezer:vizinhanca:v2:x', 1, true],
  ['playlist:ytm:v1:PLx', 47, false],
  ['playlist:ytm:v1:PLy', 49, true],
  ['playlist:v2:velha', 24 * 40, true],
  ['trending_music:v2:PT:50', 23, false],
  ['trending_music:v2:US:50', 25, true],
  ['trendingXmusic:v2:US:50', 25, false],
  ['search:v2:drake', 24 * 7, false],
  ['search:v2:kendrick', 24 * 9, true],
  ['playlists_search:v2:gym', 24 * 9, true],
  ['playlistsXsearch:v2:gym', 24 * 9, false],
  ['descobertas:mostradas', 24 * 60, false],
  ['smart-shuffle:historico', 24 * 80, false],
  ['mistura-do-dia', 24 * 3, false],
];
for (const [chave, horas] of cache) {
  await q(`insert into public.yt_cache (user_id, cache_key, fetched_at) values ($1, $2, now() - ($3::int || ' hours')::interval)`, [uid(9), chave, horas]);
}

let primeira;
await caso('o ficheiro corre (sem o pg_cron, só não agenda)', async () => {
  const r = await db.exec(sql);
  primeira = r.find((x) => x.fields?.some((f) => f.name === 'filas'))?.rows?.[0];
  assert.ok(primeira, 'a chamada de uma vez devolve as contas');
});

await caso('sai a fila das Jams acabadas há mais de 7 dias, e só essa', async () => {
  const filas = await q(`select session_id, count(*)::int as n from public.listening_queue group by 1`);
  const porSessao = Object.fromEntries(filas.rows.map((r) => [r.session_id, r.n]));
  assert.equal(porSessao[sessoes.viva[0]], 3, 'a Jam viva fica com a fila');
  assert.equal(porSessao[sessoes.ontem[0]], 3, 'a acabada ontem fica com a fila');
  assert.equal(porSessao[sessoes.oito[0]], undefined, 'a acabada há 8 dias perde a fila');
  assert.equal(porSessao[sessoes.trinta[0]], undefined, 'a acabada há 30 dias perde a fila');
  assert.equal(Number(primeira.filas), 6);
});

await caso('as sessões ficam todas (o convite no chat aponta para elas)', async () => {
  const r = await q(`select count(*)::int as n from public.listening_sessions`);
  assert.equal(r.rows[0].n, 4);
});

await caso('o yt_cache sai pela validade de cada tipo, e o da conta fica', async () => {
  const r = await q(`select cache_key from public.yt_cache`);
  const ficaram = new Set(r.rows.map((x) => x.cache_key));
  for (const [chave, , sai] of cache) {
    assert.equal(ficaram.has(chave), !sai, `${chave} devia ${sai ? 'sair' : 'ficar'}`);
  }
  assert.equal(Number(primeira.cache), cache.filter(([, , sai]) => sai).length);
});

await caso('correr outra vez não apaga mais nada', async () => {
  const r = await q(`select * from public.limpar_filas_e_cache()`);
  assert.deepEqual([Number(r.rows[0].filas), Number(r.rows[0].cache)], [0, 0]);
});

await caso('a app não a pode chamar', async () => {
  const r = await q(`select has_function_privilege('authenticated', 'public.limpar_filas_e_cache()', 'execute') as pode`);
  assert.equal(r.rows[0].pode, false);
});

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntest-limpar-filas-e-cache-sql: tudo certo');

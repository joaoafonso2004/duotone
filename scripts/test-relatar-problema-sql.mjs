/**
 * O "Report a problem" (supabase/relatar-problema.sql), ensaiado numa base de
 * dados a sério (PGlite).
 *
 * O que se prende aqui: sem sessão e sem descrição não entra; o texto é cortado
 * aos limites; o 4.º relato do dia é recusado; os relatos com mais de 90 dias
 * saem; e a app não lê a tabela, só chama a função.
 *
 * Correr: node scripts/test-relatar-problema-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/relatar-problema.sql', import.meta.url), 'utf8');
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
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
  create table public.profiles (id uuid primary key, username text);
`);
await q(`insert into public.profiles (id, username) values ($1, 'um'), ($2, 'dois')`, [uid(1), uid(2)]);
await db.exec(sql);

const como = async (n) => {
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [n ? uid(n) : '']);
  await db.exec('set role authenticated');
};
const comoDono = () => db.exec('reset role');
const relatar = (comentario, relatorio = null) =>
  q(`select public.relatar_problema($1, $2, 'ios 18.1', '5.9.5') as id`, [comentario, relatorio]);
const falha = async (fn, padrao) => {
  try { await fn(); } catch (e) { assert.match(e.message, padrao); return; }
  assert.fail('devia ter falhado');
};

await caso('sem sessão não entra', async () => {
  await como(null);
  await falha(() => relatar('a música parou'), /Sign in/);
  await comoDono();
});

await caso('sem descrição não entra', async () => {
  await como(1);
  await falha(() => relatar('  a '), /Describe the problem/);
  await comoDono();
});

await caso('entra, com o texto cortado aos limites', async () => {
  await como(1);
  const r = await relatar(`  ${'x'.repeat(2500)}  `, 'y'.repeat(70000));
  assert.ok(Number(r.rows[0].id) > 0);
  await comoDono();
  const linha = (await q(`select char_length(comentario) as c, char_length(relatorio) as r, plataforma, versao from public.relatos`)).rows[0];
  assert.deepEqual([linha.c, linha.r, linha.plataforma, linha.versao], [2000, 60000, 'ios 18.1', '5.9.5']);
});

await caso('o 4.º relato do dia é recusado (e não conta o de outra pessoa)', async () => {
  await como(1);
  await relatar('segundo relato');
  await relatar('terceiro relato');
  await falha(() => relatar('quarto relato'), /3 reports today/);
  await como(2);
  await relatar('o outro pode');
  await comoDono();
});

await caso('os relatos com mais de 90 dias saem a cada relato novo', async () => {
  await q(`insert into public.relatos (user_id, comentario, em) values ($1, 'velho', now() - interval '91 days'), ($1, 'recente', now() - interval '89 days')`, [uid(2)]);
  await como(2);
  await relatar('mais um');
  await comoDono();
  const r = await q(`select comentario from public.relatos where user_id = $1 order by em`, [uid(2)]);
  assert.deepEqual(r.rows.map((x) => x.comentario), ['recente', 'o outro pode', 'mais um']);
});

await caso('a app não lê a tabela nem escreve nela diretamente', async () => {
  await como(1);
  await falha(() => q(`select * from public.relatos`), /permission denied/);
  await falha(() => q(`insert into public.relatos (user_id, comentario) values ($1, 'direto')`, [uid(1)]), /permission denied/);
  await comoDono();
});

await caso('quem não tem conta não chama a função', async () => {
  const r = await q(`select has_function_privilege('anon', 'public.relatar_problema(text,text,text,text)', 'execute') as anon,
                            has_function_privilege('authenticated', 'public.relatar_problema(text,text,text,text)', 'execute') as auth`);
  assert.deepEqual([r.rows[0].anon, r.rows[0].auth], [false, true]);
});

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntest-relatar-problema-sql: tudo certo');

/**
 * Os álbuns guardados (supabase/albuns-guardados.sql), ensaiados numa base de
 * dados a sério (PGlite).
 *
 * O que se prende aqui: cada um vê e mexe só nos seus; guardar outra vez o
 * mesmo atualiza (o upsert da app); tirar funciona; os textos têm limites; e o
 * teto de 2000 por conta.
 *
 * Correr: node scripts/test-albuns-guardados-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/albuns-guardados.sql', import.meta.url), 'utf8');
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
  create table public.profiles (id uuid primary key);
`);
await q(`insert into public.profiles (id) values ($1), ($2)`, [uid(1), uid(2)]);
await db.exec(sql);

const como = async (n) => {
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid(n)]);
  await db.exec('set role authenticated');
};
const comoDono = () => db.exec('reset role');
const guardar = (id, titulo = `Álbum ${id}`) => q(
  `insert into public.saved_albums (album_id, title, artist, year, kind, artwork_url) values ($1, $2, 'Artista', '2024', 'Album', null)
   on conflict (user_id, album_id) do update set title = excluded.title, saved_at = now()`, [id, titulo]);
const falha = async (fn, padrao) => {
  try { await fn(); } catch (e) { assert.match(e.message, padrao); return; }
  assert.fail('devia ter falhado');
};

await caso('guarda, e guardar outra vez o mesmo atualiza', async () => {
  await como(1);
  await guardar('OLAK5uy_a');
  await guardar('OLAK5uy_a', 'Título novo');
  const r = await q(`select album_id, title from public.saved_albums`);
  assert.deepEqual(r.rows, [{ album_id: 'OLAK5uy_a', title: 'Título novo' }]);
  await comoDono();
});

await caso('cada um vê só os seus', async () => {
  await como(2);
  await guardar('OLAK5uy_b');
  const r = await q(`select album_id from public.saved_albums`);
  assert.deepEqual(r.rows.map((x) => x.album_id), ['OLAK5uy_b']);
  await comoDono();
});

await caso('não se tira o de outra pessoa (0 linhas), e tira-se o próprio', async () => {
  await como(2);
  const outro = await q(`delete from public.saved_albums where album_id = 'OLAK5uy_a'`);
  assert.equal(outro.affectedRows, 0);
  const meu = await q(`delete from public.saved_albums where album_id = 'OLAK5uy_b'`);
  assert.equal(meu.affectedRows, 1);
  await comoDono();
  const r = await q(`select user_id, album_id from public.saved_albums`);
  assert.deepEqual(r.rows, [{ user_id: uid(1), album_id: 'OLAK5uy_a' }]);
});

await caso('não se guarda em nome de outra pessoa', async () => {
  await como(1);
  await falha(() => q(`insert into public.saved_albums (user_id, album_id, title) values ($1, 'x', 'x')`, [uid(2)]), /row-level security/);
  await comoDono();
});

await caso('os textos têm limites', async () => {
  await como(1);
  await falha(() => guardar('y', ''), /check constraint/);
  await falha(() => guardar('x'.repeat(200)), /check constraint/);
  await comoDono();
});

await caso('o teto de 2000 por conta', async () => {
  await q(`insert into public.saved_albums (user_id, album_id, title) select $1, 'pre' || g, 'x' from generate_series(1, 1999) g`, [uid(2)]);
  await como(2);
  await guardar('o-2000');
  await falha(() => guardar('o-2001'), /up to 2000 albums/);
  await comoDono();
});

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntest-albuns-guardados-sql: tudo certo');

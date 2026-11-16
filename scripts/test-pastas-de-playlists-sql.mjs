/**
 * As pastas de playlists (supabase/pastas-de-playlists.sql), numa base de dados
 * a sério (PGlite): a coluna aceita um nome com limites, ou nada, e o ficheiro
 * corre duas vezes sem partir.
 *
 * Correr: node scripts/test-pastas-de-playlists-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/pastas-de-playlists.sql', import.meta.url), 'utf8');
const db = new PGlite();
let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}
const falha = async (fn) => { try { await fn(); } catch { return; } assert.fail('devia ter falhado'); };

await db.exec(`create table public.playlists (id uuid primary key default gen_random_uuid(), owner_id uuid, name text not null);`);
await db.exec(sql);
await db.exec(sql);

await caso('uma playlist ganha uma pasta, muda e sai dela', async () => {
  const { rows } = await db.query(`insert into public.playlists (name, pasta) values ('Noites', 'Chill') returning id`);
  const id = rows[0].id;
  await db.query(`update public.playlists set pasta = 'Treino' where id = $1`, [id]);
  await db.query(`update public.playlists set pasta = null where id = $1`, [id]);
  const r = await db.query(`select pasta from public.playlists where id = $1`, [id]);
  assert.equal(r.rows[0].pasta, null);
});

await caso('um nome vazio ou comprido demais não entra', async () => {
  await falha(() => db.query(`insert into public.playlists (name, pasta) values ('x', '   ')`));
  await falha(() => db.query(`insert into public.playlists (name, pasta) values ('x', $1)`, ['p'.repeat(61)]));
  await db.query(`insert into public.playlists (name, pasta) values ('x', $1)`, ['p'.repeat(60)]);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-pastas-de-playlists-sql: tudo certo');

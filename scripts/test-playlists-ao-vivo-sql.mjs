/**
 * Ensaio em PGlite, com a RLS ligada, de supabase/playlists-ao-vivo.sql (7/10):
 * o aviso de que uma playlist colaborativa mudou, que a página aberta ouve pelo
 * Realtime. Um aviso por COMANDO, só nas playlists com colaboradores, e apagar
 * uma playlist continua a funcionar.
 *
 * Correr: node scripts/test-playlists-ao-vivo-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const COLAB = '20000000-0000-0000-0000-000000000001';
const SO = '20000000-0000-0000-0000-000000000002';
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const admin = () => db.exec('reset role;');
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
  alter default privileges in schema public grant all on tables to authenticated;
  create publication supabase_realtime;
`);
await db.exec(ler('schema.sql').replace('create extension if not exists "pgcrypto";', ''));
await db.exec(`
  alter table public.profiles add column if not exists username text;
  alter table public.profiles add column if not exists avatar_url text;
  create table public.friendships (user_id_1 uuid, user_id_2 uuid, status text);
  grant all on all tables in schema public to authenticated;
  revoke insert, update, delete on public.tracks from authenticated;
`);
await db.exec(ler('estado-das-migracoes.sql'));
await db.exec(ler('playlists-colaborativas.sql'));
const MARCA = 'pub:playlist_mudancas';
const emFalta = async () => (await q('select public.marcas_em_falta($1::text[]) as m', [[MARCA]])).rows[0].m;
assert.deepEqual(await emFalta(), [MARCA]);
await db.exec(ler('playlists-ao-vivo.sql'));
await db.exec(ler('playlists-ao-vivo.sql'));
assert.deepEqual(await emFalta(), [], 'a tabela dos avisos entra no Realtime');

for (const n of [1, 2, 3]) await q(`insert into auth.users (id) values ($1)`, [uid(n)]);
await q(`insert into public.friendships values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid), 'accepted')`, [uid(1), uid(2)]);
for (let n = 1; n <= 6; n++) {
  await q(`insert into public.tracks (id, source, source_id, title, artist, duration_seconds) values ($1,'youtube',$2,$3,'X',200)`, [tid(n), `v${n}`, `F${n}`]);
}
await q(`insert into public.playlists (id, owner_id, name) values ($1,$3,'Do grupo'),($2,$3,'Só minha')`, [COLAB, SO, uid(1)]);
await como(1);
await q(`select public.convidar_para_playlist($1, $2::uuid[])`, [COLAB, [uid(2)]]);

const aviso = async (p) => (await q(`select mudou_em, por from public.playlist_mudancas where playlist_id=$1`, [p])).rows[0] ?? null;
const avisos = async () => (await q(`select count(*)::int as n from public.playlist_mudancas`)).rows[0].n;

console.log('\no aviso');
await caso('entrar um colaborador já avisa (as caras mudam)', async () => {
  await admin();
  assert.equal((await aviso(COLAB))?.por, uid(1));
});
await caso('uma playlist só minha nunca escreve aviso', async () => {
  await como(1);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,0),($1,$3,1)`, [SO, tid(1), tid(2)]);
  await q(`update public.playlist_tracks set position = position + 1 where playlist_id=$1`, [SO]);
  await q(`delete from public.playlist_tracks where playlist_id=$1`, [SO]);
  await admin();
  assert.equal(await aviso(SO), null);
});
await caso('o colaborador põe três de uma vez: um aviso, com ele como autor', async () => {
  await admin(); await q(`delete from public.playlist_mudancas`);
  await como(2);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,0),($1,$3,1),($1,$4,2)`, [COLAB, tid(1), tid(2), tid(3)]);
  await admin();
  assert.equal(await avisos(), 1);
  assert.equal((await aviso(COLAB)).por, uid(2));
});
await caso('reordenar e tirar também avisam, e o autor muda', async () => {
  await admin(); const antes = (await aviso(COLAB)).mudou_em;
  await como(1);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,0),($1,$3,1)
    on conflict (playlist_id, track_id) do update set position = excluded.position`, [COLAB, tid(3), tid(1)]);
  await admin(); assert.equal((await aviso(COLAB)).por, uid(1));
  await como(2);
  await q(`delete from public.playlist_tracks where playlist_id=$1 and track_id=$2`, [COLAB, tid(2)]);
  await admin(); assert.equal((await aviso(COLAB)).por, uid(2));
  assert.ok(new Date((await aviso(COLAB)).mudou_em) >= new Date(antes));
});

console.log('\nquem vê');
await caso('o dono e o colaborador veem o aviso; um estranho não', async () => {
  await como(1); assert.equal((await q(`select * from public.playlist_mudancas`)).rows.length, 1);
  await como(2); assert.equal((await q(`select * from public.playlist_mudancas`)).rows.length, 1);
  await como(3); assert.equal((await q(`select * from public.playlist_mudancas`)).rows.length, 0);
});
await caso('ninguém escreve um aviso à mão', async () => {
  await como(2);
  let erro = null;
  try { await q(`insert into public.playlist_mudancas (playlist_id) values ($1)`, [COLAB]); } catch (e) { erro = e; }
  assert.match(String(erro?.message), /permission denied/);
});

console.log('\napagar');
await caso('apagar uma playlist colaborativa com músicas continua a funcionar', async () => {
  await como(1);
  const r = await q(`delete from public.playlists where id=$1 returning id`, [COLAB]);
  assert.equal(r.rows.length, 1);
  await admin();
  assert.equal(await aviso(COLAB), null, 'o aviso vai com ela');
  assert.equal((await q(`select count(*)::int as n from public.playlist_tracks where playlist_id=$1`, [COLAB])).rows[0].n, 0);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nPlaylists ao vivo (SQL): passou.');

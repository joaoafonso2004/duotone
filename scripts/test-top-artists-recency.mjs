/** O perfil mantém o gosto antigo, mas deixa o presente conseguir ultrapassá-lo. */
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const db = new PGlite();
const sql = fs.readFileSync(new URL('../supabase/top-artists.sql', import.meta.url), 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
const antiga = '10000000-0000-0000-0000-000000000001';
const recente = '10000000-0000-0000-0000-000000000002';

await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.tracks (id uuid primary key, artist text, artwork_url text);
  create table public.plays (
    id bigint generated always as identity primary key,
    user_id uuid not null, track_id uuid not null references public.tracks(id),
    played_at timestamptz not null default now()
  );
`);
await db.exec(sql);
await db.query(`insert into public.tracks(id,artist,artwork_url) values
  ($1,'Gosto Antigo','antiga.jpg'),($2,'Gosto Recente','recente.jpg')`, [antiga, recente]);
await db.query(`insert into public.plays(user_id,track_id,played_at)
  select $1,$2,now()-interval '2 years' from generate_series(1,5)`, [user, antiga]);
await db.query(`insert into public.plays(user_id,track_id,played_at)
  select $1,$2,now()-interval '2 days' from generate_series(1,2)`, [user, recente]);
await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);

const { rows } = await db.query('select artist,play_count from public.get_top_artists(8)');
assert.deepEqual(rows.map((r) => r.artist), ['Gosto Recente', 'Gosto Antigo']);
assert.equal(Number(rows[0].play_count), 8, 'cada escuta dos últimos 30 dias vale quatro');
assert.equal(Number(rows[1].play_count), 5, 'o gosto antigo continua presente com peso um');
console.log('Perfil por recência: o presente pesa mais sem apagar o histórico antigo.');

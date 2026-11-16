/**
 * Partilhar álbuns com amigos (supabase/partilhar-albuns.sql), ensaiado numa
 * base de dados a sério (PGlite).
 *
 * O que se prende aqui: um álbum vai como 'album', com o que se mostra no
 * `track_data`; o que não é um álbum bem formado fica de fora; as músicas e as
 * playlists continuam como estavam; e mandar em nome de outro não passa.
 *
 * Correr: node scripts/test-partilhar-albuns-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/partilhar-albuns.sql', import.meta.url), 'utf8');
const db = new PGlite();
const q = (texto, args = []) => db.query(texto, args);
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

// O que já existe no Supabase antes deste ficheiro, reduzido ao que a política usa.
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
  create table public.profiles (id uuid primary key);
  create table public.playlists (id uuid primary key, owner_id uuid not null);
  create table public.shared_items (
    id uuid primary key default gen_random_uuid(),
    sender_id uuid not null references public.profiles (id),
    recipient_id uuid references public.profiles (id),
    group_id uuid,
    item_type text not null,
    playlist_id uuid references public.playlists (id),
    session_id uuid,
    track_data jsonb,
    message text,
    reply_to_id uuid,
    created_at timestamptz not null default now()
  );
  alter table public.shared_items add constraint shared_items_item_type_check
    check (item_type in ('playlist', 'track', 'sessao'));
  alter table public.shared_items enable row level security;
  create policy "shared_items: ler" on public.shared_items for select to authenticated using (true);
  grant select, insert on public.shared_items to authenticated;
  grant select on public.playlists to authenticated;
  create function public.e_membro_do_grupo(g uuid) returns boolean language sql stable as $$ select false $$;
  create function public.resposta_valida(r uuid, d uuid, g uuid) returns boolean language sql stable as $$ select r is null $$;
  create function public.shared_track_valid(value jsonb) returns boolean language sql immutable as $$
    select jsonb_typeof(value)='object' and jsonb_typeof(value->'sourceId')='string' and jsonb_typeof(value->'title')='string' $$;
`);
await q(`insert into public.profiles (id) values ($1), ($2)`, [uid(1), uid(2)]);
await q(`insert into public.playlists (id, owner_id) values ($1, $2)`, [uid(101), uid(1)]);
await db.exec(sql);

const como = async (n) => {
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid(n)]);
  await db.exec('set role authenticated');
};
const comoDono = () => db.exec('reset role');
const mandar = (tipo, dados, { de = uid(1), playlist = null } = {}) => q(
  `insert into public.shared_items (sender_id, recipient_id, item_type, playlist_id, track_data) values ($1, $2, $3, $4, $5)`,
  [de, uid(2), tipo, playlist, dados == null ? null : JSON.stringify(dados)]);
const falha = async (fn) => {
  try { await fn(); } catch { return; }
  assert.fail('devia ter falhado');
};
const ALBUM = { albumId: 'OLAK5uy_abcdefghij', title: 'GNX', artist: 'Kendrick Lamar', artworkUrl: 'https://capa', kind: 'Album', year: '2024' };

await caso('um álbum vai como "album", e quem recebe lê o que se mostra', async () => {
  await como(1);
  await mandar('album', ALBUM);
  const r = await q(`select item_type, track_data->>'title' as titulo, track_data->>'albumId' as id from public.shared_items`);
  assert.deepEqual(r.rows, [{ item_type: 'album', titulo: 'GNX', id: 'OLAK5uy_abcdefghij' }]);
  await comoDono();
});

await caso('uma lista do YouTube que não é um álbum também cabe', async () => {
  await como(1);
  await mandar('album', { albumId: 'PLx1234567890abc', title: 'Mix', artist: null, artworkUrl: null, kind: 'Playlist' });
  await comoDono();
});

await caso('o que não é um álbum bem formado fica de fora', async () => {
  await como(1);
  await falha(() => mandar('album', null));
  await falha(() => mandar('album', { ...ALBUM, albumId: 'curto' }));
  await falha(() => mandar('album', { ...ALBUM, albumId: "OLAK5uy_a'; drop" }));
  await falha(() => mandar('album', { ...ALBUM, title: '   ' }));
  await falha(() => mandar('album', { ...ALBUM, title: 'x'.repeat(301) }));
  await falha(() => mandar('album', { ...ALBUM, artworkUrl: 'x'.repeat(1001) }));
  await falha(() => mandar('album', { ...ALBUM, artist: 7 }));
  await falha(() => mandar('album', { ...ALBUM, extra: 'x'.repeat(3000) }), 'nada de lixo grande');
  await falha(() => mandar('album', ALBUM, { playlist: uid(101) }), 'um álbum não leva playlist_id');
  await comoDono();
});

await caso('mandar em nome de outro não passa', async () => {
  await como(2);
  await falha(() => mandar('album', ALBUM, { de: uid(1) }));
  await comoDono();
});

await caso('as músicas e as playlists próprias continuam como estavam', async () => {
  await como(1);
  await mandar('track', { source: 'youtube', sourceId: 'abc', title: 'T' });
  await mandar('playlist', null, { playlist: uid(101) });
  await comoDono();
  await como(2);
  await falha(() => mandar('playlist', null, { de: uid(2), playlist: uid(101) }), 'a playlist de outro não');
  await comoDono();
});

await caso('correr o ficheiro outra vez não parte nada', async () => {
  await db.exec(sql);
  const r = await q(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'shared_items_item_type_check'`);
  assert.match(r.rows[0].d, /'album'/);
  assert.match(r.rows[0].d, /'sessao'/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-partilhar-albuns-sql: tudo certo');

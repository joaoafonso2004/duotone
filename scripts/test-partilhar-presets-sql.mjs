/**
 * Partilhar presets da Customise (supabase/partilhar-presets.sql, 28/11), ensaiado
 * numa base de dados a sério (PGlite), por cima do partilhar-albuns.sql.
 *
 * O que se prende aqui: um preset vai como 'preset', com o nome e o aspeto no
 * `track_data`; o que não é um preset bem formado fica de fora; os álbuns, as
 * músicas e as playlists continuam como estavam; mandar em nome de outro não passa.
 *
 * Correr: node scripts/test-partilhar-presets-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const albuns = fs.readFileSync(new URL('../supabase/partilhar-albuns.sql', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/partilhar-presets.sql', import.meta.url), 'utf8');
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
await db.exec(albuns);
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
const PRESET = { title: 'Night drive', kind: 'preset', v: 1, capa: 'floating', aparencia: { fundoApp: 'oled', titulos: 'serif', botoes: ['fila', 'eq'] } };

await caso('um preset vai como "preset", e quem recebe lê o nome e o aspeto', async () => {
  await como(1);
  await mandar('preset', PRESET);
  const r = await q(`select item_type, track_data->>'title' as nome, track_data->'aparencia'->>'fundoApp' as fundo from public.shared_items`);
  assert.deepEqual(r.rows, [{ item_type: 'preset', nome: 'Night drive', fundo: 'oled' }]);
  await comoDono();
});

await caso('o que não é um preset bem formado fica de fora', async () => {
  await como(1);
  await falha(() => mandar('preset', null));
  await falha(() => mandar('preset', { ...PRESET, kind: 'album' }));
  await falha(() => mandar('preset', { ...PRESET, title: '  ' }));
  await falha(() => mandar('preset', { ...PRESET, title: 'x'.repeat(41) }));
  await falha(() => mandar('preset', { ...PRESET, aparencia: 'oled' }));
  await falha(() => mandar('preset', { ...PRESET, aparencia: null }));
  await falha(() => mandar('preset', { ...PRESET, capa: 7 }));
  await falha(() => mandar('preset', { ...PRESET, aparencia: { lixo: 'x'.repeat(6000) } }), 'nada de lixo grande');
  await falha(() => mandar('preset', PRESET, { playlist: uid(101) }), 'um preset não leva playlist_id');
  await comoDono();
});

await caso('mandar em nome de outro não passa', async () => {
  await como(2);
  await falha(() => mandar('preset', PRESET, { de: uid(1) }));
  await comoDono();
});

await caso('os álbuns, as músicas e as playlists próprias continuam como estavam', async () => {
  await como(1);
  await mandar('album', { albumId: 'OLAK5uy_abcdefghij', title: 'GNX', artist: 'Kendrick Lamar', artworkUrl: null, kind: 'Album' });
  await mandar('track', { source: 'youtube', sourceId: 'abc', title: 'T' });
  await mandar('playlist', null, { playlist: uid(101) });
  await falha(() => mandar('album', { albumId: 'curto', title: 'X' }));
  await comoDono();
});

await caso('correr o ficheiro outra vez não parte nada', async () => {
  await db.exec(sql);
  const r = await q(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'shared_items_item_type_check'`);
  assert.match(r.rows[0].d, /'preset'/);
  assert.match(r.rows[0].d, /'album'/);
  assert.match(r.rows[0].d, /'sessao'/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-partilhar-presets-sql: tudo certo');

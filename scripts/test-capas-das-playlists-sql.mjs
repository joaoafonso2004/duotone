/**
 * Ensaio em PGlite, com a RLS ligada, de supabase/capas-das-playlists.sql
 * (26/11): quem carrega, vê e apaga a capa de uma playlist, e o que a coluna
 * aceita. O Storage do Supabase entra como um duplo mínimo (os baldes, os
 * objetos e o `storage.foldername`), com a RLS ligada como lá.
 *
 * Correr: node scripts/test-capas-das-playlists-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const fid = (n) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const caminho = (dono, n) => `${uid(dono)}/${fid(n)}.jpg`;
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const admin = () => db.exec('reset role;');
const q = (sql, args = []) => db.query(sql, args);

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
  finally { await admin(); }
}
async function recusa(fn, padrao, msg) {
  let erro = null;
  try { await fn(); } catch (e) { erro = e; }
  assert.ok(erro, `${msg}: devia ter falhado`);
  if (padrao) assert.match(String(erro.message), padrao, msg);
}

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated;

  -- O duplo do Storage: o que o ficheiro usa.
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
`);
await db.exec(ler('schema.sql').replace('create extension if not exists "pgcrypto";', ''));
await db.exec(`grant all on all tables in schema public to authenticated;`);
await db.exec(ler('estado-das-migracoes.sql'));
const MARCA = 'col:playlists.capa';
const emFalta = async () => (await q('select public.marcas_em_falta($1::text[]) as m', [[MARCA]])).rows[0].m;
assert.deepEqual(await emFalta(), [MARCA]);
// Duas vezes: tem de se poder voltar a correr.
await db.exec(ler('capas-das-playlists.sql'));
await db.exec(ler('capas-das-playlists.sql'));
assert.deepEqual(await emFalta(), [], 'a marca aparece depois de correr');

for (const n of [1, 2, 3, 4]) {
  await q(`insert into auth.users (id) values ($1)`, [uid(n)]);
  await q(`insert into public.profiles (id, name) values ($1, $2) on conflict (id) do nothing`, [uid(n), `Pessoa ${n}`]);
}
// A playlist do 1. O 2 consegue lê-la (como um colaborador ou um amigo no perfil, que outras políticas dão).
const P = (await q(`insert into public.playlists (owner_id, name) values ($1, 'Noites') returning id`, [uid(1)])).rows[0].id;
await db.exec(`create policy "ensaio: o 2 lê as do 1" on public.playlists for select to authenticated
  using (auth.uid() = '${uid(2)}'::uuid and owner_id = '${uid(1)}'::uuid);`);

await caso('o balde é privado, de JPEG, até 2 MB', async () => {
  const { rows } = await q(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'playlist-covers'`);
  assert.deepEqual(rows, [{ public: false, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg'] }]);
});

await caso('o dono carrega na própria pasta, e não na de outro', async () => {
  await como(1);
  await q(`insert into storage.objects (bucket_id, name) values ('playlist-covers', $1)`, [caminho(1, 1)]);
  await recusa(() => q(`insert into storage.objects (bucket_id, name) values ('playlist-covers', $1)`, [caminho(3, 9)]), /row-level security/, 'pasta de outro');
});

await caso('a capa aceita um ficheiro da pasta do dono, e só esse', async () => {
  await como(1);
  await q(`update public.playlists set capa = $1 where id = $2`, [caminho(1, 1), P]);
  await recusa(() => q(`update public.playlists set capa = $1 where id = $2`, [caminho(3, 9), P]), /playlists_capa_check/, 'pasta de outro');
  await recusa(() => q(`update public.playlists set capa = $1 where id = $2`, [`${uid(1)}/../x.jpg`, P]), /playlists_capa_check/, 'caminho torto');
  await recusa(() => q(`update public.playlists set capa = $1 where id = $2`, [`${uid(1)}/${fid(1)}.png`, P]), /playlists_capa_check/, 'outro formato');
  await q(`update public.playlists set capa = null where id = $1`, [P]);
  await q(`update public.playlists set capa = $1 where id = $2`, [caminho(1, 1), P]);
});

await caso('quem não é dono não muda a capa', async () => {
  await como(2);
  const r = await q(`update public.playlists set capa = null where id = $1 returning id`, [P]);
  assert.equal(r.rows.length, 0);
  await admin();
  assert.equal((await q(`select capa from public.playlists where id = $1`, [P])).rows[0].capa, caminho(1, 1));
});

await caso('vê a capa o dono e quem lê a playlist; um estranho não', async () => {
  const ve = async (n, nome) => { await como(n); return (await q(`select 1 from storage.objects where bucket_id = 'playlist-covers' and name = $1`, [nome])).rows.length === 1; };
  assert.equal(await ve(1, caminho(1, 1)), true, 'o dono');
  assert.equal(await ve(2, caminho(1, 1)), true, 'quem lê a playlist');
  assert.equal(await ve(4, caminho(1, 1)), false, 'um estranho');
});

await caso('uma imagem que não é capa de nada só a vê o dono', async () => {
  await como(1);
  await q(`insert into storage.objects (bucket_id, name) values ('playlist-covers', $1)`, [caminho(1, 2)]);
  await como(2);
  assert.equal((await q(`select 1 from storage.objects where name = $1`, [caminho(1, 2)])).rows.length, 0);
});

await caso('apaga-se da própria pasta, e não da de outro', async () => {
  await como(4);
  assert.equal((await q(`delete from storage.objects where name = $1 returning id`, [caminho(1, 2)])).rows.length, 0);
  await como(1);
  assert.equal((await q(`delete from storage.objects where name = $1 returning id`, [caminho(1, 2)])).rows.length, 1);
});

await caso('os outros baldes não mudam', async () => {
  await admin();
  await q(`insert into storage.buckets (id, name, public) values ('outro', 'outro', false)`);
  await q(`insert into storage.objects (bucket_id, name) values ('outro', $1)`, [caminho(1, 5)]);
  await como(1);
  assert.equal((await q(`select 1 from storage.objects where bucket_id = 'outro'`)).rows.length, 0, 'sem política, o dono também não vê');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-capas-das-playlists-sql: tudo certo');

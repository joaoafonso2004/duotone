/**
 * Ensaio em PGlite, com a RLS ligada, de supabase/playlists-colaborativas.sql
 * (7/10): quem pode ver e mexer numa playlist colaborativa, e quem não pode.
 *
 * Correr: node scripts/test-playlists-colaborativas-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const P = '20000000-0000-0000-0000-000000000001';
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const admin = () => db.exec('reset role;');
const q = (sql, args = []) => db.query(sql, args);

let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
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
  -- O que o Supabase faz a cada tabela nova: tudo para o authenticated.
  alter default privileges in schema public grant all on tables to authenticated;
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
const MARCA = 'fn:pessoas_da_playlist';
const emFalta = async () => (await q('select public.marcas_em_falta($1::text[]) as m', [[MARCA]])).rows[0].m;
assert.deepEqual(await emFalta(), [MARCA]);
// Duas vezes: tem de se poder voltar a correr.
await db.exec(ler('playlists-colaborativas.sql'));
await db.exec(ler('playlists-colaborativas.sql'));
assert.deepEqual(await emFalta(), [], 'a marca aparece depois de correr');

// 1 é o dono; 2 é amigo; 3 tem o pedido pendente; 4 é um estranho; 10..30 amigos para o teto.
const pessoas = [1, 2, 3, 4, ...Array.from({ length: 21 }, (_, i) => 10 + i)];
for (const n of pessoas) {
  await q(`insert into auth.users (id) values ($1)`, [uid(n)]);
  // O schema cria o perfil a partir do auth.users (gatilho): só se completa.
  await q(`insert into public.profiles (id, name, username) values ($1, $2, $3) on conflict (id) do update set name = excluded.name, username = excluded.username`, [uid(n), `Pessoa ${n}`, `p${n}`]);
}
const amizade = (a, b, status = 'accepted') => q(`insert into public.friendships values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid), $3)`, [uid(a), uid(b), status]);
await amizade(1, 2);
await amizade(1, 3, 'pending');
await amizade(2, 4); // amigo do colaborador, não do dono
for (let i = 10; i <= 30; i++) await amizade(1, i);
for (let n = 1; n <= 5; n++) {
  await q(`insert into public.tracks (id, source, source_id, title, artist, duration_seconds) values ($1,'youtube',$2,$3,'X',200)`, [tid(n), `vid${n}`, `Faixa ${n}`]);
}
await q(`insert into public.playlists (id, owner_id, name) values ($1,$2,'Do grupo')`, [P, uid(1)]);
await q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,0)`, [P, tid(1)]);

const veAPlaylist = async () => (await q(`select id from public.playlists where id=$1`, [P])).rows.length === 1;
const faixas = async () => (await q(`select track_id, position, added_by from public.playlist_tracks where playlist_id=$1 order by position`, [P])).rows;
const convidar = async (amigos) => (await q(`select public.convidar_para_playlist($1, $2::uuid[]) as n`, [P, amigos.map(uid)])).rows[0].n;
const pessoasDa = async () => (await q(`select user_id, papel from public.pessoas_da_playlist($1)`, [P])).rows;

console.log('\nconvidar');
await caso('o dono só junta amigos aceites (nem o pendente, nem o estranho, nem ele)', async () => {
  await como(1);
  assert.equal(await convidar([2, 3, 4, 1]), 1);
  assert.equal(await convidar([2]), 0, 'outra vez não repete');
  await admin();
  const linhas = (await q(`select user_id, convidado_por from public.playlist_colaboradores`)).rows;
  assert.deepEqual(linhas.map((r) => r.user_id), [uid(2)]);
  assert.equal(linhas[0].convidado_por, uid(1));
});
await caso('só o dono convida', async () => {
  await como(2);
  await recusa(() => convidar([4]), /Only the owner/, 'um colaborador não convida');
  await como(4);
  await recusa(() => convidar([4]), /Only the owner/, 'um estranho não se convida');
});
await caso('ninguém escreve na tabela direto', async () => {
  await como(4);
  await recusa(() => q(`insert into public.playlist_colaboradores (playlist_id, user_id) values ($1,$2)`, [P, uid(4)]), /permission denied/, 'insert direto');
  await como(1);
  await recusa(() => q(`insert into public.playlist_colaboradores (playlist_id, user_id) values ($1,$2)`, [P, uid(4)]), /permission denied/, 'nem o dono');
});

console.log('\no colaborador');
await caso('vê a playlist e as músicas', async () => {
  await como(2);
  assert.ok(await veAPlaylist());
  assert.equal((await faixas()).length, 1);
});
await caso('põe uma música, e o added_by é ele mesmo que mande outro', async () => {
  await como(2);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position, added_by) values ($1,$2,1,$3)`, [P, tid(2), uid(1)]);
  const f = await faixas();
  assert.equal(f.length, 2);
  assert.equal(f[1].added_by, uid(2), 'o gatilho escreve quem inseriu');
  await como(1);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,2)`, [P, tid(3)]);
  assert.equal((await faixas())[2].added_by, uid(1));
});
await caso('reordena com o upsert da app, sem mudar quem pôs', async () => {
  await como(2);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,0),($1,$3,1),($1,$4,2)
    on conflict (playlist_id, track_id) do update set position = excluded.position`, [P, tid(3), tid(1), tid(2)]);
  const f = await faixas();
  assert.deepEqual(f.map((r) => r.track_id), [tid(3), tid(1), tid(2)]);
  assert.equal(f[0].added_by, uid(1), 'a do dono continua do dono');
  assert.equal(f[2].added_by, uid(2));
});
await caso('tira uma música', async () => {
  await como(2);
  const r = await q(`delete from public.playlist_tracks where playlist_id=$1 and track_id=$2 returning track_id`, [P, tid(3)]);
  assert.equal(r.rows.length, 1);
});
await caso('não muda o nome nem apaga a playlist', async () => {
  await como(2);
  const nome = await q(`update public.playlists set name='Minha' where id=$1 returning id`, [P]);
  assert.equal(nome.rows.length, 0);
  const apagar = await q(`delete from public.playlists where id=$1 returning id`, [P]);
  assert.equal(apagar.rows.length, 0);
  await admin();
  assert.equal((await q(`select name from public.playlists where id=$1`, [P])).rows[0].name, 'Do grupo');
});
await caso('vê as caras do dono e dos colaboradores, o dono primeiro', async () => {
  await como(2);
  assert.deepEqual((await pessoasDa()).map((r) => [r.user_id, r.papel]), [[uid(1), 'dono'], [uid(2), 'colaborador']]);
});

console.log('\nquem não está');
await caso('um estranho não vê nada nem mexe', async () => {
  await como(4);
  assert.equal(await veAPlaylist(), false);
  assert.equal((await faixas()).length, 0);
  assert.deepEqual(await pessoasDa(), []);
  assert.equal((await q(`select * from public.playlist_colaboradores`)).rows.length, 0);
  await recusa(() => q(`insert into public.playlist_tracks (playlist_id, track_id, position) values ($1,$2,9)`, [P, tid(5)]), /row-level security/, 'insert de fora');
  const tirar = await q(`delete from public.playlist_tracks where playlist_id=$1 returning track_id`, [P]);
  assert.equal(tirar.rows.length, 0);
});

console.log('\nsair e ser tirado');
await caso('quem sai deixa de ver', async () => {
  await como(2);
  await q(`select public.sair_da_playlist($1)`, [P]);
  assert.equal(await veAPlaylist(), false);
  assert.equal((await faixas()).length, 0);
});
await caso('o dono tira um colaborador; um colaborador não tira ninguém', async () => {
  await como(1);
  assert.equal(await convidar([2, 10]), 2);
  await como(10);
  await recusa(() => q(`select public.tirar_colaborador($1,$2)`, [P, uid(2)]), /Only the owner/, 'colaborador a tirar outro');
  await como(1);
  await q(`select public.tirar_colaborador($1,$2)`, [P, uid(2)]);
  await como(2);
  assert.equal(await veAPlaylist(), false);
  await como(10);
  assert.ok(await veAPlaylist(), 'o outro continua');
});

console.log('\nlimites');
await caso('no máximo 20 colaboradores', async () => {
  await como(1);
  const muitos = Array.from({ length: 21 }, (_, i) => 10 + i);
  await recusa(() => convidar(muitos), /up to 20/, '21 de uma vez');
  await admin();
  assert.equal((await q(`select count(*)::int as n from public.playlist_colaboradores`)).rows[0].n, 1, 'nada entrou');
  await como(1);
  assert.equal(await convidar(muitos.slice(0, 19)), 18, 'até aos 20 entra (o 10 já lá estava)');
});
await caso('apagar a playlist leva os colaboradores', async () => {
  await como(1);
  await q(`delete from public.playlists where id=$1`, [P]);
  await admin();
  assert.equal((await q(`select count(*)::int as n from public.playlist_colaboradores`)).rows[0].n, 0);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nPlaylists colaborativas (SQL): passou.');

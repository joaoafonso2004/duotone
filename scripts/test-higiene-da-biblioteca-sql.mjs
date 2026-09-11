/**
 * As funções do Library check, numa base de dados a sério (PGlite) e com a
 * RLS ligada: supabase/higiene-da-biblioteca.sql.
 *
 * O que se prende aqui é o que um erro custava caro: juntar não pode deixar
 * uma playlist a apontar para a faixa que saiu, o "Undo" tem de pôr TUDO como
 * estava (datas e posições incluídas), e nada disto pode tocar na biblioteca
 * ou nas playlists de outra pessoa.
 *
 * Correr: node scripts/test-higiene-da-biblioteca-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const pid = (n) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
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
`);
await db.exec(ler('schema.sql').replace('create extension if not exists "pgcrypto";', ''));
// O que o Supabase dá por omissão, e o que o security-hardening.sql tirou: o
// catálogo `tracks` não se escreve a partir da app.
await db.exec(`
  grant all on all tables in schema public to authenticated;
  revoke insert, update, delete on public.tracks from authenticated;
`);
// Duas vezes: tem de se poder voltar a correr.
await db.exec(ler('higiene-da-biblioteca.sql'));
await db.exec(ler('higiene-da-biblioteca.sql'));

/** Estado de partida, sempre o mesmo: cada caso começa daqui. */
async function repor() {
  await admin();
  await db.exec(`
    delete from public.playlist_tracks; delete from public.playlists;
    delete from public.library_tracks; delete from public.tracks; delete from auth.users;
  `);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'um@x.test','{}'),($2,'dois@x.test','{}')`, [uid(1), uid(2)]);
  await q(`insert into public.tracks (id, source, source_id, title, artist, artwork_url, duration_seconds) values
    ($1,'youtube','AAAAAAAAAAA','Lucid Dreams','Juice WRLD - Topic',null,239),
    ($2,'youtube','BBBBBBBBBBB','Juice WRLD - Lucid Dreams (Official Video)','Juice WRLD','https://morta.example/x.jpg',241),
    ($3,'youtube','CCCCCCCCCCC','Outra','Alguém',null,200),
    ($4,'spotify','spotifyid','Do Spotify','Alguém',null,200)`, [tid(1), tid(2), tid(3), tid(4)]);
  await q(`insert into public.playlists (id, owner_id, name) values ($1,$3,'Só a B'),($2,$3,'As duas'),($4,$5,'Do outro')`,
    [pid(1), pid(2), uid(1), pid(3), uid(2)]);
  await q(`insert into public.playlist_tracks (playlist_id, track_id, position, added_at) values
    ($1,$4,3,'2026-02-01'),
    ($2,$3,1,'2026-02-02'),($2,$4,5,'2026-02-03'),
    ($5,$4,0,'2026-02-04')`, [pid(1), pid(2), tid(1), tid(2), pid(3)]);
  await q(`insert into public.library_tracks (user_id, track_id, added_at) values ($1,$2,'2026-01-01'),($3,$2,'2026-01-05')`,
    [uid(1), tid(2), uid(2)]);
}

const biblioteca = async (u) => (await q(`select track_id, added_at from public.library_tracks where user_id=$1 order by track_id`, [u])).rows
  .map((r) => `${r.track_id.slice(-1)}@${new Date(r.added_at).toISOString().slice(0, 10)}`);
const playlist = async (p) => (await q(`select track_id, position from public.playlist_tracks where playlist_id=$1 order by position`, [p])).rows
  .map((r) => `${r.track_id.slice(-1)}#${r.position}`);

console.log('\njuntar');
await caso('a que fica ocupa o lugar da que sai, na biblioteca e nas playlists', async () => {
  await repor(); await como(1);
  const { rows } = await q(`select public.juntar_na_biblioteca($1,$2) as r`, [tid(1), tid(2)]);
  const r = rows[0].r;
  await admin();
  assert.deepEqual(await biblioteca(uid(1)), ['1@2026-01-01'], 'herda a data da que saiu');
  assert.deepEqual(await playlist(pid(1)), ['1#3'], 'troca no mesmo sítio');
  assert.deepEqual(await playlist(pid(2)), ['1#1'], 'a que já tinha as duas fica só com uma');
  assert.equal(r.playlists.length, 2);
  assert.deepEqual(r.playlists.map((p) => p.acao).sort(), ['removida', 'trocada']);
});
await caso('não toca na biblioteca nem nas playlists de outra pessoa', async () => {
  await repor(); await como(1);
  await q(`select public.juntar_na_biblioteca($1,$2)`, [tid(1), tid(2)]);
  await admin();
  assert.deepEqual(await biblioteca(uid(2)), ['2@2026-01-05']);
  assert.deepEqual(await playlist(pid(3)), ['2#0']);
});
await caso('se a que fica já estava guardada, mantém a data dela', async () => {
  await repor();
  await q(`insert into public.library_tracks (user_id, track_id, added_at) values ($1,$2,'2026-03-01')`, [uid(1), tid(1)]);
  await como(1);
  const { rows } = await q(`select public.juntar_na_biblioteca($1,$2) as r`, [tid(1), tid(2)]);
  assert.equal(rows[0].r.fica_ja_estava, true);
  await admin();
  assert.deepEqual(await biblioteca(uid(1)), ['1@2026-03-01']);
});
await caso('recusa juntar uma faixa com ela própria, ou com uma que não existe', async () => {
  await repor(); await como(1);
  await assert.rejects(q(`select public.juntar_na_biblioteca($1,$1)`, [tid(1)]), /inválidas/);
  await assert.rejects(q(`select public.juntar_na_biblioteca($1,$2)`, [tid(9), tid(2)]), /não existe/);
  await admin();
  assert.deepEqual(await biblioteca(uid(1)), ['2@2026-01-01'], 'e não mexeu em nada');
});
await caso('sem sessão não faz nada', async () => {
  await repor();
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','',false);`);
  await assert.rejects(q(`select public.juntar_na_biblioteca($1,$2)`, [tid(1), tid(2)]), /Sem sessão/);
});

console.log('\ndesfazer');
await caso('o Undo põe tudo como estava, datas e posições incluídas', async () => {
  await repor(); await como(1);
  const { rows } = await q(`select public.juntar_na_biblioteca($1,$2) as r`, [tid(1), tid(2)]);
  await q(`select public.desfazer_juntar_na_biblioteca($1,$2,$3)`, [tid(1), tid(2), rows[0].r]);
  await admin();
  assert.deepEqual(await biblioteca(uid(1)), ['2@2026-01-01']);
  assert.deepEqual(await playlist(pid(1)), ['2#3']);
  assert.deepEqual(await playlist(pid(2)), ['1#1', '2#5']);
});
await caso('desfazer não tira a que fica se ela já lá estava antes', async () => {
  await repor();
  await q(`insert into public.library_tracks (user_id, track_id, added_at) values ($1,$2,'2026-03-01')`, [uid(1), tid(1)]);
  await como(1);
  const { rows } = await q(`select public.juntar_na_biblioteca($1,$2) as r`, [tid(1), tid(2)]);
  await q(`select public.desfazer_juntar_na_biblioteca($1,$2,$3)`, [tid(1), tid(2), rows[0].r]);
  await admin();
  assert.deepEqual(await biblioteca(uid(1)), ['1@2026-03-01', '2@2026-01-01']);
});
await caso('um registo com a playlist de outra pessoa não lhe mexe', async () => {
  await repor(); await como(2);
  const registo = { guardada_em: null, fica_ja_estava: false, playlists: [{ playlist: pid(1), posicao: 9, adicionada_em: null, acao: 'removida' }] };
  await q(`select public.desfazer_juntar_na_biblioteca($1,$2,$3)`, [tid(3), tid(2), registo]);
  await admin();
  assert.deepEqual(await playlist(pid(1)), ['2#3'], 'a playlist do utilizador 1 ficou igual');
});

console.log('\ncorrigir a capa');
await caso('a capa passa a ser a miniatura do próprio vídeo', async () => {
  await repor(); await como(1);
  const { rows } = await q(`select public.corrigir_capa($1) as url`, [tid(2)]);
  assert.equal(rows[0].url, 'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg');
});
await caso('só em faixas que a pessoa tem', async () => {
  await repor(); await como(1);
  await assert.rejects(q(`select public.corrigir_capa($1)`, [tid(3)]), /não está na tua biblioteca/);
});
await caso('uma faixa que não é do YouTube fica como está', async () => {
  await repor();
  await q(`insert into public.library_tracks (user_id, track_id) values ($1,$2)`, [uid(1), tid(4)]);
  await como(1);
  const { rows } = await q(`select public.corrigir_capa($1) as url`, [tid(4)]);
  assert.equal(rows[0].url, null);
});
await caso('é mesmo precisa: a app não pode escrever no catálogo diretamente', async () => {
  await repor(); await como(1);
  await assert.rejects(q(`update public.tracks set artwork_url='x' where id=$1`, [tid(2)]), /permission denied/);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

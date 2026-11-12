// supabase/presenca-ao-vivo.sql num Postgres a sério (PGlite) (11/11): o canal
// `presenca:<id>` -- só o dono declara, só ele e os amigos aceites veem.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const uid = (n) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const sala = 'presenca:' + uid(1);
const ler = (f) => fs.readFileSync(new URL('../supabase/' + f, import.meta.url), 'utf8');
await db.exec(`
  create role anon; create role authenticated; create schema auth; create schema realtime;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
  create table public.friendships(user_id_1 uuid,user_id_2 uuid,status text);
  create table realtime.messages(topic text,extension text,payload jsonb default '{}');
  alter table realtime.messages enable row level security;
  grant usage on schema realtime,public,auth to authenticated,anon;
  grant select,insert on realtime.messages to authenticated,anon;
`);
const ajuda = ler('social-presence.sql');
await db.exec(ajuda.slice(ajuda.indexOf('create or replace function public.social_can_view'), ajuda.indexOf('create table if not exists public.social_presence_sessions')));
// 1 e 2 amigos; 1 e 3 só pedido pendente; 4 ninguém.
await db.query("insert into public.friendships values($1,$2,'accepted'),($1,$3,'pending')", [uid(1), uid(2), uid(3)]);
await db.query("insert into realtime.messages(topic,extension) values($1,'presence'),($1,'broadcast'),($2,'presence')", [sala, 'presenca:' + uid(4)]);

const sql = ler('presenca-ao-vivo.sql');
await db.exec(sql);
await db.exec(sql);
console.log('migração corrida duas vezes: ok');

const como = async (n, topic = sala, role = 'authenticated') => {
  await db.exec('reset role; set role ' + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('realtime.topic',$2,false)", [n ? uid(n) : '', topic]);
};
const ver = async () => (await db.query('select * from realtime.messages')).rows;
const declarar = (topic = sala, extension = 'presence') => db.query('insert into realtime.messages(topic,extension) values($1,$2)', [topic, extension]);
try {
  // Ver o broadcast do canal é o que o Realtime exige para deixar entrar num
  // canal privado (12/11): só com 'presence', todos eram recusados.
  await como(1);
  assert.deepEqual((await ver()).map((m) => m.extension).sort(), ['broadcast', 'presence'],
    'o dono pode ler o seu canal, broadcast incluído (sem isso o Realtime não o deixa entrar)');
  await declarar();
  await como(2);
  assert.equal((await ver()).length, 3, 'o amigo aceite também');
  await assert.rejects(() => declarar(), (e) => e.code === '42501', 'um amigo não declara no canal de outro');
  for (const n of [3, 4, null]) {
    await como(n);
    assert.equal((await ver()).length, 0, 'sem amizade aceite não se vê nada');
    await assert.rejects(() => declarar(), (e) => e.code === '42501');
  }
  await como(4, 'presenca:' + uid(4));
  assert.equal((await ver()).length, 1, 'cada um vê o seu canal');
  await declarar('presenca:' + uid(4));
  await assert.rejects(() => declarar('presenca:' + uid(4), 'broadcast'), (e) => e.code === '42501', 'só presença, não broadcast');
  await como(1, 'presenca:nao-e-um-id');
  assert.equal((await ver()).length, 0, 'um tópico que não é um id não deixa ver nada');
  await como(1, 'escuta:' + uid(1));
  await assert.rejects(() => declarar('escuta:' + uid(1)), (e) => e.code === '42501', 'não abre outros tópicos');
} finally {
  await db.exec('reset role');
}
console.log('\nPresença ao vivo no Realtime: só o dono declara, só ele e os amigos aceites veem.');

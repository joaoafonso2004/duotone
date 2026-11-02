import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const uid = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const sala = 'escuta:' + uid(1);
const ler = f => fs.readFileSync(new URL('../supabase/' + f, import.meta.url), 'utf8');
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
const helper = ler('social-presence.sql');
await db.exec(helper.slice(helper.indexOf('create or replace function public.social_can_view'), helper.indexOf('create table if not exists public.social_presence_sessions')));
await db.query('insert into public.friendships values($1,$2,\'accepted\'),($1,$3,\'pending\')', [uid(1), uid(2), uid(3)]);
await db.query("insert into realtime.messages(topic,extension) values($1,'broadcast'),($2,'broadcast')", [sala, 'escuta:' + uid(4)]);
const sql = ler('20261102222643_escuta_ao_vivo.sql');
await db.exec(sql); await db.exec(sql);
const como = async (n, topic = sala, role = 'authenticated') => {
  await db.exec('reset role; set role ' + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('realtime.topic',$2,false)", [n ? uid(n) : '', topic]);
};
const ver = async () => (await db.query('select * from realtime.messages')).rows;
const inserir = extension => db.query('insert into realtime.messages(topic,extension) values($1,$2)', [sala, extension]);
try {
  await como(1); assert.equal((await ver()).length, 1, 'nem o dono lê o tópico de outro utilizador');
  await inserir('broadcast');
  await como(2); assert.equal((await ver()).length, 2, 'o amigo aceite escuta');
  await inserir('presence');
  await assert.rejects(() => inserir('broadcast'), e => e.code === '42501', 'um ouvinte não consegue fazer-se passar pelo DJ');
  for (const n of [3, 4, null]) {
    await como(n); assert.equal((await ver()).length, 0, 'só amizade aceite permite entrar');
    await assert.rejects(() => inserir('presence'), e => e.code === '42501');
    await assert.rejects(() => inserir('broadcast'), e => e.code === '42501');
  }
  await como(null, sala, 'anon'); assert.equal((await ver()).length, 0);
  await assert.rejects(() => inserir('broadcast'), e => e.code === '42501');
  for (const topic of ['social:outro', 'escuta:invalido', sala + ':extra']) {
    await como(1, topic); assert.equal((await ver()).length, 0, 'não abre outros canais nem lança erros de UUID');
    await assert.rejects(() => inserir('broadcast'), e => e.code === '42501');
  }
  await db.exec('reset role'); await db.exec('delete from public.friendships');
  await como(2); assert.equal((await ver()).length, 0, 'amizade removida já não autoriza uma nova entrada');
  await como(1);
  const marcas = ['pol:realtime.messages:escuta: receber som', 'pol:realtime.messages:escuta: transmitir som'];
  assert.deepEqual((await db.query('select public.marcas_em_falta($1) as falta', [marcas])).rows[0].falta, []);
  assert.deepEqual((await db.query("select public.marcas_em_falta(array['pol:messages:escuta: receber som']) as falta")).rows[0].falta,
    ['pol:messages:escuta: receber som'], 'o esquema público continua a ser o padrão das marcas antigas');
  console.log('Escuta privada: dono transmite, amigos aceites recebem, sem falsificação, isolamento de tópicos e migração idempotente.');
} finally { await db.close(); }

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const sala = id(10);
await db.exec(`
  create role anon; create role authenticated; create schema auth; create schema realtime;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
  create table public.listening_sessions(id uuid primary key,host_id uuid,ended_at timestamptz,guests_can_control boolean default true);
  create table public.listening_members(session_id uuid,user_id uuid);
  create function public.e_membro_da_sessao(s uuid) returns boolean language sql stable security definer set search_path=public as $$
    select exists(select 1 from listening_members where session_id=s and user_id=auth.uid()) $$;
  create function public.social_can_view(u uuid) returns boolean language sql stable as $$ select auth.uid()=u or auth.uid()='${id(2)}'::uuid $$;
  alter table public.listening_sessions enable row level security;
  grant usage on schema public,auth,realtime to authenticated,anon;
  grant select on public.listening_sessions to authenticated;
  create policy members_read on public.listening_sessions for select to authenticated using
    (host_id=auth.uid() or public.e_membro_da_sessao(id) or auth.uid()='${id(3)}'::uuid);
  create table realtime.messages(topic text,extension text);
  alter table realtime.messages enable row level security;
  grant select,insert on realtime.messages to authenticated,anon;
  insert into public.listening_sessions(id,host_id) values('${sala}','${id(1)}');
  insert into public.listening_members values('${sala}','${id(1)}'),('${sala}','${id(2)}');
`);
const sql = fs.readFileSync(new URL('../supabase/20261103040216_eq_do_jam.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql);
const como = async (n, topic = '', role = 'authenticated') => {
  await db.exec('reset role; set role ' + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('realtime.topic',$2,false)", [n ? id(n) : '', topic]);
};
const partilhar = (v, dispositivo) => db.query('select (public.partilhar_eq_do_jam($1,$2,$3)).*', [sala,v,dispositivo]);
const topic = (host, emissao) => `jameq:${sala}:${id(host)}:${emissao}`;
const ver = async () => (await db.query('select * from realtime.messages')).rows;
const inserir = (t, extension) => db.query('insert into realtime.messages values($1,$2)', [t,extension]);
try {
  await como(1);
  assert.equal((await db.query('select eq_partilhado from listening_sessions')).rows[0].eq_partilhado,false);
  const activa = (await partilhar(true,'pc')).rows[0];
  assert.ok(activa.eq_emissao); assert.equal(activa.eq_dispositivo,'pc');
  const repetida = (await partilhar(true,'pc')).rows[0];
  assert.equal(repetida.eq_emissao,activa.eq_emissao,'repetir a escolha não escreve uma ativação nova');
  await assert.rejects(() => partilhar(true,''),e=>e.code==='22023');
  await assert.rejects(() => db.query("update listening_sessions set host_id=$1 where id=$2",[id(2),sala]),e=>e.code==='42501','não ganhou UPDATE geral');
  const t = topic(1,activa.eq_emissao);
  await como(1,t); await inserir(t,'broadcast');
  await como(2,t); assert.equal((await ver()).length,1); await inserir(t,'presence');
  await assert.rejects(() => inserir(t,'broadcast'),e=>e.code==='42501','convidados com controlo não se fazem passar pelo dono');
  await assert.rejects(() => partilhar(false,null),e=>e.code==='42501');
  assert.equal((await db.query('update listening_sessions set eq_partilhado=false,eq_dispositivo=null,eq_emissao=null returning id')).rows.length,0);
  for (const n of [3,4,null]) {
    await como(n,t); assert.equal((await ver()).length,0,'nem um convite sem entrada permite ouvir o EQ');
    await assert.rejects(() => inserir(t,'presence'),e=>e.code==='42501');
    await assert.rejects(() => partilhar(true,'outro'),e=>e.code==='42501');
  }
  await como(null,t,'anon'); assert.equal((await ver()).length,0);
  await assert.rejects(() => partilhar(true,'anon'),e=>e.code==='42501');
  for (const errado of ['jameq:bad',t+':extra',topic(2,activa.eq_emissao),'sessao:'+sala]) {
    await como(1,errado); assert.equal((await ver()).length,0);
    await assert.rejects(() => inserir(errado,'broadcast'),e=>e.code==='42501');
  }
  await como(1,t);
  const trocada=(await partilhar(true,'iphone')).rows[0];
  assert.notEqual(trocada.eq_emissao,activa.eq_emissao,'mudar de aparelho invalida o tópico anterior');
  assert.equal((await ver()).length,0);
  await assert.rejects(() => inserir(t,'broadcast'),e=>e.code==='42501');
  await partilhar(false,null);
  await como(1,topic(1,trocada.eq_emissao));
  await assert.rejects(() => inserir(topic(1,trocada.eq_emissao),'broadcast'),e=>e.code==='42501');
  await partilhar(true,'pc');
  await db.exec('reset role'); await db.query('update listening_sessions set host_id=$1 where id=$2',[id(2),sala]);
  const transferida=(await db.query('select * from listening_sessions')).rows[0];
  assert.equal(transferida.eq_partilhado,false); assert.equal(transferida.eq_emissao,null); assert.equal(transferida.eq_dispositivo,null);
  await como(1); await assert.rejects(() => partilhar(true,'pc'),e=>e.code==='42501');
  await como(2); await partilhar(true,'novo');
  await db.exec('reset role'); await db.query('update listening_sessions set ended_at=now() where id=$1',[sala]);
  await como(2); await assert.rejects(() => partilhar(true,'novo'),e=>e.code==='42501');
  const escuta='escuta:'+id(1);
  await como(1,escuta); await inserir(escuta,'broadcast');
  await como(2,escuta); await inserir(escuta,'presence');
  await assert.rejects(() => inserir(escuta,'broadcast'),e=>e.code==='42501','Listening with continua protegido');
  await como(4,escuta); assert.equal((await ver()).length,0);
  await db.exec('reset role');
  assert.equal((await db.query("select has_table_privilege('authenticated','public.listening_sessions','UPDATE') as geral")).rows[0].geral,false);
  assert.equal((await db.query("select prosecdef from pg_proc where proname='partilhar_eq_do_jam'")).rows[0].prosecdef,false);
  assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='realtime' and tablename='messages'")).rows[0].n,2);
  console.log('Jam EQ SQL: opção do dono, convidados isolados, tópico por ativação, troca de aparelho/dono, fim e Listening with passaram.');
} finally { await db.close(); }

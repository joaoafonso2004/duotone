// Permissões e transações reais em Postgres/PGlite, com as funções de produção.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const ler = n => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args);
const como = n => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${n ? uid(n) : ''}',false);`);
const admin = () => db.exec('reset role;');
const track = id => ({ source: 'youtube', sourceId: id, title: id, artist: 'Duotone' });
let falhas = 0;
async function caso(nome, fn) {
  try { await admin(); await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.stack}`); }
}
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to authenticated, anon;
`);
await db.exec(ler('schema.sql').replace('create extension if not exists "pgcrypto";', ''));
for (const n of ['social-setup.sql', 'ouvir-juntos.sql', 'jam-solido.sql', 'radio-no-jam.sql', 'radio-tipo-no-jam.sql', 'limpar-fila-do-jam.sql', 'limpar-fila-do-jam.sql']) await db.exec(ler(n));
await db.exec('grant all on all tables in schema public to authenticated;');
for (let i = 1; i <= 4; i++) await q('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,\'{}\')', [uid(i), `${i}@example.test`]);
for (const b of [2, 3]) await q("insert into public.friendships(user_id_1,user_id_2,status) values($1,$2,'accepted')", [uid(1), uid(b)]);
const sessao = async id => { await admin(); return (await q('select * from public.listening_sessions where id=$1', [id])).rows[0]; };
const fila = async id => { await admin(); return (await q('select * from public.listening_queue where session_id=$1 order by posicao,id', [id])).rows; };
async function abrir(dono = 1) {
  await como(dono);
  const id = (await q('select public.criar_sessao_de_escuta($1::jsonb) as id', [JSON.stringify(track('a-tocar'))])).rows[0].id;
  await q('select public.juntar_muitas_a_fila($1,$2::jsonb)', [id, JSON.stringify([track('a'), track('b'), track('c')])]);
  if (dono === 1) { await como(2); await q('select public.entrar_na_sessao($1)', [id]); }
  return id;
}
const controlo = async (id, ligado) => { await como(1); await q('select public.permitir_controlo_aos_convidados($1,$2)', [id, ligado]); };
const limpar = async (id, eu) => { await como(eu); return (await q('select public.limpar_fila_da_sessao($1) as resultado', [id])).rows[0].resultado; };
const negado = (fn) => assert.rejects(fn, e => e.code === '42501');
try {
  await caso('o dono limpa com o controlo dos guests desligado, sem parar a música nem tocar noutra Jam', async () => {
    const id = await abrir(), outra = await abrir(4);
    await como(1); await q('select public.procurar_na_sessao($1,12345)', [id]);
    await q('select public.definir_radio_do_jam($1,true)', [id]);
    const antes = await sessao(id), items = await fila(id);
    const r = await limpar(id, 1), depois = await sessao(id);
    assert.deepEqual(new Set(r.ids), new Set(items.map(i => i.id)));
    assert.equal((await fila(id)).length, 0);
    assert.equal((await fila(outra)).length, 3);
    for (const campo of ['track', 'started_at', 'is_playing', 'paused_position_ms']) assert.deepEqual(depois[campo], antes[campo], campo);
    assert.equal(depois.radio, false);
    assert.equal(depois.queue_autofill_paused, true);
    assert.equal(depois.queue_revision, antes.queue_revision + 1);
  });
  await caso('guest sem controlo não limpa, e com controlo limpa', async () => {
    const id = await abrir();
    await negado(() => limpar(id, 2));
    assert.equal((await fila(id)).length, 3);
    await controlo(id, true);
    assert.equal((await limpar(id, 2)).ids.length, 3);
    assert.equal((await fila(id)).length, 0);
  });
  await caso('revogar o controlo antes do pedido impede o Clear que estava preparado na interface', async () => {
    const id = await abrir(); await controlo(id, true); await controlo(id, false);
    await negado(() => limpar(id, 2));
    assert.equal((await fila(id)).length, 3);
  });
  await caso('um estranho não limpa nem com os guests a controlar; anónimos também não', async () => {
    const id = await abrir(); await controlo(id, true);
    await negado(() => limpar(id, 3));
    await negado(() => limpar(id, null));
    await db.exec('reset role; set role anon;');
    await negado(() => q('select public.limpar_fila_da_sessao($1)', [id]));
    assert.equal((await fila(id)).length, 3);
  });
  await caso('vale o dono atual, e uma Jam acabada não se altera', async () => {
    const id = await abrir();
    await admin(); await q('update public.listening_sessions set host_id=$2 where id=$1', [id, uid(2)]);
    await negado(() => limpar(id, 1));
    assert.equal((await limpar(id, 2)).ids.length, 3);
    const fechada = await abrir();
    await admin(); await q('update public.listening_sessions set ended_at=clock_timestamp() where id=$1', [fechada]);
    await assert.rejects(() => limpar(fechada, 1));
    assert.equal((await fila(fechada)).length, 3);
  });
  await caso('um Clear vazio continua a suspender o enchimento', async () => {
    const id = await abrir(); await limpar(id, 1);
    assert.equal((await limpar(id, 1)).ids.length, 0);
    assert.equal((await sessao(id)).queue_autofill_paused, true);
  });
  await caso('lotes antigos e novas tentativas automáticas não repõem o que foi limpo', async () => {
    const id = await abrir(), versao = (await sessao(id)).queue_revision;
    const r = await limpar(id, 1);
    await como(1);
    const acrescentar = async (funcao, v) => (await q(`select public.${funcao}($1,$2::jsonb,$3) as n`, [id, JSON.stringify([track('tardia')]), v])).rows[0].n;
    assert.equal(await acrescentar('juntar_automaticas_a_fila', versao), 0);
    assert.equal(await acrescentar('juntar_automaticas_a_fila', r.versao), 0);
    assert.equal(await acrescentar('juntar_lista_a_fila_da_sessao', versao), 0);
    assert.equal((await q('select public.juntar_muitas_a_fila($1,$2::jsonb) as n', [id, JSON.stringify([track('app-anterior')])])).rows[0].n, 0, 'o enchimento de apps antigas também fica suspenso');
    assert.equal((await fila(id)).length, 0);
    // Uma lista escolhida DEPOIS do Clear é um pedido novo e retoma a fila.
    await como(2);
    assert.equal(await acrescentar('juntar_lista_a_fila_da_sessao', r.versao), 1);
    const nova = await sessao(id);
    assert.equal(nova.queue_autofill_paused, false);
    await como(1);
    assert.equal(await acrescentar('juntar_automaticas_a_fila', r.versao), 0);
    assert.equal(await acrescentar('juntar_automaticas_a_fila', nova.queue_revision), 1);
  });
  await caso('voltar a ligar o Radio retoma com revisão nova; só o dono faz o enchimento automático', async () => {
    const id = await abrir(), r = await limpar(id, 1);
    await controlo(id, true); await como(2);
    await q("select public.definir_radio_do_jam($1,true,'mix')", [id]);
    const nova = await sessao(id);
    assert.equal(nova.queue_autofill_paused, false);
    assert.ok(nova.queue_revision > r.versao);
    const args = [id, JSON.stringify([track('radio')]), nova.queue_revision];
    await como(2);
    await negado(() => q('select public.juntar_automaticas_a_fila($1,$2::jsonb,$3)', args));
    await como(1);
    assert.equal((await q('select public.juntar_automaticas_a_fila($1,$2::jsonb,$3) as n', args)).rows[0].n, 1);
  });
} finally { await db.close(); }
assert.equal(falhas, 0, `${falhas} casos de Clear no Jam falharam`);
console.log('Clear da Jam: permissões reais, isolamento, áudio preservado e lotes antigos bloqueados.');

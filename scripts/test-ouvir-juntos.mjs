// A migração do ouvir-juntos, contra um Postgres a sério.
//
// PGlite corre o Postgres dentro deste processo, por isso isto não é uma
// verificação de sintaxe: as tabelas são criadas, as políticas são avaliadas e
// as funções correm. O que passa aqui passa no Supabase.
//
// O que interessa provar não é que o SQL compila -- é que as REGRAS são
// verdade: que um estranho não vê a sessão, que um convidado não muda a faixa
// sem licença, e que retomar de uma pausa continua de onde estava em vez de
// recomeçar. Essas três, se estiverem erradas, dão bugs que só aparecem com
// duas pessoas em sítios diferentes.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const raiz = new URL('../supabase/', import.meta.url);
const ler = (n) => fs.readFileSync(new URL(n, raiz), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const como = (n) =>
  db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const q = (sql, args = []) => db.query(sql, args);

let falhas = 0;
async function verificar(nome, fn) {
  try {
    await fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${e.message}`);
  }
}

// ---- o mesmo andaime do test-social-database ------------------------------
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon;`);

for (const f of ['schema.sql', 'social-setup.sql']) {
  await db.exec(ler(f).replace('create extension if not exists "pgcrypto";', ''));
}
await db.exec(`alter table friendships add column if not exists requester_id uuid;
grant all on all tables in schema public to authenticated;`);

await q(
  `insert into auth.users(id,email,raw_user_meta_data) values
   ($1,'a@example.test','{"name":"Anfitriao"}'),
   ($2,'c@example.test','{"name":"Convidado"}'),
   ($3,'e@example.test','{"name":"Estranho"}')`,
  [uid(1), uid(2), uid(3)]
);

// Amizade entre 1 e 2. O 3 nao e amigo de ninguem.
await db.exec('reset role');
await q(`insert into friendships(user_id_1,user_id_2,status,requester_id) values($1,$2,'accepted',$1)`,
  [uid(1), uid(2)]);

// ---- a migração, duas vezes (tem de ser idempotente) ----------------------
console.log('Ouvir juntos -- migração:');

await verificar('aplica-se, e aplica-se outra vez sem se queixar', async () => {
  await db.exec(ler('ouvir-juntos.sql'));
  await db.exec(ler('ouvir-juntos.sql'));
});

const FAIXA = JSON.stringify({
  id: 'x', source: 'youtube', sourceId: 'abc123', title: 'Uma Musica',
  artist: 'Alguem', artworkUrl: null, durationSeconds: 180,
});
const OUTRA = JSON.stringify({
  id: 'y', source: 'youtube', sourceId: 'def456', title: 'Outra',
  artist: 'Outro', artworkUrl: null, durationSeconds: 200,
});

let sessao;

console.log('\nAbrir e entrar:');

await verificar('o anfitrião cria a sessão e fica lá dentro', async () => {
  await como(1);
  sessao = (await q('select public.criar_sessao_de_escuta($1::jsonb) as id', [FAIXA])).rows[0].id;
  assert.ok(sessao);
  const m = await q('select * from listening_members where session_id=$1', [sessao]);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].ready, true, 'quem abre a sessão tem a faixa: está pronto');
});

await verificar('um amigo entra', async () => {
  await como(2);
  await q('select public.entrar_na_sessao($1)', [sessao]);
  await como(1);
  assert.equal((await q('select * from listening_members where session_id=$1', [sessao])).rows.length, 2);
});

await verificar('quem não é amigo não entra', async () => {
  await como(3);
  await assert.rejects(
    q('select public.entrar_na_sessao($1)', [sessao]),
    /amigo/i,
    'um estranho com o id da sessão entrou -- o convite é reencaminhável, a verificação tem de estar no servidor'
  );
});

await verificar('um estranho não vê sequer que a sessão existe', async () => {
  await como(3);
  assert.equal((await q('select * from listening_sessions')).rows.length, 0);
  assert.equal((await q('select * from listening_members')).rows.length, 0);
});

await verificar('quem está dentro vê a sessão e os outros membros', async () => {
  await como(2);
  assert.equal((await q('select * from listening_sessions')).rows.length, 1);
  assert.equal((await q('select * from listening_members')).rows.length, 2);
});

console.log('\nQuem manda:');

await verificar('por defeito um convidado não muda a faixa', async () => {
  await como(2);
  await assert.rejects(
    q('select public.definir_faixa_da_sessao($1,$2::jsonb)', [sessao, OUTRA]),
    /anfitri/i,
    'quatro pessoas com o dedo no pause é uma sessão que não toca nada'
  );
});

await verificar('mas junta à fila à vontade', async () => {
  await como(2);
  await q('select public.juntar_a_fila($1,$2::jsonb)', [sessao, OUTRA]);
  assert.equal((await q('select * from listening_queue where session_id=$1', [sessao])).rows.length, 1);
});

await verificar('o anfitrião pode dar controlo, e o convidado passa a mudar a faixa', async () => {
  await como(1);
  await q('select public.permitir_controlo_aos_convidados($1,true)', [sessao]);
  await como(2);
  await q('select public.definir_faixa_da_sessao($1,$2::jsonb)', [sessao, OUTRA]);
  const s = (await q('select * from listening_sessions where id=$1', [sessao])).rows[0];
  assert.equal(s.track.sourceId, 'def456');
});

await verificar('mas um convidado com controlo NÃO pode dar controlo a outros', async () => {
  await como(2);
  await assert.rejects(
    q('select public.permitir_controlo_aos_convidados($1,false)', [sessao]),
    /anfitri/i,
    'a permissão espalhava-se sozinha e o anfitrião perdia a sua própria sessão'
  );
});

await verificar('ninguém escreve directamente nas tabelas', async () => {
  await como(2);
  // Sem politicas de escrita, o Postgres recusa mesmo com `grant all`.
  await assert.rejects(
    q('update listening_sessions set guests_can_control=true where id=$1', [sessao]),
    /policy|permission/i,
    'uma app alterada contornava as funções e mandava na sessão'
  );
});

console.log('\nO relógio da sessão:');

await verificar('pôr uma faixa marca o início no relógio do servidor', async () => {
  await como(1);
  await q('select public.definir_faixa_da_sessao($1,$2::jsonb)', [sessao, FAIXA]);
  const s = (await q('select *, extract(epoch from (clock_timestamp()-started_at))*1000 as decorrido from listening_sessions where id=$1', [sessao])).rows[0];
  assert.equal(s.is_playing, true);
  assert.equal(s.paused_position_ms, 0);
  assert.ok(Number(s.decorrido) >= 0 && Number(s.decorrido) < 5000, `decorrido=${s.decorrido}`);
});

await verificar('faixa nova põe toda a gente a "não pronto" menos quem a pôs', async () => {
  await como(1);
  const m = (await q('select user_id, ready from listening_members where session_id=$1 order by user_id', [sessao])).rows;
  const anfitriao = m.find((r) => r.user_id === uid(1));
  const convidado = m.find((r) => r.user_id === uid(2));
  assert.equal(anfitriao.ready, true);
  assert.equal(convidado.ready, false, 'a app julgava que estavam todos prontos e arrancava sem esperar');
});

await verificar('retomar continua de onde parou, não do princípio', async () => {
  await como(1);
  await q('select public.pausar_sessao($1,$2)', [sessao, 42000]);
  let s = (await q('select * from listening_sessions where id=$1', [sessao])).rows[0];
  assert.equal(s.is_playing, false);
  assert.equal(s.paused_position_ms, 42000);

  await q('select public.retomar_sessao($1)', [sessao]);
  s = (await q('select extract(epoch from (clock_timestamp()-started_at))*1000 as pos, is_playing from listening_sessions where id=$1', [sessao])).rows[0];
  assert.equal(s.is_playing, true);
  const pos = Number(s.pos);
  assert.ok(
    pos >= 42000 && pos < 47000,
    `a posição derivada deu ${Math.round(pos)} ms em vez de ~42000 -- retomar recomeçou do princípio`
  );
});

console.log('\nAcabar:');

await verificar('o convidado sai e a sessão continua', async () => {
  await como(2);
  await q('select public.sair_da_sessao($1)', [sessao]);
  await como(1);
  assert.equal((await q('select * from listening_members where session_id=$1', [sessao])).rows.length, 1);
  assert.equal((await q('select ended_at from listening_sessions where id=$1', [sessao])).rows[0].ended_at, null);
});

await verificar('o anfitrião a sair FECHA a sessão', async () => {
  await como(1);
  await q('select public.sair_da_sessao($1)', [sessao]);
  await db.exec('reset role');
  const s = (await q('select ended_at, is_playing from listening_sessions where id=$1', [sessao])).rows[0];
  assert.ok(s.ended_at, 'ficou uma sessão aberta sem ninguém a mandar nela');
  assert.equal(s.is_playing, false);
});

await verificar('não se entra numa sessão acabada', async () => {
  await como(2);
  await assert.rejects(q('select public.entrar_na_sessao($1)', [sessao]), /acabou/i);
});

await verificar('abrir uma sessão nova fecha a anterior do mesmo anfitrião', async () => {
  await como(1);
  const a = (await q('select public.criar_sessao_de_escuta($1::jsonb) as id', [FAIXA])).rows[0].id;
  const b = (await q('select public.criar_sessao_de_escuta($1::jsonb) as id', [FAIXA])).rows[0].id;
  await db.exec('reset role');
  assert.ok((await q('select ended_at from listening_sessions where id=$1', [a])).rows[0].ended_at,
    'duas sessões abertas do mesmo anfitrião: em qual é que ele está?');
  assert.equal((await q('select ended_at from listening_sessions where id=$1', [b])).rows[0].ended_at, null);
});

console.log('\nO que não entra:');

await verificar('uma faixa mal formada é recusada', async () => {
  await como(1);
  for (const má of [
    JSON.stringify({ source: 'outra-coisa', sourceId: 'a', title: 'x' }),
    JSON.stringify({ source: 'youtube', sourceId: '', title: 'x' }),
    JSON.stringify({ source: 'youtube', sourceId: 'a', title: '' }),
    JSON.stringify({ source: 'youtube', sourceId: 'a', title: 'x'.repeat(1001) }),
    JSON.stringify(['isto', 'nao', 'e', 'um', 'objecto']),
  ]) {
    await assert.rejects(
      q('select public.criar_sessao_de_escuta($1::jsonb)', [má]),
      /inválida/i,
      `passou: ${má.slice(0, 60)}`
    );
  }
});

await verificar('a faixa guardada só leva os campos conhecidos', async () => {
  await como(1);
  const comLixo = JSON.stringify({
    source: 'youtube', sourceId: 'abc', title: 'Boa',
    segredo: 'x'.repeat(500), outroCampo: 123,
  });
  const s = (await q('select public.criar_sessao_de_escuta($1::jsonb) as id', [comLixo])).rows[0].id;
  await db.exec('reset role');
  const t = (await q('select track from listening_sessions where id=$1', [s])).rows[0].track;
  assert.equal(t.segredo, undefined, 'um cliente alterado enchia o realtime de toda a gente');
  assert.equal(t.outroCampo, undefined);
  assert.equal(t.title, 'Boa');
});

console.log('\nA hora do servidor:');

await verificar('avança entre chamadas dentro da mesma transacção', async () => {
  await como(1);
  // Se estivesse `stable`, o Postgres reutilizava a leitura e as duas davam o
  // mesmo -- um relogio que nao anda nao serve para medir nada.
  const r = await q('select public.hora_do_servidor() as a, pg_sleep(0.01), public.hora_do_servidor() as b');
  assert.ok(new Date(r.rows[0].b) > new Date(r.rows[0].a), 'a hora não avançou: está marcada `stable`?');
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nOuvir juntos: a migração está de pé, e as regras são verdade.');

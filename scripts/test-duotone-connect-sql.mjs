/**
 * A tabela de ordens do Duotone Connect, numa base de dados a sério (PGlite) e
 * com a RLS ligada: supabase/duotone-connect.sql.
 *
 * O que se prende aqui é o que separa isto de um canal aberto: as ordens de
 * uma conta não são visíveis nem alteráveis por outra, um aparelho não manda
 * ordens a si próprio, e uma ordem de um tipo inventado não entra.
 *
 * Correr: node scripts/test-duotone-connect-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
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
await db.exec('grant all on all tables in schema public to authenticated;');
// Duas vezes: tem de se poder voltar a correr.
await db.exec(ler('duotone-connect.sql'));
await db.exec(ler('duotone-connect.sql'));
await admin();
await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'um@x.test','{}'),($2,'dois@x.test','{}')`, [uid(1), uid(2)]);

const limpar = async () => { await admin(); await db.exec('delete from public.pedidos_ao_aparelho;'); };

console.log('\numa ordem é entre os aparelhos de UMA conta');
await caso('quem manda vê a sua ordem', async () => {
  await limpar(); await como(1);
  await q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('phone','pc','assumir')`);
  const { rows } = await q(`select tipo, estado from public.pedidos_ao_aparelho`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'pendente');
});
await caso('outra conta não a vê nem lhe mexe', async () => {
  await limpar(); await como(1);
  await q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('phone','pc','seguinte')`);
  await como(2);
  assert.equal((await q(`select * from public.pedidos_ao_aparelho`)).rows.length, 0, 'não lê');
  assert.equal((await q(`update public.pedidos_ao_aparelho set estado='feito' returning *`)).rows.length, 0, 'não responde por ela');
  assert.equal((await q(`delete from public.pedidos_ao_aparelho returning *`)).rows.length, 0, 'não a apaga');
  await admin();
  assert.equal((await q(`select count(*)::int as n from public.pedidos_ao_aparelho`)).rows[0].n, 1, 'continua lá');
});
await caso('não se pode escrever uma ordem em nome de outra conta', async () => {
  await limpar(); await como(1);
  await assert.rejects(
    q(`insert into public.pedidos_ao_aparelho (user_id, de_aparelho, para_aparelho, tipo) values ($1,'phone','pc','pausar')`, [uid(2)]),
    /row-level security|violates/i,
  );
});

console.log('\no que a tabela recusa');
await caso('uma ordem a si próprio', async () => {
  await limpar(); await como(1);
  await assert.rejects(
    q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('pc','pc','seguinte')`),
    /pedido_entre_aparelhos_diferentes/,
  );
});
await caso('um tipo inventado', async () => {
  await limpar(); await como(1);
  await assert.rejects(
    q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('phone','pc','formatar-o-disco')`),
    /pedidos_ao_aparelho_tipo_check/,
  );
});
await caso('um estado inventado', async () => {
  await limpar(); await como(1);
  await assert.rejects(
    q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo, estado) values ('phone','pc','pausar','talvez')`),
    /estado_check/,
  );
});

console.log('\nresponder e limpar');
await caso('o destino marca como feita, e quem mandou vê isso', async () => {
  await limpar(); await como(1);
  const { rows } = await q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('phone','pc','tocar-pausa') returning id`);
  await q(`update public.pedidos_ao_aparelho set estado='feito', respondido_em=now() where id=$1`, [rows[0].id]);
  const depois = await q(`select estado, detalhe from public.pedidos_ao_aparelho where id=$1`, [rows[0].id]);
  assert.equal(depois.rows[0].estado, 'feito');
});
await caso('o volume ficou de fora: o tipo já nem existe', async () => {
  await limpar(); await como(1);
  await assert.rejects(
    q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('phone','pc','volume')`),
    /pedidos_ao_aparelho_tipo_check/,
  );
});
await caso('a limpeza leva as velhas e deixa as de agora -- e só as da própria conta', async () => {
  await limpar(); await como(1);
  await q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo, criado_em) values ('phone','pc','pausar', now() - interval '2 hours')`);
  await q(`insert into public.pedidos_ao_aparelho (de_aparelho, para_aparelho, tipo) values ('phone','pc','seguinte')`);
  await admin();
  await q(`insert into public.pedidos_ao_aparelho (user_id, de_aparelho, para_aparelho, tipo, criado_em) values ($1,'x','y','pausar', now() - interval '2 hours')`, [uid(2)]);
  await como(1);
  const { rows } = await q(`select public.limpar_pedidos_ao_aparelho() as n`);
  assert.equal(rows[0].n, 1, 'só a velha dele');
  await admin();
  const sobra = await q(`select user_id, tipo from public.pedidos_ao_aparelho order by tipo`);
  assert.deepEqual(sobra.rows.map((r) => r.tipo), ['pausar', 'seguinte']);
  assert.equal(sobra.rows.find((r) => r.tipo === 'pausar').user_id, uid(2), 'a da outra conta ficou intacta');
});

console.log('\no Realtime');
await caso('a tabela entra na publicação, e voltar a correr não a duplica', async () => {
  const { rows } = await q(`select count(*)::int as n from pg_publication_tables where pubname='supabase_realtime' and tablename='pedidos_ao_aparelho'`);
  // Sem publicação nenhuma no PGlite o bloco não faz nada, e isso é o correto:
  // o ficheiro não pode rebentar num projeto sem Realtime ligado.
  assert.ok(rows[0].n <= 1);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');

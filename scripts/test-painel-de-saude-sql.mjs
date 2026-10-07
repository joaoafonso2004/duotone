/**
 * O painel de saúde (supabase/painel-de-saude.sql, 7/10), numa base de dados a
 * sério (PGlite) com o schema e o events.sql por baixo, como no Supabase.
 *
 * Correr: node scripts/test-painel-de-saude-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args);
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const admin = () => db.exec('reset role;');

let falhas = 0;
async function caso(nome, fn) {
  try { await admin(); await fn(); console.log(`  ok - ${nome}`); }
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
await db.exec(ler('events.sql'));
// O username vem do username-login.sql; aqui basta a coluna.
await db.exec('alter table public.profiles add column if not exists username text unique;');
for (let n = 1; n <= 3; n++) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid(n), `${n}@x.test`]);
}
await q(`update public.profiles set username = 'joao', name = 'Joao' where id = $1`, [uid(1)]);
await q(`update public.profiles set username = 'ana', name = 'Ana' where id = $1`, [uid(2)]);
// O que o Supabase dá por omissão às tabelas, ANTES da migração (que o tira à dela).
await db.exec('grant all on all tables in schema public to authenticated;');
await db.exec(ler('painel-de-saude.sql'));
await db.exec(ler('painel-de-saude.sql')); // correr duas vezes não parte nada

const ev = (n, nome, dados, plataforma = 'ios', versao = '4.7.0', haDias = 0) => q(
  `insert into public.app_events (user_id, nome, dados, plataforma, versao, em) values ($1, $2, $3::jsonb, $4, $5, now() - ($6 || ' days')::interval)`,
  [uid(n), nome, JSON.stringify(dados), plataforma, versao, String(haDias)]);
await ev(1, 'primeira_nota', { origem: 'cache', ms: 100 });
await ev(1, 'primeira_nota', { origem: 'cache', ms: 300 });
await ev(2, 'primeira_nota', { origem: 'ficheiro', ms: 2000 }, 'ios', '4.6.4');
await ev(2, 'faixa_falhou', { tipo: 'cdn-recusou', fase: 'resolver' }, 'ios', '4.6.4');
await ev(2, 'faixa_falhou', { tipo: 'cdn-recusou', fase: 'resolver' }, 'ios', '4.6.4');
await ev(1, 'crash', { tipo: 'sessao-interrompida' });
await ev(2, 'erro_js', { tipo: 'erro', assinatura: 'abc', mensagem: 'x is undefined' }, 'web', '4.7.0');
await ev(1, 'segundo_plano', { cpu_pct: 3.5 });
await ev(1, 'segundo_plano', { cpu_pct: 4.5 });
await ev(3, 'primeira_nota', { origem: 'cache', ms: 50 }, 'ios', '4.5.0', 40); // fora da janela

const painel = async (n, dias = 7) => { await como(n); return (await q('select public.painel_de_saude($1) as p', [dias])).rows[0].p; };

await caso('só o João é administrador', async () => {
  await como(1);
  assert.equal((await q('select public.e_administrador() as a')).rows[0].a, true);
  await como(2);
  assert.equal((await q('select public.e_administrador() as a')).rows[0].a, false);
});

await caso('outra conta não lê o painel', async () => {
  let erro = null;
  try { await painel(2); } catch (e) { erro = e; }
  assert.ok(erro && /Só para quem gere a app/.test(erro.message));
});

await caso('ninguém lê a tabela dos administradores pela API', async () => {
  await como(1);
  let erro = null, linhas = null;
  try { linhas = (await q('select * from public.administradores')).rows; } catch (e) { erro = e; }
  // Sem privilégio (o revoke) e, por baixo, a RLS sem políticas: nunca se vê ninguém.
  assert.ok((erro && /permission denied/.test(erro.message)) || (linhas && linhas.length === 0));
});

await caso('as contas do painel', async () => {
  const p = await painel(1);
  assert.equal(p.dias, 7);
  assert.equal(p.pessoas, 2, 'quem não abriu a app nos últimos 7 dias fica de fora');
  assert.equal(p.eventos, 9);
  const v = Object.fromEntries(p.versoes.map((x) => [`${x.plataforma} ${x.versao}`, x]));
  assert.equal(v['ios 4.6.4'].falhas, 2);
  assert.equal(v['ios 4.7.0'].crashes, 1);
  assert.equal(v['web 4.7.0'].erros, 1);
  assert.deepEqual(p.falhas, [{ tipo: 'cdn-recusou', n: 2 }]);
  const cache = p.som.find((s) => s.origem === 'cache');
  assert.deepEqual([cache.n, Number(cache.mediana)], [2, 200]);
  assert.equal(p.erros.length, 2);
  const joao = p.aparelhos.find((a) => a.nome === 'Joao');
  assert.equal(Number(joao.cpuAtras), 4, 'a média do CPU em segundo plano');
  assert.equal(joao.crashes, 1);
});

await caso('a janela fica entre 1 e 30 dias', async () => {
  assert.equal((await painel(1, 999)).dias, 30);
  assert.equal((await painel(1, 0)).dias, 1);
  assert.equal((await painel(1, 999)).pessoas, 2, 'quem só abriu há 40 dias fica fora até dos 30');
});

await caso('anónimos não chamam as funções', async () => {
  await db.exec('reset role; set role anon;');
  let erro = null;
  try { await q('select public.painel_de_saude(7)'); } catch (e) { erro = e; }
  assert.ok(erro && /permission denied/.test(erro.message));
});

await caso('na app, a entrada só aparece na conta de quem gere', async () => {
  const lerSrc = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  for (const f of ['src/screens/SettingsScreen.tsx', 'src/desktop/paginas/SettingsPage.web.tsx']) {
    const s = lerSrc(f);
    assert.match(s, /void souAdministrador\(contaDoPainel\)/, `${f}: pergunta ao servidor`);
    assert.match(s, /\{administrador \? </, `${f}: sem resposta, sem entrada`);
  }
  const api = lerSrc('src/api/painelDeSaude.ts');
  assert.match(api, /!error && data === true/, 'sem a migração (erro), não é administrador');
});

if (falhas) { console.error(`Painel de saúde (SQL): ${falhas} falharam.`); process.exitCode = 1; }
else console.log('Painel de saúde (SQL): passou.');

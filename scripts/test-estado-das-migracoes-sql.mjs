/**
 * O `marcas_em_falta` (supabase/estado-das-migracoes.sql), numa base de dados a
 * sério (PGlite): cada forma de marca responde "está" quando o objeto existe e
 * "falta" quando não, uma marca mal escrita conta como falta, e o papel anónimo
 * pode perguntar (é o que o scripts/verificar-migracoes.ts usa).
 *
 * Correr: node scripts/test-estado-das-migracoes-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
let falhas = 0;
async function caso(nome, fn) {
  try { await db.exec('reset role;'); await fn(); console.log(`  ok - ${nome}`); }
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
await db.exec(ler('social-setup.sql'));
await db.exec(ler('ouvir-juntos.sql'));
await db.exec(ler('passa-o-aux.sql'));
await db.exec(ler('jam-passa-o-anfitriao.sql'));
await db.exec(ler('listening-stats.sql'));
await db.exec(ler('estado-das-migracoes.sql'));
await db.exec(ler('estado-das-migracoes.sql')); // repetível
await db.exec('grant all on all tables in schema public to authenticated;');
await db.exec('revoke insert on public.tracks from authenticated;');
await db.exec(`alter table public.playlists add constraint teste_nome check (name <> 'proibido');`);

const emFalta = async (marcas, papel = null) => {
  if (papel) await db.exec(`set role ${papel};`);
  const r = await db.query('select public.marcas_em_falta($1) as f', [marcas]);
  await db.exec('reset role;');
  return r.rows[0].f;
};

await caso('o que existe não falta; o que não existe falta', async () => {
  const existem = [
    'fn:passar_ou_fechar_sessao',
    'fn:passar_ou_fechar_sessao(uuid,uuid)',
    'fn:juntar_a_fila(uuid,jsonb,boolean)',
    'tab:listening_sessions',
    'col:listening_sessions.aux_de',
    'pol:plays:plays: ler as próprias',
    "con:playlists.teste_nome~proibido",
    'txt:juntar_a_fila~aux_de',
    'rev:tracks:INSERT',
  ];
  assert.deepEqual(await emFalta(existem), []);
  const naoExistem = [
    'fn:nao_existe',
    'fn:passar_ou_fechar_sessao(uuid)',
    'tab:nao_existe',
    'col:listening_sessions.nao_existe',
    'pol:plays:outra politica',
    'con:playlists.teste_nome~outra coisa',
    'txt:juntar_a_fila~texto que nao esta la',
    'pub:shared_items',
    'rev:playlists:INSERT',
  ];
  assert.deepEqual(await emFalta(naoExistem), naoExistem);
});

await caso('uma marca mal escrita conta como falta, e não parte as outras', async () => {
  assert.deepEqual(await emFalta(['xyz:qualquer', 'fn:nome((', 'tab:listening_sessions']), ['xyz:qualquer', 'fn:nome((']);
});

await caso('o papel anónimo e o autenticado podem perguntar', async () => {
  assert.deepEqual(await emFalta(['tab:listening_sessions', 'tab:nao_existe'], 'anon'), ['tab:nao_existe']);
  assert.deepEqual(await emFalta(['tab:listening_sessions'], 'authenticated'), []);
});

await caso('mais de 200 marcas é recusado', async () => {
  await assert.rejects(emFalta(Array.from({ length: 201 }, (_, i) => `tab:t${i}`)), /Demasiadas marcas/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('Estado das migrações (SQL): passou.');

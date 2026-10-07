/**
 * Ensaio em PGlite de supabase/presenca-mais-longa.sql (7/10): a mesma
 * publicação da presença-com-fila, com a validade a 300 s em vez de 120, e a
 * marca que a app procura para espaçar os batimentos.
 *
 * Correr: node scripts/test-presenca-mais-longa-sql.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (n) => fs.readFileSync(new URL(`../supabase/${n}`, import.meta.url), 'utf8');
const db = new PGlite();
const U = '11111111-1111-1111-1111-111111111111';
const S = '22222222-2222-2222-2222-222222222222';

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key);
  insert into public.profiles values ('${U}');
  create table public.friendships (user_id_1 uuid, user_id_2 uuid, status text);
`);
for (const f of ['social-presence.sql', 'presenca-online-so-em-primeiro-plano.sql', 'presenca-com-posicao.sql', 'presenca-com-fila.sql']) {
  await db.exec(ler(f));
}
await db.exec(ler('estado-das-migracoes.sql'));

const MARCA = 'txt:publish_social_presence~300 seconds';
const emFalta = async () => (await db.query('select public.marcas_em_falta($1::text[]) as m', [[MARCA]])).rows[0].m;
assert.deepEqual(await emFalta(), [MARCA], 'antes da migração a marca falta (a app bate de 75 em 75 s)');

await db.exec(ler('presenca-mais-longa.sql'));
await db.exec(ler('presenca-mais-longa.sql')); // idempotente
assert.deepEqual(await emFalta(), [], 'depois, a app vê-a e espaça os batimentos');

await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
let seq = 0;
const publicar = (ativo, faixa, fim = false) => db.query(
  `select public.publish_social_presence('pc', '${S}', $1, $2, $3::jsonb, $4)`,
  [++seq, ativo, faixa ? JSON.stringify(faixa) : null, fim],
);
const presenca = async () => (await db.query(
  `select extract(epoch from online_until - last_seen_at) as online, extract(epoch from playing_until - last_seen_at) as musica,
          currently_playing as c from public.social_presence where user_id = '${U}'`)).rows[0];

const faixa = { source: 'youtube', sourceId: 'x', title: 'X', artist: 'Y', positionMs: 1000, rate: 1, aSeguir: [{ source: 'youtube', sourceId: 'a', title: 'A' }] };
await publicar(true, faixa);
let p = await presenca();
assert.ok(Math.abs(Number(p.online) - 300) < 2, `online por 300 s (${p.online})`);
assert.ok(Math.abs(Number(p.musica) - 300) < 2, `a música por 300 s (${p.musica})`);
assert.equal(p.c.positionMs, 1000, 'a posição continua a viajar');
assert.deepEqual(p.c.aSeguir.map((x) => x.sourceId), ['a'], 'e as próximas');

// Em segundo plano a tocar: o online acaba logo, a música continua.
await publicar(false, faixa);
p = await presenca();
assert.ok(Number(p.online ?? 0) <= 0.5, 'escondida, deixa de estar online já');
assert.ok(Math.abs(Number(p.musica) - 300) < 2, 'mas a música continua anunciada');

// Sair: acaba tudo logo, sem esperar pela validade.
await publicar(false, null, true);
p = await presenca();
assert.ok(Number(p.online ?? 0) <= 0.5 && Number(p.musica ?? 0) <= 0.5, 'ao sair não fica aceso');

// A app: procura esta mesma marca, e bate abaixo da validade com folga.
const cliente = fs.readFileSync(new URL('../src/lib/presenceSync.ts', import.meta.url), 'utf8');
assert.match(cliente, /const MARCA_DA_VALIDADE_LONGA='txt:publish_social_presence~300 seconds';/);
const batimento = Number(/const BATIMENTO_COM_VALIDADE_LONGA_MS=(\d[\d_]*);/.exec(cliente)[1].replace(/_/g, ''));
// Escondido, o Chromium só acorda de minuto a minuto: o batimento cai até 60 s depois.
assert.ok(batimento + 60_000 <= 300_000, `o batimento (${batimento} ms) cabe na validade mesmo atrasado`);
assert.match(cliente, /let batimentoMs=PRESENCE_PUBLISH_MS;/, 'até saber, bate como antes (75 s)');
const handoff = fs.readFileSync(new URL('../src/lib/handoff.ts', import.meta.url), 'utf8');
const hb = Number(/SESSION_HEARTBEAT_MS = (\d+) \* 1000/.exec(handoff)[1]) * 1000;
assert.ok(hb <= 3 * 60_000 - 30_000, `o batimento do handoff (${hb} ms) fica abaixo do TTL de 3 min das versões antigas`);

console.log('Presença mais longa (SQL): passou.');

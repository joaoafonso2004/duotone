/**
 * Ensaio em PGlite de supabase/presenca-com-fila.sql: a presença leva as
 * próximas (até cinco, validadas, só o que se desenha), e mexer nelas não conta
 * como "mudou de música".
 *
 * Correr: node scripts/test-presenca-com-fila-sql.mjs
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
await db.exec(ler('social-presence.sql'));
await db.exec(ler('presenca-online-so-em-primeiro-plano.sql'));
await db.exec(ler('presenca-com-posicao.sql'));
await db.exec(ler('presenca-com-fila.sql'));
await db.exec(ler('presenca-com-fila.sql')); // idempotente
await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);

let seq = 0;
const publicar = (faixa) => db.query(
  `select public.publish_social_presence('pc', '${S}', $1, true, $2::jsonb, false)`,
  [++seq, JSON.stringify(faixa)],
);
const ler1 = async () => (await db.query(`select currently_playing as c from public.social_presence where user_id = '${U}'`)).rows[0].c;
const mudou = async () => (await db.query(`select playing_changed_at as t from public.social_presence_sessions where user_id = '${U}'`)).rows[0].t.getTime();

const f = (id) => ({ source: 'youtube', sourceId: id, title: id, artist: 'X', artworkUrl: null, durationSeconds: 200 });
const base = { ...f('atual'), positionMs: 1000, rate: 1 };

await publicar({ ...base, aSeguir: [f('a'), { ...f('b'), album: 'fora', segredo: 'nao' }, f('c'), f('d'), f('e'), f('f'), f('g')] });
let c = await ler1();
assert.deepEqual(c.aSeguir.map((x) => x.sourceId), ['a', 'b', 'c', 'd', 'e'], 'até cinco, pela ordem');
assert.equal(c.aSeguir[1].album, undefined, 'só o que se desenha');
assert.equal(c.aSeguir[1].segredo, undefined);
assert.equal(c.positionMs, 1000, 'a posição continua lá');
const antes = await mudou();

await new Promise((r) => setTimeout(r, 20));
await publicar({ ...base, positionMs: 5000, aSeguir: [f('z')] });
assert.deepEqual((await ler1()).aSeguir.map((x) => x.sourceId), ['z'], 'a fila nova chega');
assert.equal(await mudou(), antes, 'mas mexer na fila não é mudar de música');

await publicar({ ...base, aSeguir: [{ source: 'local', sourceId: 'x', title: 'y' }, 'lixo', { ...f('ok') }] });
assert.deepEqual((await ler1()).aSeguir.map((x) => x.sourceId), ['ok'], 'as que não passam as regras ficam de fora');

await publicar({ ...base, aSeguir: 'nao e lista' });
assert.equal((await ler1()).aSeguir, undefined, 'sem lista, sem próximas');

await new Promise((r) => setTimeout(r, 20));
await publicar({ ...f('outra'), positionMs: 0 });
assert.notEqual(await mudou(), antes, 'mudar de música continua a contar');

console.log('Presença com as próximas (SQL): passou.');

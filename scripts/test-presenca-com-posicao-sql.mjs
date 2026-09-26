/**
 * Ensaio em PGlite de supabase/presenca-com-posicao.sql: a faixa da presença
 * guarda a posição e a velocidade (só números com juízo), e uma posição nova
 * não conta como "mudou de música".
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
await db.exec(ler('presenca-com-posicao.sql')); // idempotente
await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);

let seq = 0;
const publicar = (faixa) => db.query(
  `select public.publish_social_presence('pc', '${S}', $1, true, $2::jsonb, false)`,
  [++seq, JSON.stringify(faixa)],
);
const ler1 = async () => (await db.query(`select currently_playing as c from public.social_presence where user_id = '${U}'`)).rows[0].c;
const mudou = async () => (await db.query(`select playing_changed_at as t from public.social_presence_sessions where user_id = '${U}'`)).rows[0].t.getTime();

const base = { source: 'youtube', sourceId: 'abc', title: 'Nana', artist: 'Bispo', durationSeconds: 200 };
await publicar({ ...base, positionMs: 12345.6, rate: 1.1 });
let c = await ler1();
assert.equal(c.positionMs, 12346, 'a posição entra, arredondada');
assert.equal(Number(c.rate), 1.1, 'e a velocidade');
assert.equal(c.isPlaying, true);
const antes = await mudou();

await new Promise((r) => setTimeout(r, 20));
await publicar({ ...base, positionMs: 90000, rate: 1.1 });
assert.equal((await ler1()).positionMs, 90000, 'a posição nova chega');
assert.equal(await mudou(), antes, 'mas não conta como mudar de música');

await publicar({ ...base, positionMs: -5, rate: 99, extra: 'nao' });
c = await ler1();
assert.equal(c.positionMs, undefined, 'posição sem juízo fica de fora');
assert.equal(c.rate, undefined, 'velocidade sem juízo fica de fora');
assert.equal(c.extra, undefined, 'e o resto continua filtrado');

await new Promise((r) => setTimeout(r, 20));
await publicar({ ...base, sourceId: 'outra', positionMs: 0 });
assert.notEqual(await mudou(), antes, 'mudar de música continua a contar');

console.log('Presença com posição (SQL): passou.');

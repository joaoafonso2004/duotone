/**
 * Ensaio em PGlite de supabase/presenca-quinze-minutos.sql (17/10): o online
 * vale 900 s por publicação, a música só até ao fim dela (mais 2 min, e nunca
 * mais de 900 s), a marca da migração anterior continua lá, e a app só bate de
 * 10 em 10 min depois de ver a marca nova.
 *
 * Correr: node scripts/test-presenca-quinze-minutos-sql.mjs
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
for (const f of ['social-presence.sql', 'presenca-online-so-em-primeiro-plano.sql', 'presenca-com-posicao.sql',
  'presenca-com-fila.sql', 'presenca-mais-longa.sql', 'estado-das-migracoes.sql']) {
  await db.exec(ler(f));
}

const M300 = 'txt:publish_social_presence~300 seconds';
const M900 = 'txt:publish_social_presence~900 seconds';
const emFalta = async () => (await db.query('select public.marcas_em_falta($1::text[]) as m', [[M300, M900]])).rows[0].m;
assert.deepEqual(await emFalta(), [M900], 'antes: só a validade de 300 s');

await db.exec(ler('presenca-quinze-minutos.sql'));
await db.exec(ler('presenca-quinze-minutos.sql')); // idempotente
assert.deepEqual(await emFalta(), [], 'depois: a nova, e a de 300 s continua dada como aplicada');

await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
let seq = 0;
const publicar = (ativo, faixa, fim = false) => db.query(
  `select public.publish_social_presence('pc', '${S}', $1, $2, $3::jsonb, $4)`,
  [++seq, ativo, faixa ? JSON.stringify(faixa) : null, fim],
);
const presenca = async () => (await db.query(
  `select extract(epoch from online_until - last_seen_at) as online, extract(epoch from playing_until - last_seen_at) as musica,
          currently_playing as c from public.social_presence where user_id = '${U}'`)).rows[0];
const perto = (valor, esperado, o) => assert.ok(Math.abs(Number(valor) - esperado) < 2, `${o}: ${valor} (esperado ${esperado})`);

const faixa = { source: 'youtube', sourceId: 'x', title: 'X', artist: 'Y', durationSeconds: 200, positionMs: 20_000, rate: 1,
  aSeguir: [{ source: 'youtube', sourceId: 'a', title: 'A' }] };

await publicar(true, faixa);
let p = await presenca();
perto(p.online, 900, 'online por 900 s');
perto(p.musica, 180 + 120, 'a música até ao fim dela, mais 2 min');
assert.equal(p.c.positionMs, 20_000, 'a posição continua a viajar');
assert.deepEqual(p.c.aSeguir.map((x) => x.sourceId), ['a'], 'e as próximas');

await publicar(true, { ...faixa, rate: 2 });
perto((await presenca()).musica, 90 + 120, 'ao dobro da velocidade acaba em metade do tempo');

await publicar(true, { ...faixa, durationSeconds: 3600, positionMs: 0 });
perto((await presenca()).musica, 900, 'uma música longa fica pela validade (o batimento renova-a)');

await publicar(true, { ...faixa, positionMs: 250_000 });
perto((await presenca()).musica, 120, 'já passou do fim (duração errada): sobram os 2 min de folga');

await publicar(true, { source: 'youtube', sourceId: 'y', title: 'Y' });
perto((await presenca()).musica, 900, 'sem duração nem posição, a validade inteira');

// Em segundo plano a tocar: o online acaba logo, a música continua até ao fim dela.
await publicar(false, faixa);
p = await presenca();
assert.ok(Number(p.online ?? 0) <= 0.5, 'escondida, deixa de estar online já');
perto(p.musica, 300, 'mas a música continua anunciada até ao fim');

// À frente sem música: online, sem música.
await publicar(true, null);
p = await presenca();
perto(p.online, 900, 'online sem música');
assert.equal(p.c, null, 'e sem nada a tocar');

// Sair: acaba tudo logo.
await publicar(false, null, true);
p = await presenca();
assert.ok(Number(p.online ?? 0) <= 0.5 && Number(p.musica ?? 0) <= 0.5, 'ao sair não fica aceso');

// A app: procura esta marca, e o batimento, mesmo atrasado, cabe na validade.
const cliente = fs.readFileSync(new URL('../src/lib/presenceSync.ts', import.meta.url), 'utf8');
assert.match(cliente, /const MARCA_DOS_QUINZE_MINUTOS='txt:publish_social_presence~900 seconds';/);
const num = (nome) => Number(new RegExp(`const ${nome}=(\\d[\\d_]*);`).exec(cliente)[1].replace(/_/g, ''));
const batimento = num('BATIMENTO_COM_QUINZE_MINUTOS_MS');
const ver = num('VER_O_BATIMENTO_MS');
// Visto de minuto a minuto, e escondido o Chromium acorda de minuto a minuto: até 2 min de atraso.
assert.ok(batimento + ver + 60_000 <= 900_000, `o batimento (${batimento} ms) cabe na validade mesmo atrasado`);
assert.match(cliente, /setInterval\(baterSeDevido, VER_O_BATIMENTO_MS\)/, 'vê de minuto a minuto, e não ao ritmo do batimento');
assert.match(cliente, /p_marcas: \[MARCA_DA_VALIDADE_LONGA, MARCA_DOS_QUINZE_MINUTOS\]/, 'uma pergunta só, pelas duas marcas');
assert.match(fs.readFileSync(new URL('../src/lib/migracoes.ts', import.meta.url), 'utf8'),
  /ficheiro: 'presenca-quinze-minutos\.sql', marca: 'txt:publish_social_presence~900 seconds'/);

console.log('Presença de quinze minutos (SQL): passou.');

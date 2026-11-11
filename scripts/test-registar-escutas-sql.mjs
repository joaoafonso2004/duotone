// supabase/registar-escutas.sql num Postgres a sério (PGlite) (11/11): o lote
// da escuta (catálogo, escutas, começadas e contagens) num só pedido, tudo ou
// nada, e repetir o mesmo lote não duplica nada.
//
// Correr: node scripts/test-registar-escutas-sql.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const raiz = new URL('../supabase/', import.meta.url);
const ler = (nome) => fs.readFileSync(new URL(nome, raiz), 'utf8').replace('create extension if not exists "pgcrypto";', '');
const db = new PGlite({ extensions: { pgcrypto } });
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args);
const como = (n) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${n ? uid(n) : ''}', false)`);
const comoServidor = () => db.exec('reset role');

await db.exec('create extension if not exists pgcrypto;');
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, encrypted_password text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  grant usage on schema auth, public to authenticated, anon;`);
for (const f of ['schema.sql', 'listening-stats.sql', 'contar-so-o-ouvido.sql']) await db.exec(ler(f));
await db.exec('grant all on all tables in schema public to authenticated');
const migracao = ler('registar-escutas.sql');
await db.exec(migracao);
await db.exec(migracao);
console.log('migração corrida duas vezes: ok');

for (let n = 1; n <= 2; n++) {
  await q('insert into auth.users values ($1, $2, $3, null)', [uid(n), `p${n}@example.test`, { name: `Pessoa ${n}`, username: `pessoa${n}` }]);
}
const contar = async (tabela, conta) => Number((await q(`select count(*) as n from public.${tabela} where user_id = $1`, [uid(conta)])).rows[0].n);

const faixa = (id, extra = {}) => ({ source: 'youtube', sourceId: id, title: `Faixa ${id}`, artist: 'Artista', durationSeconds: 200, ...extra });
const agora = Date.now();
const iso = (menosMin) => new Date(agora - menosMin * 60_000).toISOString();
const delta = (id, seq) => ({ ...faixa(id), artworkUrl: null, count: 1, lastPlayed: agora, operationDevice: 'aparelho-de-teste', operationSequence: seq });
const registar = async (lote) => (await q('select public.registar_escutas($1) as r', [lote])).rows[0].r;

// --- Sem sessão, nada -------------------------------------------------------
await como(null);
await assert.rejects(registar({ escutas: [] }), /Sessão necessária/);
await db.exec('reset role; set role anon');
await assert.rejects(registar({ escutas: [] }), /permission denied/, 'o anon nem a pode chamar');
console.log('sem sessão: recusado');

// --- Uma faixa que já está no catálogo não muda -----------------------------
await como(1);
await q('select * from public.upsert_catalog_tracks($1)', [[faixa('a', { title: 'Título original' })]]);

// --- O lote inteiro num pedido ---------------------------------------------
const lote = {
  faixas: [faixa('a', { title: 'Outro título' }), faixa('b')],
  escutas: [{ source: 'youtube', sourceId: 'a', em: iso(12) }, { source: 'youtube', sourceId: 'b', em: iso(8) }],
  comecadas: [
    { source: 'youtube', sourceId: 'a', em: iso(15) },
    { source: 'youtube', sourceId: 'b', em: iso(11) },
    { source: 'youtube', sourceId: 'b', em: iso(9) },
  ],
  contagens: [delta('a', 1), delta('b', 2)],
};
assert.deepEqual(await registar(lote), { escutas: 2, comecadas: 2 });
assert.equal(await contar('plays', 1), 2, 'as duas escutas');
assert.equal(await contar('faixas_comecadas', 1), 2, 'uma linha por faixa começada');
const b = (await q(`select f.comecada_em from faixas_comecadas f join tracks t on t.id = f.track_id where t.source_id = 'b'`)).rows[0];
assert.equal(new Date(b.comecada_em).toISOString(), iso(9), 'a começada guarda a última vez');
const contagens = (await q('select source_id, play_count from user_play_counts where user_id = $1 order by source_id', [uid(1)])).rows;
assert.deepEqual(contagens.map((r) => [r.source_id, r.play_count]), [['a', 1], ['b', 1]], 'as contagens');
assert.equal((await q(`select title from tracks where source_id = 'a'`)).rows[0].title, 'Título original', 'o catálogo não troca o que já lá está');
assert.equal((await q(`select count(*) as n from tracks`)).rows[0].n, 2, 'a faixa nova entrou no catálogo');
const hora = (await q(`select p.played_at from plays p join tracks t on t.id = p.track_id where t.source_id = 'a'`)).rows[0];
assert.equal(new Date(hora.played_at).toISOString(), iso(12), 'a escuta guarda a hora a que se ouviu, não a do envio');
console.log('o lote inteiro num pedido: ok');

// --- A resposta perdeu-se e a app manda o mesmo lote ------------------------
assert.deepEqual(await registar(lote), { escutas: 0, comecadas: 2 });
assert.equal(await contar('plays', 1), 2, 'as escutas não se duplicam');
assert.equal(await contar('faixas_comecadas', 1), 2);
assert.equal((await q(`select play_count from user_play_counts where source_id = 'a' and user_id = $1`, [uid(1)])).rows[0].play_count, 1,
  'as contagens não voltam a somar');
// A mesma faixa ouvida outra vez, a outra hora, conta.
await registar({ faixas: [faixa('a')], escutas: [{ source: 'youtube', sourceId: 'a', em: iso(1) }], contagens: [delta('a', 3)] });
assert.equal(await contar('plays', 1), 3, 'outra escuta da mesma faixa entra');
assert.equal((await q(`select play_count from user_play_counts where source_id = 'a' and user_id = $1`, [uid(1)])).rows[0].play_count, 2);
console.log('repetir o lote não duplica: ok');

// --- Uma escuta que não se percebe fica de fora, sem prender o lote ---------
const antes = await contar('plays', 1);
assert.deepEqual(await registar({
  faixas: [faixa('c')],
  escutas: [
    { source: 'youtube', sourceId: 'c', em: 'ontem' },
    { source: 'youtube', sourceId: 'c', em: '1999-01-01T00:00:00.000Z' },
    { source: 'youtube', sourceId: 'c', em: new Date(agora + 3 * 86_400_000).toISOString() },
    { source: 'youtube', sourceId: 'nao-esta-no-catalogo', em: iso(2) },
    { source: 'youtube', sourceId: 'c', em: iso(2) },
  ],
}), { escutas: 1, comecadas: 0 });
assert.equal(await contar('plays', 1), antes + 1, 'só a que se percebe');
console.log('escutas inválidas ficam de fora: ok');

// --- Tudo ou nada -----------------------------------------------------------
const antesDoMau = await contar('plays', 1);
await assert.rejects(registar({
  faixas: [faixa('d'), { source: 'youtube', sourceId: 'e', title: '' }],
  escutas: [{ source: 'youtube', sourceId: 'd', em: iso(1) }],
}), /Metadados de música inválidos/);
assert.equal(await contar('plays', 1), antesDoMau, 'um catálogo recusado não deixa meio lote escrito');
await assert.rejects(registar({ escutas: Array.from({ length: 201 }, () => ({ source: 'youtube', sourceId: 'a', em: iso(1) })) }),
  /Lote de escutas inválido/, 'um teto por lote');
await assert.rejects(registar({ escutas: {} }), /Lote de escutas inválido/);
console.log('tudo ou nada, e os tetos: ok');

// --- Cada um escreve só no seu ---------------------------------------------
await como(2);
await registar({ faixas: [faixa('a')], escutas: [{ source: 'youtube', sourceId: 'a', em: iso(12) }] });
assert.equal(await contar('plays', 2), 1, 'a mesma faixa e hora de outra conta é outra escuta');
await comoServidor();
assert.equal(await contar('plays', 1), 4);
console.log('cada conta no seu: ok');

// --- Sem a tabela das começadas, o resto entra ------------------------------
await db.exec('drop table public.faixas_comecadas');
await como(1);
assert.deepEqual(await registar({
  faixas: [faixa('f')],
  escutas: [{ source: 'youtube', sourceId: 'f', em: iso(1) }],
  comecadas: [{ source: 'youtube', sourceId: 'f', em: iso(3) }],
}), { escutas: 1, comecadas: 0 });
console.log('sem o contar-so-o-ouvido.sql: as escutas entram na mesma');

console.log('\nTodos os casos passaram.');

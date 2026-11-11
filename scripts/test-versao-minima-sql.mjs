// supabase/versao-minima.sql num Postgres a sério (PGlite) (12/11): o
// "pre-request" do PostgREST recusa as versões da app que não mandam o
// cabeçalho `x-duotone-versao` (até à 5.8.6) e as abaixo da mínima, com 426.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = readFileSync(new URL('../supabase/versao-minima.sql', import.meta.url), 'utf8');

await db.exec(`create role anon; create role authenticated; create role service_role; create role authenticator;`);

// A migração, duas vezes (tem de se poder correr outra vez).
await db.exec(sql);
await db.exec(sql);
console.log('migração corrida duas vezes: ok');

/** Um pedido como o PostgREST o prepara: os cabeçalhos e o papel do JWT. */
async function pedido({ versao, papel = 'authenticated' } = {}) {
  const cabecalhos = versao === undefined ? {} : { 'x-duotone-versao': versao };
  await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(cabecalhos)]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: papel })]);
  await db.exec(`set role ${papel}`);
  try {
    await db.query('select public.recusar_versoes_antigas()');
    return null;
  } catch (e) {
    return e;
  } finally {
    await db.exec('reset role');
  }
}

const recusado = (e, como) => {
  assert.ok(e, `${como}: devia ser recusado`);
  assert.equal(e.code, 'PGRST', `${como}: o PostgREST usa o código PGRST para o estado HTTP`);
  assert.equal(JSON.parse(e.detail).status, 426, `${como}: 426 Upgrade Required`);
  assert.match(JSON.parse(e.message).message, /no longer supported\. Update the app/, `${como}: a mensagem`);
};

recusado(await pedido(), 'sem o cabeçalho (a 5.8.6 e anteriores)');
recusado(await pedido({ papel: 'anon' }), 'sem sessão e sem cabeçalho');
recusado(await pedido({ versao: '5.8.6' }), 'abaixo da mínima');
recusado(await pedido({ versao: 'lixo' }), 'um cabeçalho que não é uma versão');
recusado(await pedido({ versao: '' }), 'um cabeçalho vazio');
assert.equal(await pedido({ versao: '5.8.8' }), null, 'a mínima passa');
assert.equal(await pedido({ versao: '5.9.2' }), null, 'acima passa');
assert.equal(await pedido({ versao: '5.10.0' }), null, 'compara números, não texto');
assert.equal(await pedido({ versao: '6.0.0' }), null);
assert.equal(await pedido({ papel: 'service_role' }), null, 'o painel e o servidor passam sempre');
console.log('quem passa e quem não passa: ok');

// O PostgREST é que a chama: fica no papel `authenticator`.
const r = await db.query(`
  select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator'`);
assert.ok(r.rows.some((l) => l.setconfig.includes('pgrst.db_pre_request=public.recusar_versoes_antigas')),
  'o authenticator chama a função antes de cada pedido');
console.log('ligada ao PostgREST: ok');

const texto = sql.replace(/\r\n/g, '\n');
assert.match(texto, /alter role authenticator reset pgrst\.db_pre_request;/, 'diz como se desliga');
console.log('\nVersão mínima no Supabase: as antigas recebem 426, as novas e o servidor passam.');

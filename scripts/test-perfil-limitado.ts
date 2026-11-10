/**
 * O perfil de quem não é amigo, com informação limitada (10/11,
 * supabase/perfil-limitado.sql, lib/perfilLimitado.ts).
 *
 * Correr: node --experimental-strip-types scripts/test-perfil-limitado.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { desdeQuando, quantoOuviu, ultimaEscuta } from '../src/lib/perfilLimitado.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const agora = Date.UTC(2026, 10, 10, 15);
const n = (extra: object = {}) => ({ memberSince: '2026-09-04', totalPlays: 1240, uniqueTracks: 310, lastPlayedOn: '2026-11-10', ...extra });

console.log('\nas frases');
caso('desde quando, e quanto ouviu, com milhares', () => {
  assert.equal(desdeQuando(n()), 'Joined Sep 2026');
  assert.equal(quantoOuviu(n()), '1,240 plays · 310 songs');
  assert.equal(quantoOuviu(n({ totalPlays: 1, uniqueTracks: 1 })), '1 play · 1 song');
  assert.equal(quantoOuviu(n({ totalPlays: 0, uniqueTracks: 0 })), 'No songs played yet', 'quem entrou e nunca ouviu nada também se vê');
});
caso('a última escuta, pelo dia', () => {
  assert.equal(ultimaEscuta(n(), agora), 'Listened today');
  assert.equal(ultimaEscuta(n({ lastPlayedOn: '2026-11-09' }), agora), 'Listened yesterday');
  assert.equal(ultimaEscuta(n({ lastPlayedOn: '2026-11-07' }), agora), 'Listened 3 days ago');
  assert.equal(ultimaEscuta(n({ lastPlayedOn: '2026-10-02' }), agora), 'Last listened on 2 Oct');
  assert.equal(ultimaEscuta(n({ lastPlayedOn: null }), agora), null);
  assert.equal(ultimaEscuta(n({ totalPlays: 0 }), agora), null);
});

console.log('\no servidor');
const sql = ler('supabase/perfil-limitado.sql');
caso('só números, e só para quem não pode ver o resto', () => {
  assert.match(sql, /'limited',case when not permitido then \(/);
  assert.match(sql, /select case when pr\.estatisticas_publicas then jsonb_build_object\(/, 'quem escondeu não mostra nada');
  for (const campo of ['memberSince', 'totalPlays', 'uniqueTracks', 'lastPlayedOn']) assert.ok(sql.includes(`'${campo}'`), campo);
  assert.match(sql, /max\(c\.last_played\)::date/, 'o dia, e não a hora');
  const limitado = sql.slice(sql.indexOf("'limited'"), sql.indexOf("'statsPublic'"));
  assert.doesNotMatch(limitado, /title|artist|currently_playing|playlist/, 'nunca que músicas, artistas ou o que está a tocar');
});
caso('o resto do perfil fica igual ao de antes, e a escolha muda só a própria', () => {
  assert.match(sql, /'appearance',case when permitido then/);
  assert.match(sql, /'stats',case when permitido then/);
  assert.match(sql, /update public\.profiles set estatisticas_publicas = coalesce\(p_publicas, true\) where id = auth\.uid\(\);/);
  assert.match(sql, /'statsPublic',case when target_user_id=auth\.uid\(\) then/);
  assert.match(ler('src/lib/migracoes.ts'), /ficheiro: 'perfil-limitado\.sql', marca: 'fn:definir_estatisticas_publicas'/);
});

console.log('\na app');
caso('o perfil de quem não é amigo mostra os números, e diz que o resto é para amigos', () => {
  const v = ler('src/components/SocialProfileView.tsx');
  assert.match(v, /\{!profile\.canView\?\(profile\.limited\?<View/);
  assert.match(v, /quantoOuviu\(profile\.limited\)/);
  assert.match(v, /Become friends to see what they listen to\./);
});
caso('o interruptor está no Edit profile, grava logo e volta atrás se falhar', () => {
  const ed = ler('src/components/ProfileEditor.tsx');
  assert.match(ed, /\{numerosPublicos!==null&&<Grupo cabecalho="Privacy"/, 'sem a migração não aparece');
  assert.match(ed, /void definirEstatisticasPublicas\(v\)\.catch\(\(\)=>\{setNumerosPublicos\(antes\);/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

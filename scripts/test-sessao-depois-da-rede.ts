/**
 * A sessão volta quando a rede volta (26/11, a 7.2.0 "não tá a dar" no iPhone):
 * sem sessão por falta de rede no arranque, a app ficava em "Offline" até o
 * relógio do supabase-js tentar outra vez. Agora volta a ler a sessão quando a
 * rede volta, quando a app volta à frente e aos 2, 6 e 15 s -- e nunca sai da
 * conta por isso.
 *
 * Correr: node --experimental-strip-types scripts/test-sessao-depois-da-rede.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const a = readFileSync(new URL('../src/state/auth.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const init = a.slice(a.indexOf('  init: () => {'), a.indexOf('  refreshSession:'));

// Só sem sessão e com a conta do aparelho à espera (o modo offline).
assert.match(init, /const semSessao=\(\)=>Platform\.OS==='ios'&&!useAuth\.getState\(\)\.session&&!!useAuth\.getState\(\)\.offlineUserId;/);
// Quando a rede volta, quando a app volta à frente, e aos 2, 6 e 15 s.
assert.match(init, /useConnectivity\.subscribe\(\(s,antes\)=>\{if\(antes\.offline&&!s\.offline\)tentar\(\);\}\)/);
assert.match(init, /AppState\.addEventListener\('change',estado=>\{if\(estado==='active'\)tentar\(\);\}\)/);
assert.match(init, /\[2000,6000,15000\]\.map\(ms=>setTimeout\(tentar,ms\)\)/);
// Só lê a sessão: nunca sai da conta daqui (sem rede, a conta do aparelho abre os downloads).
const tentar = init.slice(init.indexOf('const tentar='), init.indexOf('const tentativas='));
assert.match(tentar, /supabase\.auth\.getSession\(\)/);
assert.doesNotMatch(tentar, /session:null|signOut|removeItem/);
// E larga tudo ao sair.
assert.match(init, /unsubscribeAuth=\(\)=>\{subscription\.unsubscribe\(\);for\(const t of tentativas\)clearTimeout\(t\);rede\(\);frente\.remove\(\);\};/);

console.log('A sessão volta a ser lida quando a rede volta, sem nunca sair da conta.');

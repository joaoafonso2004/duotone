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
const init = a.slice(a.indexOf('  init: () => {'), a.indexOf('  refreshSession:async'));

// Só sem sessão e com a conta do aparelho à espera (o modo offline).
assert.match(init, /const semSessao=\(\)=>Platform\.OS==='ios'&&!useAuth\.getState\(\)\.session&&!!useAuth\.getState\(\)\.offlineUserId;/);
// Quando a rede volta, quando a app volta à frente, e aos 2, 6 e 15 s.
assert.match(init, /if\(antes\.offline&&!s\.offline\)tentar\(\);\n\s+else if\(!antes\.offline&&s\.offline\)\{clearTimeout\(depoisDeCair\);depoisDeCair=setTimeout\(tentar,2000\);\}/);
assert.match(init, /AppState\.addEventListener\('change',estado=>\{if\(estado==='active'\)tentar\(\);\}\)/);
assert.match(init, /\[2000,6000,15000\]\.map\(ms=>setTimeout\(tentar,ms\)\)/);
// Só lê a sessão: nunca sai da conta daqui (sem rede, a conta do aparelho abre os downloads).
const tentar = init.slice(init.indexOf('const tentar='), init.indexOf('const tentativas='));
assert.match(tentar, /supabase\.auth\.getSession\(\)/);
assert.doesNotMatch(tentar, /session:null|signOut|removeItem/);
// E larga tudo ao sair.
assert.match(init, /unsubscribeAuth=\(\)=>\{subscription\.unsubscribe\(\);for\(const t of tentativas\)clearTimeout\(t\);clearTimeout\(depoisDeCair\);rede\(\);frente\.remove\(\);\};/);

// Com sessão mas o NetInfo a dizer "sem rede": um pedido leve, cuja resposta confirma a ligação.
assert.match(tentar, /if\(semRede\(\)\)\{void supabase\.auth\.getUser\(\)\.catch\(\(\)=>\{\}\);return;\}/);

// Uma resposta do Supabase prova que há internet, mesmo com o teste do Google a falhar.
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const c = ler('src/state/connectivity.ts');
assert.match(c, /const offline=state\.isConnected===false\|\|\(!confirmado\(\)&&\(state\.isConnected!==true\|\|state\.isInternetReachable!==true\)\);/);
assert.match(c, /const CONFIRMACAO_MS=10\*60\*1000;/);
assert.match(c, /catch\{useConnectivity\.setState\(\{offline:!confirmado\(\),checking:false\}\);\}/);
// O teste de rede é o do iOS (captive.apple.com), e não o do Google, que um DNS anti-revoke pode bloquear.
assert.match(c, /reachabilityUrl:'https:\/\/captive\.apple\.com\/hotspot-detect\.html'/);
assert.match(c, /reachabilityTest:async\(resposta:Response\)=>resposta\.status===200&&\(await resposta\.text\(\)\)\.includes\('Success'\)/);
const f = ler('src/lib/fetchDoSupabase.ts');
assert.match(f, /resposta = await base\(entrada, comAparelho\(init, url, false\)\);/);
assert.match(f, /if \(\(e as Error\)\?\.name !== 'AbortError'\) \{ try \{ aoFalhar\?\.\(\); \}/, 'um pedido sem resposta volta ao que o NetInfo diz');
assert.match(f, /try \{ aoResponder\?\.\(\); \} catch/, 'só as respostas que chegam confirmam');
assert.match(ler('App.tsx'), /\naoChegarRespostaDoSupabase\(confirmarLigacao, desconfirmarLigacao\);\n/);
assert.match(c, /export function desconfirmarLigacao\(\):void\{\n\s+if\(Platform\.OS!=='ios'\|\|!confirmado\(\)\)return;\n\s+confirmadoAte=0;\n\s+if\(ultimo\)receive\(ultimo\);/);

console.log('A sessão volta a ser lida quando a rede volta, sem nunca sair da conta, e uma resposta do Supabase confirma a rede.');

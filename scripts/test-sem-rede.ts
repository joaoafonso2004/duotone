/**
 * A app sem internet (10/11, feedback de um utilizador no comboio: o perfil, a
 * Home e o Social desapareciam, e a mensagem a meio de escrever perdeu-se).
 *
 * A causa: perder a rede corria a mesma limpeza que sair da conta. Agora o que é
 * da conta só se limpa ao trocar de conta, os ecrãs não se escondem, e o perfil,
 * o Social, as conversas e a Home ficam também no aparelho.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-sem-rede.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ultimasMensagens } from '../src/lib/copiaDasConversas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const app = ler('App.tsx');

console.log('\nperder a rede não é sair da conta');
caso('o Social, as cópias do perfil e a Home só se limpam ao trocar de conta', () => {
  const daConta = app.slice(app.indexOf('    if (!userId) return;\n    void hidratarPerfilProprio(userId);'));
  assert.match(daConta, /const pararSocial = iniciarSocial\(userId\);\n\s+return \(\) => \{\n\s+pararSocial\(\);\n\s+limparCachePerfil\(\);/);
  assert.match(daConta, /^[\s\S]*?\}, \[userId\]\);/, 'o efeito depende só da conta');
  const daRede = app.slice(app.indexOf('    if (!userId||offline) return;\n    const pararPresenca'), app.indexOf('  }, [userId,offline]);'));
  for (const nao of ['iniciarSocial', 'limparCachePerfil', 'limparPerfisPublicos', 'esquecerCapasAquecidas']) {
    assert.ok(!daRede.includes(nao), `${nao} não corre ao perder a rede`);
  }
  assert.match(app, /const pararCopia = iniciarCopiaDaHome\(userId\);\n\s+return \(\) => \{pararCopia\(\);useRecomendacoes\.getState\(\)\.limpar\(\);useMisturaDoDia\.getState\(\)\.limpar\(\);\};\n\s+\}, \[userId\]\);/);
});
caso('ao voltar a rede o Social relê', () => {
  assert.match(app, /if \(!estavaSemRede\.current \|\| !userId\) return;\n\s+estavaSemRede\.current = false;\n\s+void useSocial\.getState\(\)\.refresh\(\);/);
});

console.log('\nos ecrãs ficam, com a faixa');
caso('a Home, o perfil e o Social já não se escondem sem rede', () => {
  const nav = ler('src/navigation/RootNavigator.tsx');
  for (const velho of ['OnlineSearch', 'OnlineProfile', 'OnlineSocial', 'OnlineFriendProfile']) assert.ok(!nav.includes(velho), velho);
  assert.match(nav, /pilhaDoSeparador\('Search', SearchScreen\)/);
  assert.match(nav, /<FaixaSemRede \/>/);
});
caso('a faixa diz "No internet connection", só com sessão, e não apanha toques', () => {
  const f = ler('src/components/FaixaSemRede.tsx');
  assert.match(f, /if \(!offline \|\| !comSessao\) return null;/);
  assert.match(f, /pointerEvents="none"/);
  assert.match(f, />No internet connection</);
});
caso('sem rede, uma leitura falhada não é um erro no ecrã', () => {
  assert.match(ler('src/state/social.ts'), /error: useConnectivity\.getState\(\)\.offline \? null : "Couldn't refresh Social/);
  assert.match(ler('src/components/SocialHub.tsx'), /if\(active&&!useConnectivity\.getState\(\)\.offline\)setError/);
  assert.match(ler('src/components/SocialProfileView.tsx'), /if\(id===request\.current&&!useConnectivity\.getState\(\)\.offline\)setError/);
});

console.log('\no que fica no aparelho');
caso('o próprio perfil: guardado a cada leitura boa, lido ao arrancar, apagado ao sair da conta', () => {
  const c = ler('src/lib/cachePerfil.ts');
  assert.match(c, /if \(userId !== proprio\) return;/, 'só o próprio');
  assert.match(c, /cache\.set\(userId, dados\);\n\s+guardarNoAparelho\(userId, dados\);/);
  assert.match(c, /if \(!texto \|\| cache\.has\(userId\) \|\| proprio !== userId\) return;/, 'a leitura da rede ganha à cópia');
  assert.match(c, /if \(proprio\) AsyncStorage\.removeItem\(COPIA\(proprio\)\)/);
});
caso('o Social: a lista entra só se estiver vazia, e sai com a conta', () => {
  const s = ler('src/state/social.ts');
  assert.match(s, /if \(s\.friends\.length \|\| s\.groups\.length \|\| Object\.keys\(s\.conversationPreviews\)\.length\) return;/);
  assert.match(s, /a\.removeItem\(COPIA_DO_SOCIAL\(userId\)\)/);
});
caso('as conversas: as últimas 60, pela ordem, e a mensagem por enviar não se perde', () => {
  const m = (id: string, em: string) => ({ id, createdAt: em }) as any;
  const lista = Array.from({ length: 70 }, (_, i) => m(`m${i}`, new Date(Date.UTC(2026, 10, 10, 0, i)).toISOString()));
  const ultimas = ultimasMensagens([...lista].reverse());
  assert.equal(ultimas.length, 60);
  assert.equal(ultimas[0]!.id, 'm10');
  assert.equal(ultimas.at(-1)!.id, 'm69');
  const hub = ler('src/components/SocialHub.tsx');
  assert.match(hub, /setMessages\(daMemoria\?\?\[\]\);setHasOlder\(false\);setChatLoading\(!daMemoria\);/);
  assert.match(hub, /if\(myId\)guardarCopiaDaConversa\(myId,key,rows\);/);
  // O rascunho vive no `drafts` do Social, que só se limpa ao trocar de conta.
  assert.match(ler('src/state/social.ts'), /conversation:null,drafts:\{\} \}\);\n\s+\/\/ A cópia do aparelho entra já/);
});
caso('a Home: entra com o estado "vazio", para a rede a substituir', () => {
  const r = ler('src/state/recomendacoes.ts');
  assert.match(r, /if \(!vivo \|\| !texto \|\| useRecomendacoes\.getState\(\)\.estado !== 'vazio'\) return;/);
  assert.doesNotMatch(r.slice(r.indexOf('export function iniciarCopiaDaHome')), /estado: 'pronto'/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

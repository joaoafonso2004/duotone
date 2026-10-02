/**
 * A transição do leitor do iPhone (2/10) -- src/lib/transicaoDoLeitor.ts, e
 * as ligações em state/transicaoDoLeitor.ts, PlayerRoot, RootNavigator e app.json.
 *
 * Correr: node --experimental-strip-types scripts/test-transicao-do-leitor.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  atravesDoCartao, cartaoDoArrasto, deLado, deLadoInverso, destinoNoMini, deveFechar, molaIOS,
  velocidadeDeAterragem, velocidadeDeVolta, type Geometria,
} from '../src/lib/transicaoDoLeitor.ts';

let falhas = 0;
function caso(nome: string, f: () => void) {
  try { f(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}
const perto = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// Um iPhone 17 Pro Max: 440 x 956, a capa de 392 e a do mini de 48.
const H = 956;
const geo: Geometria = {
  pivo: { x: 220, y: H * 0.4 },
  capa: { x: 220, y: 314, lado: 392 },
  mini: { x: 42, y: 833, lado: 48 },
};

caso('as molas do iOS: resposta e amortecimento', () => {
  const m = molaIOS(0.5, 0.86);
  perto(m.stiffness, (2 * Math.PI / 0.5) ** 2, 1e-9);
  perto(m.damping, 2 * 0.86 * (2 * Math.PI / 0.5), 1e-9);
  assert.equal(m.mass, 1);
});

caso('para os lados com resistência: um terço no início, nunca mais de 120 pt', () => {
  perto(deLado(0), 0);
  assert.ok(Math.abs(deLado(30) - 10) < 1, `30 pt de dedo dão ~10: ${deLado(30)}`);
  assert.ok(deLado(5000) < 120 && deLado(5000) > 110);
  perto(deLado(-90), -deLado(90));
  for (const x of [-300, -40, 0, 12, 200]) perto(deLadoInverso(deLado(x)), x, 1e-6);
});

caso('o cartão encolhe com o dedo e só para baixo', () => {
  const parado = cartaoDoArrasto(0, 0, H);
  assert.deepEqual(parado, { g: 0, esc: 1, tx: 0, ty: 0 });
  const meio = cartaoDoArrasto(0, 280, H);
  assert.ok(meio.esc < 0.85 && meio.esc > 0.6, `a meio: ${meio.esc}`);
  const fundo = cartaoDoArrasto(0, 2000, H);
  perto(fundo.g, 1); perto(fundo.esc, 0.54, 1e-9);
  const cima = cartaoDoArrasto(0, -400, H);
  assert.equal(cima.g, 0, 'para cima não conta para fechar');
  assert.ok(cima.ty < 0 && cima.ty > -400 * 0.6, 'estica com resistência');
});

caso('a capa aterra exatamente em cima da do mini-player', () => {
  const alvo = destinoNoMini(geo);
  perto(alvo.esc, 48 / 392, 1e-12);
  const centro = atravesDoCartao(geo, alvo, geo.capa.x, geo.capa.y);
  perto(centro.x, geo.mini.x, 1e-9); perto(centro.y, geo.mini.y, 1e-9);
  perto(geo.capa.lado * alvo.esc, geo.mini.lado, 1e-9);
});

caso('largar: fecha com arrasto ou com velocidade, e a aterragem leva a velocidade do dedo', () => {
  const pouco = cartaoDoArrasto(0, 40, H);
  assert.equal(deveFechar(pouco, 100), false, 'pouco e devagar: volta ao sítio');
  assert.equal(deveFechar(pouco, 900), true, 'pouco mas com impulso: fecha');
  assert.equal(deveFechar(cartaoDoArrasto(0, 200, H), 0), true, 'longe: fecha');
  const c = cartaoDoArrasto(0, 220, H);
  assert.equal(velocidadeDeAterragem(geo, c, 0, 0), 0, 'sem impulso, parte do repouso');
  assert.ok(velocidadeDeAterragem(geo, c, 0, 1200) > 0, 'para baixo, na direção do mini');
  assert.equal(velocidadeDeAterragem(geo, c, 0, -1200), 0, 'para cima não empurra para trás');
  assert.ok(velocidadeDeAterragem(geo, c, 0, 1e6) <= 7, 'com teto');
  assert.ok(velocidadeDeVolta(cartaoDoArrasto(0, 60, H), 300) > 0, 'a voltar, continua primeiro o dedo');
});

caso('as ligações: 120 Hz, a app de trás, o gesto e a pose', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const app = JSON.parse(ler('app.json'));
  assert.equal(app.expo.ios.infoPlist.CADisableMinimumFrameDurationOnPhone, true, 'sem a chave o iOS prende a app a 60 Hz');
  const nav = ler('src/navigation/RootNavigator.tsx');
  assert.match(nav, /borderRadius: raioDoFundo, transform: \[\{ scale: escalaDoFundo \}\]/, 'a app de trás recua');
  assert.match(nav, /opacity: veuDoFundo/, 'e escurece');
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.doesNotMatch(leitor, /translateY: dragY|dragY\.setValue/, 'o arrasto já não é só descer a página');
  assert.match(leitor, /\{ scale: folhaEscala \}/, 'a página cresce ao abrir e encolhe no gesto');
  assert.match(leitor, /Animated\.add\(cartaoX, Animated\.multiply\(Animated\.add\(cartaoEsc, -1\), kx\)\)/, 'a capa vai com o cartão');
  assert.match(leitor, /forcaDaPose=\{forcaDaPose\}/, 'a capa perde a pose com o gesto');
  // No fim da aterragem: a abertura a 0 e o cartão em repouso ANTES do setExpanded,
  // e o efeito do `expanded` não mexe (senão havia um salto).
  assert.match(leitor, /anim\.setValue\(0\);[\s\S]{0,80}reporGesto\(\);[\s\S]{0,300}fecheiAoAterrarRef\.current = true;\s*setExpanded\(false\);/);
  assert.match(leitor, /if \(fecheiAoAterrarRef\.current\) \{\s*fecheiAoAterrarRef\.current = false;/);
  // A marca só se põe se fui eu a fechar: fechado por outra coisa a meio, ficava
  // esquecida e saltava a abertura seguinte (o leitor não aparecia).
  assert.match(leitor, /if \(usePlayer\.getState\(\)\.expanded\) \{\s*fecheiAoAterrarRef\.current = true;/);
  const estado = ler('src/state/transicaoDoLeitor.ts');
  assert.doesNotMatch(estado, /useNativeDriver: false/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
console.log('\nTransição do leitor: todos os casos passaram.');

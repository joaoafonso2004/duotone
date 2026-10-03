/**
 * A transição do leitor do iPhone (2/10) -- src/lib/transicaoDoLeitor.ts, e
 * as ligações em state/transicaoDoLeitor.ts, PlayerRoot, RootNavigator e app.json.
 *
 * Correr: node --experimental-strip-types scripts/test-transicao-do-leitor.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  amostrasDoDedo, atravesDoCartao, cartaoDoArrasto, deLado, deLadoInverso, destinoNoMini, deveFechar, molaIOS,
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

caso('o dedo no motor nativo: as amostras acertam nas contas exatas (3/10)', () => {
  const a = amostrasDoDedo();
  const interp = (r: { inputRange: number[]; outputRange: number[] }, v: number) => {
    const { inputRange: i, outputRange: o } = r;
    if (v <= i[0]) return o[0];
    for (let k = 1; k < i.length; k++) if (v <= i[k]) return o[k - 1] + ((v - i[k - 1]) / (i[k] - i[k - 1])) * (o[k] - o[k - 1]);
    return o[o.length - 1];
  };
  for (const r of [a.x, a.yFracao, a.g, a.esc])
    for (let k = 1; k < r.inputRange.length; k++) assert.ok(r.inputRange[k] > r.inputRange[k - 1], 'as entradas têm de subir');
  const H = 844;
  let piorX = 0, piorY = 0, piorEsc = 0, piorG = 0;
  for (let dx = -900; dx <= 900; dx += 7) {
    const exato = cartaoDoArrasto(dx, 0, H).tx;
    piorX = Math.max(piorX, Math.abs(interp(a.x, dx) - exato));
  }
  for (let dy = -700; dy <= 900; dy += 5) {
    const c = cartaoDoArrasto(0, dy, H);
    const g = interp(a.g, dy / H);
    piorY = Math.max(piorY, Math.abs(interp(a.yFracao, dy / H) * H - c.ty));
    piorG = Math.max(piorG, Math.abs(g - c.g));
    piorEsc = Math.max(piorEsc, Math.abs(interp(a.esc, g) - c.esc));
  }
  assert.ok(piorX < 3, `para o lado erra ${piorX.toFixed(2)} pt`);
  assert.ok(piorY < 3, `na vertical erra ${piorY.toFixed(2)} pt`);
  assert.ok(piorG < 0.001, `o arrasto erra ${piorG}`);
  assert.ok(piorEsc < 0.01, `a escala erra ${piorEsc.toFixed(4)}`);
});

caso('o gesto de fechar é do Gesture Handler, com o dedo no motor nativo (3/10)', () => {
  const leitor = readFileSync('src/components/PlayerRoot.tsx', 'utf8');
  const estado = readFileSync('src/state/transicaoDoLeitor.ts', 'utf8');
  assert.doesNotMatch(leitor, /dismissPan/, 'o PanResponder do fecho saiu');
  assert.match(leitor, /<PanGestureHandler[\s\S]{0,200}onGestureEvent=\{eventoDoDedo\}/);
  assert.match(leitor, /translationX: dedoX, translationY: dedoY[\s\S]{0,40}useNativeDriver: true/);
  // No fim, o dedo passa para os valores de sempre e volta a 0, juntos.
  assert.match(leitor, /arrasto\.setValue\(c\.g\);\s*dedoX\.setValue\(0\);\s*dedoY\.setValue\(0\);/);
  for (const v of ['cartaoXVisto', 'cartaoYVisto', 'cartaoEscVisto', 'arrastoVisto'])
    assert.match(estado, new RegExp(`export const ${v} =`), v);
  // Os derivados leem o que se vê (com o dedo), não o valor cru.
  assert.doesNotMatch(estado, /suave\(arrasto,/);
  assert.match(readFileSync('App.tsx', 'utf8'), /<GestureHandlerRootView/);
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
  assert.match(leitor, /Animated\.add\(cartaoXVisto, Animated\.multiply\(Animated\.add\(cartaoEscVisto, -1\), kx\)\)/, 'a capa vai com o cartão');
  assert.match(leitor, /forcaDaPose=\{forcaDaPose\}/, 'a capa perde a pose com o gesto');
  const estado = ler('src/state/transicaoDoLeitor.ts');
  assert.doesNotMatch(estado, /useNativeDriver: false/);
});

caso('a aterragem e a abertura não se atropelam (os bugs da 4.1.6)', () => {
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const leitor = ler('src/components/PlayerRoot.tsx');
  // O leitor fecha-se na store logo no largar: tocar numa música (ou no mini) a
  // meio da aterragem é pedir para abrir, e isso tem de mudar alguma coisa.
  assert.match(leitor, /const minha = \+\+aterragemRef\.current;[\s\S]{0,400}if \(usePlayer\.getState\(\)\.expanded\) setExpanded\(false\);/);
  // Uma aterragem interrompida não acaba depois por cima da abertura (fechava o
  // leitor e deixava a app de trás escurecida).
  assert.match(leitor, /if \(aterragemRef\.current !== minha\) return;\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*anim\.setValue\(0\);/);
  assert.doesNotMatch(leitor, /fecheiAoAterrarRef/, 'o efeito do `expanded` nunca é saltado');
  // Aberto só com faixa: sem ela, a app de trás escurecia sem leitor à frente.
  assert.match(leitor, /const alvo = expanded && temFaixa \? 1 : 0;/);
  assert.match(leitor, /\}, \[expanded, temFaixa\]\);/);
  // A aterrar e fechado: ela acaba sozinha. Pedido para abrir: cancela-a.
  assert.match(leitor, /if \(aterrandoRef\.current\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(!alvo\) return;[\s\S]{0,200}aterragemRef\.current\+\+;/);
  // O cartão volta ao sítio a animar, nunca por baixo do dedo.
  assert.match(leitor, /if \(alvo && !arrastandoRef\.current\) \{\s*Animated\.parallel\(\[ir\(cartaoX, 0\)/);
  // Até ao fim da aterragem desenha-se o leitor aberto (a capa 3D não troca pela miniatura a meio).
  assert.match(leitor, /const aberto = expanded \|\| aterrando;/);
  assert.match(leitor, /\{aberto && \(\s*<CapaDoLeitor/);
  // Os nós do voo e do mini-player não se refazem a cada desenho.
  assert.match(leitor, /if \(nosRef\.current\?\.chave !== chaveDosNos\) nosRef\.current = \{ chave: chaveDosNos, nos: criarNos\(\) \};/);
  assert.match(leitor, /transform: nos\.miniTransform,/);
  assert.doesNotMatch(leitor, /speed: 14,\s*bounciness: 3/, 'o voo da linha usa a mola do iOS');
  // O mini-player desce para o sítio dele no gesto (subia 12 pt e dava um salto no fim).
  const estado = ler('src/state/transicaoDoLeitor.ts');
  assert.match(estado, /const miniSobe = Animated\.multiply\(\s*Animated\.multiply\(suave\(abertura, 0, 0\.3\), suave\(arrastoVisto, 0\.05, 0\.4, true\)\),\s*suave\(aterrar, 0, 0\.3, true\),\s*\);/);
  // O leitor abre com a música nova, e não com a anterior antes das esperas.
  const store = ler('src/state/player.ts');
  assert.doesNotMatch(store, /if \(shouldExpand && !get\(\)\.expanded\) set\(\{ expanded: true \}\);/);
  assert.match(store, /origemDaFila: origemSeguinte,\s*\.\.\.\(abrir \? \{ expanded: true \} : \{\}\),/);
  // A abertura e o raio NUNCA num `Animated.parallel` (2/10): fechar pelo X
  // desmonta a capa, o React Native pára o raio (fica sem quem o use) e o
  // parallel parava a abertura com ele -- a app de trás ficava escura.
  assert.doesNotMatch(leitor, /Animated\.parallel\(\[ir\(anim, alvo\), ir\(animRaio, alvo\)\]\)/);
  assert.match(leitor, /ir\(anim, alvo\)\.start\(/);
  assert.match(leitor, /else if \(!usePlayer\.getState\(\)\.current\) anim\.setValue\(0\);/, 'e sem faixa a abertura nunca fica a meio');
  // O X desce primeiro e só depois fecha a música.
  assert.match(leitor, /setExpanded\(false\);\s*setTimeout\(\(\) => \{ if \(!usePlayer\.getState\(\)\.expanded\) void close\(\); \}, FECHAR_DEPOIS_DE_DESCER_MS\);/);
  // As letras montam-se depois da faixa.
  const cubo = ler('src/components/ArtworkLyricsCube.tsx');
  assert.match(cubo, /\{letras\?<LyricsView key=\{letras\.chave\}/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
console.log('\nTransição do leitor: todos os casos passaram.');

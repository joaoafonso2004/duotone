/**
 * O Liquid Glass da base, refeito (27/11, depois da 7.2.8; `lib/vidroDaBase.ts`).
 * A 7.2.8 punha o mini e os separadores num só cartão de vidro, cortado por uma
 * vista de fora, sem nada a marcar o escolhido. Agora duas cápsulas como a barra
 * do iOS 26, com as medidas tiradas da verdadeira.
 *
 * O vidro em si só se vê num iPhone com o iOS 26: aqui as contas e a montagem.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  botaoEscolhido, DESFOCADO_DO_VIDRO, fundoDoVidro, geometriaDoVidro, MUSICA_NO_VIDRO, rotasComBotao, selecaoDoVidro, separadoresDaBarraNativa,
  SIMBOLOS_DOS_SEPARADORES, VIDRO_DA_BASE,
} from '../src/lib/vidroDaBase.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

caso('as medidas da barra do iOS 26: 62 pt, a 21 das bordas e do fundo', () => {
  assert.equal(VIDRO_DA_BASE.altura, 62);
  assert.equal(VIDRO_DA_BASE.margem, 21);
  const g = geometriaDoVidro(34, 54);
  assert.deepEqual({ fundo: g.fundo, altura: g.altura, raio: g.raio }, { fundo: 21, altura: 62, raio: 31 });
  // O resto da app conta por cima do insets.bottom: a linha da música fica por cima da cápsula.
  assert.equal(g.separadores + 34, 21 + 62);
});
caso('sem indicador de casa, a 12 do fundo; com a letra grande, a cápsula cresce', () => {
  assert.equal(geometriaDoVidro(0, 54).fundo, 12);
  assert.equal(geometriaDoVidro(0, 54).separadores, 74);
  const grande = geometriaDoVidro(34, 66.4);
  assert.equal(grande.altura, 75);
  assert.equal(grande.raio, 37.5);
});
caso('a cápsula do escolhido: dentro da coluna, com 5 pt de vidro em cima e em baixo', () => {
  const s = selecaoDoVidro(398, 5, 62);
  assert.equal(s.coluna, 78);
  assert.equal(s.largura, 74);
  assert.equal(s.altura, 52);
  assert.equal(s.raio, 26);
  assert.equal(s.topo, 5);
  assert.equal(s.x(0), 6);
  assert.equal(s.x(4), 4 + 78 * 4 + 2);
  assert.equal(selecaoDoVidro(0, 5, 62).coluna, 0, 'antes de medir, nada');
});
caso('a cápsula da música mais baixa do que a dos separadores, com a capa centrada (28/11)', () => {
  const m = MUSICA_NO_VIDRO;
  assert.ok(m.altura < VIDRO_DA_BASE.altura, 'a screenshot 4: a da música era maior do que a barra');
  assert.equal(m.dentro * 2 + m.capa, m.altura, 'a mesma folga em cima, em baixo e à esquerda');
  // O canto redondo da capa longe da ponta da cápsula: o centro do arco do canto,
  // mais o raio, fica dentro do semicírculo da ponta.
  const r = m.altura / 2;
  const centroDoCanto = m.dentro + m.raioDaCapa;
  const distancia = Math.hypot(r - centroDoCanto, r - centroDoCanto);
  assert.ok(distancia + m.raioDaCapa < r - 2, `o canto a ${(r - distancia - m.raioDaCapa).toFixed(1)} pt da curva`);
  // A barra de progresso começa no texto (não passa por baixo da capa) e acaba longe da ponta.
  assert.equal(m.progressoEsquerda, m.dentro + m.capa + 10);
  assert.ok(m.progressoDireita > r - Math.sqrt(r ** 2 - (r - m.progressoFundo) ** 2) + 4);
});
caso('o vidro transparente com o desfocado por trás, a 0 % e por baixo do escuro (28/11)', () => {
  // O material mais fino e escuro, inteiro, nas peças da app e na barra do sistema.
  assert.deepEqual(DESFOCADO_DO_VIDRO, { tint: 'systemUltraThinMaterialDark', intensidade: 100 });
  const v = ler('src/components/Vidro.tsx');
  const desfocado = v.indexOf('<BlurView pointerEvents="none" tint={DESFOCADO_DO_VIDRO.tint} intensity={DESFOCADO_DO_VIDRO.intensidade}');
  const escuro = v.indexOf('{fundo ? <View pointerEvents="none"');
  const vidro = v.indexOf('<GlassView glassEffectStyle="clear"');
  assert.ok(desfocado > 0 && desfocado < escuro && escuro < vidro, 'o desfocado por baixo, o escuro a seguir, o vidro por cima');
  assert.match(v, /style=\{\[StyleSheet\.absoluteFill, forma, styles\.corta\]\}/, 'o desfocado corta-se a si próprio, com o raio');
  const swift = ler('modules/duotone-separadores/ios/DuotoneSeparadoresModule.swift');
  assert.match(swift, /private let desfocado = UIVisualEffectView\(effect: UIBlurEffect\(style: \.systemUltraThinMaterialDark\)\)/);
  assert.ok(swift.indexOf('addSubview(desfocado)') < swift.indexOf('addSubview(fundo)') && swift.indexOf('addSubview(fundo)') < swift.indexOf('addSubview(barra)'),
    'o desfocado por baixo do escuro, e os dois por baixo da barra');
  assert.match(swift, /desfocado\.isHidden = false\n\s+desfocado\.frame = r\n\s+desfocado\.layer\.cornerRadius = raio\n\s+fundo\.isHidden = opacidade <= 0/);
  // Nunca se esconde a cápsula nem se lhe mexe no alpha: o UIKit deixava de pôr o vidro.
  assert.doesNotMatch(swift, /capsula\.isHidden|capsula\.alpha/);
});
caso('a opacidade: um fundo escuro por baixo do vidro, nada a 0', () => {
  assert.equal(fundoDoVidro(0), null);
  assert.equal(fundoDoVidro(40), 'rgba(6,6,8,0.4)');
  assert.equal(fundoDoVidro(100), 'rgba(6,6,8,1)');
  assert.equal(fundoDoVidro(250), 'rgba(6,6,8,1)');
  assert.equal(fundoDoVidro(Number.NaN), null);
});
caso('a barra do sistema: os botões sem o Social, e o escolhido pela chave', () => {
  const rotas = ['Search', 'Songs', 'Artists', 'Playlists', 'Profile', 'Social'].map((name) => ({ key: `${name}-k`, name }));
  assert.deepEqual(rotasComBotao(rotas).map((r) => r.name), ['Search', 'Songs', 'Artists', 'Playlists', 'Profile']);
  assert.equal(botaoEscolhido(rotas, 3), 3);
  assert.equal(botaoEscolhido(rotas, 5), -1, 'no Social, nenhum');
  assert.equal(botaoEscolhido(rotas, 9), -1);
  for (const r of rotasComBotao(rotas)) assert.ok(SIMBOLOS_DOS_SEPARADORES[r.name], `${r.name} sem símbolo`);
  // A altura da barra já traz o fundo do ecrã: o resto da app conta por cima do insets.bottom.
  assert.equal(separadoresDaBarraNativa(104, 34), 70);
  assert.equal(separadoresDaBarraNativa(20, 34), 0);
});

caso('a base: duas cápsulas, o raio no próprio vidro, nenhuma vista de fora a cortá-lo', () => {
  const doca = ler('src/components/Doca.tsx');
  assert.match(doca, /<Vidro style=\{\[StyleSheet\.absoluteFill, \{ borderRadius: MUSICA_NO_VIDRO\.altura \/ 2 \}\]\} \/>/);
  assert.match(doca, /<Vidro style=\{\[StyleSheet\.absoluteFill, \{ borderRadius: geo\.raio \}\]\} \/>/);
  assert.doesNotMatch(doca, /flutuante|RAIO_DO_CARTAO/, 'o cartão único da 7.2.8 saiu');
  // A 7.3.0 escurecia o que passava por baixo (até 72% de preto) e o vidro ficava
  // opaco ("é suposto não ser transparente?", 28/11).
  assert.doesNotMatch(doca, /styles\.esbatido|rgba\(0,0,0,0\.72\)/, 'nada a escurecer por trás das cápsulas');
  const estilos = doca.slice(doca.indexOf('const styles = StyleSheet.create'));
  for (const nome of ['capsulaDaMusica', 'capsulaDosSeparadores']) {
    const bloco = estilos.slice(estilos.indexOf(`${nome}:`), estilos.indexOf('}', estilos.indexOf(`${nome}:`)));
    assert.doesNotMatch(bloco, /overflow/, `${nome}: sem overflow`);
  }
  assert.match(doca, /useEffect\(\(\) => \{ if \(vidro && !nativa && linha > 0\) definirAlturaDosSeparadores\(geo\.separadores\); \}/, 'o resto da app conta a cápsula');
  assert.match(doca, /<SelecaoDoVidro state=\{separadores\.state\} position=\{separadores\.position\}/);
});
caso('o escolhido: uma cápsula lisa com rebordo (não de vidro), que anda com o pager', () => {
  const barra = ler('src/navigation/BarraDeSeparadores.tsx');
  const sel = barra.slice(barra.indexOf('export function SelecaoDoVidro'), barra.indexOf('const styles = StyleSheet.create'));
  assert.doesNotMatch(sel, /<Vidro|GlassView/, 'vidro sobre vidro funde-se e desaparece');
  assert.match(sel, /position\.interpolate\(\{ inputRange, outputRange: xs, extrapolate: 'clamp' \}\)/);
  assert.match(sel, /r\.name === 'Social' \? 0 : 1/, 'no Social, que não tem botão, apaga-se');
  assert.match(barra, /publicarSeparadores\(\{ state, navigation, position \}\)/);
  assert.match(barra, /backgroundColor: VIDRO_DA_BASE\.corDaSelecao,\n\s+borderWidth: StyleSheet\.hairlineWidth, borderColor: VIDRO_DA_BASE\.rebordoDaSelecao,/);
});
caso('a barra do sistema: uma UITabBar sozinha, e a app degrada sem ela', () => {
  const swift = ler('modules/duotone-separadores/ios/DuotoneSeparadoresModule.swift');
  assert.match(swift, /private let barra = UITabBar\(frame: \.zero\)/);
  assert.doesNotMatch(swift.replace(/\/\*[\s\S]*?\*\//g, ''), /UITabBarController/, 'sem controlador: o pager do React Navigation fica');
  assert.match(swift, /func tabBar\(_ tabBar: UITabBar, didSelect item: UITabBarItem\)/);
  assert.match(swift, /return vista === self \? nil : vista/, 'fora da barra, o toque passa');
  assert.match(swift, /Events\("onEscolher", "onAltura", "onDiagnostico"\)/);
  // A opacidade na barra (28/11, "continua baço"): a cápsula dela no vidro
  // transparente e claro, com o escurecimento por trás; e só se troca vidro por vidro.
  assert.match(swift, /if capsula\.overrideUserInterfaceStyle != \.light \{ capsula\.overrideUserInterfaceStyle = \.light \}/);
  assert.match(swift, /if capsula\.effect is UIGlassEffect, capsula\.effect !== efeitoLimpo \{\n\s+let limpo = UIGlassEffect\(style: \.clear\)/);
  assert.match(swift, /if r\.height < alto - 1, r\.width > largo \/ 2, r\.width \* r\.height > area \{/, 'a cápsula, e não o fundo da barra inteira');
  assert.match(ler('src/navigation/BarraDeSeparadores.tsx'), /registar\('barra_do_sistema', \{ arvore: String\(d\.arvore\)\.slice\(0, 4000\)/);
  assert.doesNotMatch(ler('src/lib/eventos.ts').split('EVENTOS_QUE_O_SERVIDOR_GUARDA')[1].split(']')[0], /barra_do_sistema/,
    'só os eventos do administrador: os dos outros nem saem do aparelho');
  const idx = ler('modules/duotone-separadores/index.ts');
  assert.match(idx, /requireOptionalNativeModule\('DuotoneSeparadores'\)/, 'num binário sem o módulo, null');
  const doca = ler('src/components/Doca.tsx');
  assert.match(doca, /const nativa = vidro && temSeparadoresDoSistema;/);
  assert.match(doca, /\{nativa \? \(/);
  assert.match(doca, /definirAlturaDosSeparadores\(separadoresDaBarraNativa\(alturaNativa, insets\.bottom\)\)/);
  const barra = ler('src/navigation/BarraDeSeparadores.tsx');
  assert.match(barra, /onEscolher=\{\(e\) => \{ const r = visiveis\[e\.nativeEvent\.indice\]; if \(r\) carregarNoSeparador\(state, navigation, r\); \}\}/,
    'o mesmo toque das duas barras: a página principal, ou o topo');
  assert.match(barra, /onPress=\{\(\) => carregarNoSeparador\(state, navigation, route\)\}/);
  assert.match(barra, /titulo: traduzir\(/, 'os nomes no francês também');
});
caso('a capa do mini com cantos redondos só com o vidro: a moldura encolhida leva o raio a dividir pela escala', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  // Sem o vidro, os 8 de sempre (cantos quase retos no mini): os redondos eram só para o Liquid Glass (28/11).
  assert.match(leitor, /const raioDaMolduraNoMini = vidro \? MUSICA_NO_VIDRO\.raioDaCapa \* \(ART_FULL \/ ladoDaCapaNoMini\) : radii\.sm;/);
  assert.match(leitor, /outputRange: \[raioDaMolduraNoMini, capaInteira \? 0 : 20\]/);
  assert.match(leitor, /vidMini\.x, vidMini\.y, vidMini\.w, W, H,/, 'o voo refaz-se quando o tamanho da capa do mini muda');
  assert.match(leitor, /capaFlutuante, capaInteira, capaPoster, vidro,\n\s+\]\.join\('\|'\)/, 'e quando o vidro liga ou desliga');
});
caso('a capa do mini nunca pisca ao pousar, e os cantos recortam-se na descida (28/11)', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  // Sempre montada: montada no fim da aterragem, o expo-image entrava com 250 ms sobre preto.
  assert.doesNotMatch(leitor, /\{!aberto && \(origemDaEntrada\?\.uri \|\| capaParaLista\(artSource\)\) \?/);
  assert.match(leitor, /\{\(origemDaEntrada\?\.uri \|\| capaParaLista\(artSource\)\) \? \(\n\s+<Animated\.View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, styles\.capaDoMiniNaMoldura, \{/);
  assert.match(leitor, /borderRadius: aberto \? nos\.raioDaCapaDoMiniAberto : nos\.moldura\.borderRadius,\n\s+opacity: aberto \? nos\.capaDoMiniAberto : 1,/);
  assert.match(leitor, /ligada=\{!origemDaEntrada && !aberto\}/, 'sem passagens escondidas com o leitor aberto');
  // Acende quando a pose já saiu (forcaDaPose a 0 com o aterrar a 1/1,6), e com a abertura a 0.
  assert.match(leitor, /const noMini = anim\.interpolate\(\{ inputRange: \[-0\.02, 0, 0\.02\], outputRange: \[0, 1, 0\], extrapolate: 'clamp' \}\);/);
  assert.match(leitor, /const capaDoMiniAberto = Animated\.add\(suave\(aterrar, 0\.6, 0\.72\), noMini\)/);
  assert.ok(0.6 < 1 / 1.6 && 1 / 1.6 < 0.72, 'a troca apanha o fim da pose');
  assert.match(leitor, /outputRange: \[raioDaCapaGrande, raioDaMolduraNoMini\], extrapolate: 'clamp' \}\);/, 'do raio da grande ao do mini');
  assert.match(leitor, /const raioDaCapaGrande = capaFlutuante \? CAPA_FLUTUANTE\.raio : capaInteira \? 0 : 20;/);
  assert.match(leitor, /raio=\{capaFlutuante \? CAPA_FLUTUANTE\.raio : capaInteira \? 0 : 20\} pose3D=\{pose3D\}/, 'o mesmo raio que o cubo tem');
  // A grande apaga-se pela do mini, que está por baixo dela.
  assert.match(leitor, /<Animated\.View pointerEvents=\{aberto \? 'auto' : 'none'\} style=\{\[StyleSheet\.absoluteFill, \{ opacity: aberto \? nos\.capaGrandeAberto : 0 \}\]\}>\n\s+<CapaDoLeitor/);
  assert.ok(leitor.indexOf('styles.capaDoMiniNaMoldura, {') < leitor.indexOf('<CapaDoLeitor\n'), 'a do mini por baixo da grande');
  const transicao = ler('src/state/transicaoDoLeitor.ts');
  assert.match(transicao, /aterrar\.interpolate\(\{ inputRange: \[0, 1 \/ 1\.6\], outputRange: \[1, 0\], extrapolate: 'clamp' \}\)/);
});
caso('a linha da música dentro da cápsula, e a capa que voa parte do sítio novo', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.match(leitor, /x: vidro \? MUSICA_NO_VIDRO\.margem \+ MUSICA_NO_VIDRO\.dentro : 16,/);
  assert.match(leitor, /styles\.mini,\n\s+vidro && styles\.miniNoVidro,/);
  assert.match(leitor, /capsulaDosBotoes: \{ marginHorizontal: 28, borderRadius: 26, borderCurve: 'continuous', paddingVertical: 4 \}/, 'a cápsula dos botões sem overflow');
  const outro = ler('src/components/OutroAparelho.tsx');
  assert.match(outro, /style=\{\[estilos\.mini, vidro && estilos\.miniNoVidro,/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

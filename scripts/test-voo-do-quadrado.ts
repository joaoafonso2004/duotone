/**
 * Entrar pelo quadrado (24/11, `lib/vooDoQuadrado.ts`): as contas da cor e da
 * capa, o momento em que a página abre por baixo, e onde está ligado.
 *
 * O movimento em si só se vê no iPhone (uma build): aqui confirma-se que a página
 * nova nunca abre antes de a cor tapar o ecrã todo (senão via-se a de trás
 * desaparecer), e que cada porta passa pelo mesmo caminho.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  amostrasDaVolta, CASCATA, COR_ATE, corTapa, curvaDaMola, decidirVolta, duracaoDaMola, encolherDoDedo, entradaDaLinha, momentoDeAbrir,
  MOLA_DO_VOO, recorteDaVolta, TAPAR_MS, VEU_MAXIMO, VOLTA, vooDaCapa, vooDaCor, vooDoCirculoParaLarga,
} from '../src/lib/vooDoQuadrado.ts';
import { ENTRADA } from '../src/lib/movimento.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ecra = { width: 390, height: 844 };
const cartao = { x: 24, y: 180, width: 165, height: 165 };
const circulo = { x: 140, y: 300, width: 110, height: 110 };

console.log('\na mola');
caso('é a ENTRADA da app', () => {
  assert.deepEqual({ ...MOLA_DO_VOO }, { ...ENTRADA });
});
caso('chega ao fim e assenta num tempo de entrada', () => {
  assert.ok(Math.abs(curvaDaMola(2) - 1) < 0.001);
  const d = duracaoDaMola();
  assert.ok(d > 400 && d < 1200, `${d} ms`);
});

console.log('\na cor');
caso('vai para o centro do ecrã e cresce até o tapar, com folga', () => {
  const v = vooDaCor(cartao, ecra, 'quadrado');
  assert.equal(cartao.x + cartao.width / 2 + v.dx, ecra.width / 2);
  assert.equal(cartao.y + cartao.height / 2 + v.dy, ecra.height / 2);
  assert.ok(cartao.width * v.escala > ecra.height);
});
caso('não tapa no começo, tapa no fim (quadrado e círculo)', () => {
  assert.equal(corTapa(0, cartao, ecra, 'quadrado', 12), false);
  assert.equal(corTapa(1, cartao, ecra, 'quadrado', 12), true);
  assert.equal(corTapa(0, circulo, ecra, 'circulo', 55), false);
  assert.equal(corTapa(1, circulo, ecra, 'circulo', 55), true);
});
caso('a página abre quando a cor já tapa tudo, e não antes', () => {
  for (const [de, forma, raio] of [[cartao, 'quadrado', 12], [circulo, 'circulo', 55], [{ x: 20, y: 600, width: 52, height: 52 }, 'quadrado', 0]] as const) {
    const t = momentoDeAbrir(de, ecra, forma, raio);
    assert.ok(t > 50 && t < duracaoDaMola(), `${forma}: ${t} ms`);
    // A cor acaba de crescer aos COR_ATE da mola (26/11): a posição dela é a da mola sobre isso.
    const daCor = (ms: number) => Math.min(1, curvaDaMola(ms / 1000) / COR_ATE);
    assert.equal(corTapa(daCor(t), de, ecra, forma, raio), true, `${forma} tapa aos ${t} ms`);
    assert.equal(corTapa(daCor(t - 20), de, ecra, forma, raio), false, `${forma} ainda não tapa 20 ms antes`);
  }
});

console.log('\na capa');
caso('vai de centro a centro, com a escala pela largura', () => {
  const ate = { x: 95, y: 107, width: 200, height: 200 };
  const v = vooDaCapa(cartao, ate);
  assert.equal(cartao.x + cartao.width / 2 + v.dx, ate.x + ate.width / 2);
  assert.equal(cartao.y + cartao.height / 2 + v.dy, ate.y + ate.height / 2);
  assert.ok(Math.abs(v.escala - 200 / 165) < 1e-9);
});

console.log('\nonde está ligado');
caso('as quatro páginas abrem sem animação nativa quando trazem voo, e esperam a capa', () => {
  const nav = ler('src/navigation/RootNavigator.tsx');
  for (const ecraDaPilha of ['PlaylistDetail', 'PastaDePlaylists', 'LibraryGroup', 'Prateleira']) {
    assert.match(nav, new RegExp(`<Stack\\.Screen name="${ecraDaPilha}" component=\\{\\w+\\} options=\\{abrePorUmQuadrado\\} />`), ecraDaPilha);
  }
  assert.match(nav, /\{voo \? <PaginaDoQuadrado voo=\{voo\} navigation=\{navigation\}>\{children\}<\/PaginaDoQuadrado> : children\}/);
  assert.match(nav, /<CamadaDoQuadrado \/>\n\s+\{\/\* A base de baixo/, 'por cima das páginas, por baixo da base');
});
caso('as capas de destino e as portas', () => {
  assert.match(ler('src/components/CabecalhoDaPlaylist.tsx'), /<AlvoDoVoo style=\{\[styles\.capa/);
  assert.match(ler('src/components/SeccoesDoArtista.tsx'), /<AlvoDoVoo style=\{\{ height: altura \}\}>/);
  for (const f of ['src/screens/PlaylistsScreen.tsx', 'src/screens/ArtistsScreen.tsx', 'src/screens/SearchScreen.tsx', 'src/components/SocialProfileView.tsx']) {
    assert.match(ler(f), /entrarPeloQuadrado\(/, f);
  }
});
caso('voltar pelo botão encolhe até ao quadrado', () => {
  assert.match(ler('src/screens/PlaylistDetailScreen.tsx'), /onPress=\{voltar\} style=\{\{ marginLeft: -8 \}\} accessibilityLabel="Back"/);
  const artista = ler('src/screens/LibraryGroupScreen.tsx');
  assert.match(artista, /<BolaDeVidro icone="chevron-back" label="Back" onPress=\{voltar\} \/>/);
  assert.equal(artista.match(/onBack=\{voltar\}/g)?.length, 2);
  assert.match(ler('src/screens/PlaylistsScreen.tsx'), /onBack=\{pastaAberta \? voltar : undefined\}/);
});

caso('sem o atraso entre o toque e o voo, a entrar e a voltar (25/11)', () => {
  const estado = ler('src/state/vooDoQuadrado.ts');
  // A medida é síncrona quando o binário a tem (getBoundingClientRect), e o voo pede-se no mesmo toque.
  assert.match(estado, /export function medirJa\(no: View \| null\): Retangulo \| null \| undefined/);
  assert.match(estado, /const ja = medirJa\(no\);\n {2}if \(ja !== undefined\) comecar\(ja\);\n {2}else void medirNoEcra\(no\)\.then\(comecar\);/);
  const camada = ler('src/components/CamadaDoQuadrado.tsx');
  // As molas arrancam no efeito de layout da camada, e não num fotograma depois.
  assert.match(camada, /useLayoutEffect\(\(\) => \{\n\s+const a = arrancar\.current;/);
  assert.match(camada, /arrancar\.current = \{ id: pedido\.id, modo: 'entrar', f: \(\) => Animated\.spring\(p, \{ toValue: 1/);
  const voltar = camada.slice(camada.indexOf("modo: 'voltar', f:"));
  // A voltar, encolhe logo a seguir a sair, com a medida da entrada; a nova só acerta o alvo.
  assert.match(voltar, /pedido\.sair\(\);[\s\S]{0,400}Animated\.spring\(p, \{ toValue: 0/);
  assert.ok(voltar.indexOf('Animated.spring(p, { toValue: 0') < voltar.indexOf('d.medirDe()'), 'encolher não espera pela medida nova');
  assert.ok(TAPAR_MS <= 100, `a cor tapa depressa (${TAPAR_MS} ms)`);
});

caso('a cascata quando a capa pousa: cada linha a sua janela, a mesma animação (25/11)', () => {
  assert.equal(CASCATA.linhas, 10);
  const primeira = entradaDaLinha(0), ultima = entradaDaLinha(9);
  assert.equal(primeira.inputRange[0], 0);
  assert.ok(ultima.inputRange[ultima.inputRange.length - 1] <= 1, 'a última acaba dentro da animação');
  assert.ok(Math.abs(ultima.inputRange[0] - 9 * CASCATA.passo) < 1e-9, 'uma a uma');
  for (const e of [primeira, ultima]) {
    assert.equal(e.opacidade[0], 0); assert.equal(e.opacidade[e.opacidade.length - 1], 1);
    assert.equal(e.desvio[0], CASCATA.desvio); assert.equal(e.desvio[e.desvio.length - 1], 0);
    for (let i = 1; i < e.inputRange.length; i++) assert.ok(e.inputRange[i] > e.inputRange[i - 1]);
  }
  // ~30 ms entre linhas e ~460 ms cada, como na maquete.
  assert.ok(Math.abs(CASCATA.passo * CASCATA.duracaoMs - 30) < 2);
  assert.ok(Math.abs(CASCATA.janela * CASCATA.duracaoMs - 456) < 10);
  const pagina = ler('src/components/PaginaDoQuadrado.tsx');
  assert.match(pagina, /Animated\.timing\(cascata, \{ toValue: 1, duration: CASCATA\.duracaoMs, easing: Easing\.linear, useNativeDriver: true \}\)/);
  assert.match(pagina, /if \(!cascata \|\| indice >= CASCATA\.linhas\) return null;/, 'fora de uma página do quadrado, a linha como sempre');
  for (const f of ['src/screens/PlaylistDetailScreen.tsx', 'src/screens/PrateleiraScreen.tsx', 'src/screens/LibraryGroupScreen.tsx']) {
    assert.match(ler(f), /<LinhaEmCascata indice=\{index\}>/, f);
  }
});

console.log('\nvoltar a deslizar, a encolher para o cartão (26/11, item 7)');
caso('largar: depois de 22 % da largura volta, antes reabre; um gesto rápido conta', () => {
  assert.equal(decidirVolta(ecra.width * 0.21, 0, ecra.width), false);
  assert.equal(decidirVolta(ecra.width * 0.23, 0, ecra.width), true);
  assert.equal(decidirVolta(40, 900, ecra.width), true, 'rápido e curto volta');
  assert.equal(decidirVolta(ecra.width * 0.3, -900, ecra.width), false, 'a puxar para trás reabre');
});
caso('o dedo encolhe até 0,55, a 0,95 da largura', () => {
  assert.equal(encolherDoDedo(0, ecra.width), 0);
  assert.equal(encolherDoDedo(-20, ecra.width), 0);
  assert.ok(Math.abs(encolherDoDedo(ecra.width * 0.22, ecra.width) - 0.22 * 0.95) < 1e-9);
  assert.equal(encolherDoDedo(ecra.width, ecra.width), VOLTA.maximo);
});
caso('o recorte vai do ecrã inteiro ao cartão (o inset da maquete)', () => {
  const comeco = recorteDaVolta(0, ecra, cartao, 55);
  assert.deepEqual([comeco.tx, comeco.ty, comeco.sx, comeco.sy], [0, 0, 1, 1]);
  assert.equal(comeco.raioVisto, 55); assert.equal(comeco.conteudo, 1); assert.equal(comeco.veu, VEU_MAXIMO);
  // O retângulo visto: escala à volta do centro do ecrã, e a deslocação.
  const visto = (r: ReturnType<typeof recorteDaVolta>) => ({
    x: ecra.width / 2 + r.tx - (ecra.width * r.sx) / 2,
    y: ecra.height / 2 + r.ty - (ecra.height * r.sy) / 2,
    width: ecra.width * r.sx, height: ecra.height * r.sy,
  });
  const fim = recorteDaVolta(1, ecra, cartao, 55);
  for (const [k, v] of Object.entries(visto(fim))) assert.ok(Math.abs(v - cartao[k as keyof typeof cartao]) < 1e-6, k);
  assert.equal(fim.raioVisto, VOLTA.raioDoCartao); assert.equal(fim.conteudo, 0); assert.equal(fim.veu, 0);
  // A meio, de cada lado, metade do caminho até ao cartão.
  const meio = visto(recorteDaVolta(0.5, ecra, cartao, 55));
  assert.ok(Math.abs(meio.x - cartao.x / 2) < 1e-6 && Math.abs(meio.y - cartao.y / 2) < 1e-6);
  assert.ok(Math.abs(meio.x + meio.width - (ecra.width - (ecra.width - cartao.x - cartao.width) / 2)) < 1e-6);
  // O canto da caixa escala com ela: na média das escalas dá o canto visto.
  const r = recorteDaVolta(0.4, ecra, cartao, 55);
  assert.ok(Math.abs(r.raio * Math.sqrt(r.sx * r.sy) - r.raioVisto) < 1e-9);
  // O conteúdo já se foi antes de o recorte chegar ao cartão.
  assert.equal(recorteDaVolta(1 / VOLTA.apagar + 0.01, ecra, cartao, 55).conteudo, 0);
});
caso('as amostras do raio vão de 0 a 1, e as escalas são as do fim', () => {
  const a = amostrasDaVolta(ecra, cartao, 55);
  assert.equal(a.p[0], 0); assert.equal(a.p[a.p.length - 1], 1);
  assert.equal(a.p.length, a.raio.length);
  const fim = recorteDaVolta(1, ecra, cartao, 55);
  assert.deepEqual([a.tx, a.ty, a.sx, a.sy], [fim.tx, fim.ty, fim.sx, fim.sy]);
});
caso('ligado: o gesto na página, o pop nativo e o resto', () => {
  const v = ler('src/components/VoltaADeslizar.tsx');
  // Só para a direita, falha na vertical, o dedo no driver nativo.
  assert.match(v, /activeOffsetX=\{VOLTA\.pegaEm\}/);
  assert.match(v, /failOffsetY=\{\[-VOLTA\.falhaNaVertical, VOLTA\.falhaNaVertical\]\}/);
  assert.match(v, /Animated\.event\(\[\{ nativeEvent: \{ translationX: dedo \} \}\], \{ useNativeDriver: true \}\)/);
  // O pop começa quando o gesto pega; a de trás sai antes de a página voltar a ser transparente.
  assert.match(v, /state === State\.ACTIVE[\s\S]{0,400}vista\.current\?\.comecar/);
  assert.match(v, /if \(nativa\) await vista\.current\?\.acabar\?\.\(true\)[\s\S]{0,60}repor\(\);/);
  // Nunca um segundo goBack depois de a pilha já ter tirado a página.
  assert.match(v, /if \(!saiu\) \{ sair\(\); return; \}/);
  // Desligar o handler a meio cancelava o gesto.
  assert.match(v, /enabled=\{ligada && estado !== 'a-acabar'\}/);
  for (const t of v.matchAll(/Animated\.timing\([^{]*\{([^}]*)\}/g)) assert.match(t[1], /useNativeDriver: true/);
  assert.match(v, /pedirFluidez\(/);
  const pagina = ler('src/components/PaginaDoQuadrado.tsx');
  assert.match(pagina, /<VoltaADeslizar cartao=\{cartao\} capaDoCartao=\{capaDoCartao\} ativa=\{comVolta && fase === 'aberta'\}/);
  assert.match(pagina, /comVolta \? \{ animation: 'default', gestureEnabled: false \}/, 'o da borda sai só com o novo');
  const swift = ler('modules/duotone-volta/ios/DuotoneVoltaModule.swift');
  assert.match(swift, /NSSelectorFromString\("startScreenTransition"\)/);
  assert.match(swift, /NSSelectorFromString\("finishScreenTransition:"\)/);
  assert.match(swift, /asyncAfter\(deadline: \.now\(\) \+ 10/, 'se o JavaScript nunca acabar, a página fica');
  // Os métodos que o módulo chama existem no react-native-screens instalado.
  const pilha = ler('node_modules/react-native-screens/ios/RNSScreenStack.h');
  assert.match(pilha, /- \(void\)startScreenTransition;/);
  assert.match(pilha, /- \(void\)finishScreenTransition:\(BOOL\)canceled;/);
  assert.match(ler('modules/duotone-volta/index.ts'), /requireOptionalNativeModule<\{ versao\?: number \}>\('DuotoneVolta'\)/);
});


console.log('\n26/11: entrar no artista, a seta e o arrastar');
caso('o círculo do artista vira a foto larga: começa no cartão, redondo, e pousa no recorte da página', () => {
  const alvo = { x: 0, y: 0, width: 390, height: 538 };
  const m = vooDoCirculoParaLarga(cartao, alvo);
  // No começo: o quadrado escalado tem o tamanho do cartão, no centro dele, e os cantos a meio lado (um círculo).
  assert.ok(Math.abs(m.caixa.width * m.escala - cartao.width) < 1e-9);
  assert.equal(m.caixa.x + m.caixa.width / 2 + m.dx, cartao.x + cartao.width / 2);
  assert.equal(m.caixa.y + m.caixa.height / 2 + m.dy, cartao.y + cartao.height / 2);
  assert.equal(m.raio, m.caixa.width / 2);
  // No fim: o lado da foto (o maior), no centro do alvo; o ecrã corta os lados que sobram.
  assert.equal(m.caixa.width, 538);
  assert.equal(m.caixa.y, 0);
  assert.equal(m.caixa.x + m.caixa.width / 2, 195);
  const camada = ler('src/components/CamadaDoQuadrado.tsx');
  assert.match(camada, /voo\.capa && voo\.larga && voo\.capa\.forma === 'circulo'/);
  assert.match(camada, /borderRadius: p\.interpolate\(\{ inputRange: \[0, 0\.75\], outputRange: \[m\.raio, 0\]/);
});
caso('a página acende de uma vez por baixo da camada (o fundido das duas piscava)', () => {
  const pagina = ler('src/components/PaginaDoQuadrado.tsx');
  assert.match(pagina, /if \(fase !== 'aberta'\) return;[\s\S]{0,400}opacidade\.setValue\(1\);/);
  assert.doesNotMatch(pagina, /Animated\.timing\(opacidade/);
});
caso('a seta: a pilha sabe que sai sem animação antes do goBack', () => {
  const pagina = ler('src/components/PaginaDoQuadrado.tsx');
  assert.match(pagina, /if \(aceite\) \{[\s\S]{0,600}navigation\.setOptions\(\{ animation: 'none' \}\);\n\s+return;\n\s+\}/);
});
caso('arrastar acaba na capa do cartão, e não num retângulo escuro', () => {
  const v = ler('src/components/VoltaADeslizar.tsx');
  assert.match(v, /aMexer && desenho && capaDoCartao \?/);
  assert.match(v, /const escala = Animated\.multiply\(sy, pagina\.height \/ lado\);/, 'cobre o recorte, que é mais alto do que largo');
  assert.match(v, /borderRadius: Animated\.divide\(raioVisto, escala\)/, 'os cantos vistos, numa caixa que só cresce por igual');
  assert.match(v, /transform: \[\{ scaleX: Animated\.divide\(1, sx\) \}, \{ scaleY: Animated\.divide\(1, sy\) \}\]/);
  // No fim tem o tamanho do cartão: lado × sy(1) × altura / lado = altura do cartão.
  const r = recorteDaVolta(1, ecra, cartao, 55);
  assert.ok(Math.abs(ecra.height * r.sy - cartao.height) < 1e-9);
});

caso('a página acende assim que existe, com a capa ainda a voar (o "refresh" do vídeo de 26/11)', () => {
  const camada = ler('src/components/CamadaDoQuadrado.tsx');
  assert.match(camada, /if \(d\.paginaPronta\) trocar\(id\);/, 'não espera que a capa pouse');
  assert.match(camada, /mudarFase\(id, 'aberta'\);\n\s+if \(a\.pousou\) \{ acabar\(id\); return; \}\n\s+Animated\.timing\(fundo, \{ toValue: 0/);
  assert.match(camada, /if \(d\.capa && d\.destino !== 'titulo'\) marcarCapaNoAr\(pedido\.id, true\);/);
  assert.match(camada, /const acabar = \(id: string\) => \{\n\s+marcarCapaNoAr\(id, false\);/);
  assert.match(ler('src/components/PaginaDoQuadrado.tsx'), /style=\{\[style, noAr && \{ opacity: 0 \}\]\}/, 'a capa da página escondida enquanto a outra voa');
  // A cor tapa mais cedo: a página abre por baixo uns 90 ms antes.
  assert.ok(momentoDeAbrir(cartao, ecra, 'quadrado', 12) < 190);
});

console.log('\na playlist antes de chegar (27/11)');
caso('a capa voa para a página já inteira: só as músicas esperam, no sítio delas', () => {
  const p = ler('src/screens/PlaylistDetailScreen.tsx');
  assert.match(p, /const \[capasDoVoo\] = useState\(\(\) => dadosDoVoo\(route\.params\.voo\)\?\.capa\?\.capas \?\? null\);/, 'as capas que voaram');
  assert.match(p, /const previa = loading && tracks\.length === 0 && \(daLista \? daLista\.trackCount > 0 : !!capasDoVoo\);/);
  assert.match(p, /if \(previa\) return \[\.\.\.\(daLista\?\.artworks \?\? capasDoVoo \?\? \[\]\)\];/, 'o mosaico da grelha');
  assert.match(p, /const cabecalhoDaLista = \(tracks\.length > 0 \|\| previa\) && !editMode \? \(/, 'o cabeçalho já na prévia');
  assert.match(p, /faixas=\{previa \? daLista\?\.trackCount \?\? 0 : tracks\.length\}/, 'a contagem da lista');
  assert.match(p, /ListFooterComponent=\{previa \? <SkeletonDeFaixas \/> : null\}/, 'o esqueleto por baixo do cabeçalho');
  assert.match(p, /\) : tracks\.length === 0 && !previa \? \(/, 'a prévia não é a playlist vazia');
  assert.match(p, /desligado=\{!previa && filaTocavel\.length === 0\}/, 'o play não se apaga e acende');
  assert.equal((p.match(/\{podeMexerAVista&&<Pressable/g) ?? []).length, 2, 'Add tracks e Edit já lá');
  const cab = ler('src/components/CabecalhoDaPlaylist.tsx');
  assert.match(cab, /<TextoQueRola key=\{previa \? 'previa' : 'meta'\}/, 'a contagem não rola ao chegar');
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

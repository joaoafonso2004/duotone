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
  CASCATA, corTapa, curvaDaMola, duracaoDaMola, entradaDaLinha, momentoDeAbrir, MOLA_DO_VOO, TAPAR_MS, vooDaCapa, vooDaCor,
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
    assert.equal(corTapa(curvaDaMola(t / 1000), de, ecra, forma, raio), true, `${forma} tapa aos ${t} ms`);
    assert.equal(corTapa(curvaDaMola((t - 20) / 1000), de, ecra, forma, raio), false, `${forma} ainda não tapa 20 ms antes`);
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

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

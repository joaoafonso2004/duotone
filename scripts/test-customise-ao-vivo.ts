/**
 * A Customise ao vivo, o Liquid Glass e o fundo da música (27/11,
 * `docs/personalizar-ao-vivo-maquete.html`, aprovada pelo João).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerAparencia, PADRAO } from '../src/lib/aparencia.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

caso('de origem, a app fica como estava: sem vidro e sem o fundo da música', () => {
  assert.equal(PADRAO.vidro, false);
  assert.equal(PADRAO.fundoDaMusica, false);
  assert.equal(lerAparencia({}).vidro, false, 'uma aparência guardada antes disto');
  assert.equal(lerAparencia({ vidro: true, fundoDaMusica: true }).vidro, true);
  assert.equal(lerAparencia({ vidro: 'sim' }).vidro, false, 'um valor estragado fica o de origem');
  assert.equal(lerAparencia({ fundoDaMusica: true }).fundoDaMusica, true);
});

caso('o Liquid Glass é o vidro do sistema, só no iOS 26, e só com a opção', () => {
  const v = ler('src/components/Vidro.tsx');
  assert.match(v, /if \(Platform\.OS !== 'ios'\) return false;\n\s+try \{ return isLiquidGlassAvailable\(\); \} catch \{ return false; \}/);
  assert.match(v, /return ligado && temLiquidGlass;/);
  assert.match(v, /<GlassView glassEffectStyle="clear" colorScheme="light"/, 'transparente e claro: o escuro sai lamacento no aparelho (28/11)');
  const doca = ler('src/components/Doca.tsx');
  assert.match(doca, /const vidro = useVidro\(\);/);
  assert.match(doca, /<Animated\.View style=\{\[styles\.vidro, \{ height: altura, transform: \[\{ translateY: desvioDoVidro \}\] \}\]\}>\n\s+<BlurView/, 'sem a opção, o vidro desfocado de sempre');
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.match(leitor, /\{vidro \? \(\n\s+<Vidro style=\{styles\.capsulaDosBotoes\}>/);
  const personalizar = ler('src/screens/PersonalizarScreen.tsx');
  assert.match(personalizar, /\{temLiquidGlass \? \(\n\s+<LinhaInterruptor icone="water-outline" rotulo="Liquid Glass"/, 'a opção só aparece onde o vidro existe');
});

caso('a opacidade do vidro: uma barra que se arrasta, e cada peça de vidro a lê (28/11)', () => {
  assert.equal(PADRAO.opacidadeDoVidro, 0, 'de origem, o vidro limpo de antes');
  assert.equal(lerAparencia({ opacidadeDoVidro: 37.4 }).opacidadeDoVidro, 37);
  assert.equal(lerAparencia({ opacidadeDoVidro: 140 }).opacidadeDoVidro, 100);
  assert.equal(lerAparencia({ opacidadeDoVidro: 'muito' }).opacidadeDoVidro, 0);
  const p = ler('src/screens/PersonalizarScreen.tsx');
  assert.match(p, /\{temLiquidGlass && ap\.vidro \? \(\n\s+<LinhaAlta icone="contrast-outline" rotulo="Glass opacity">\n\s+<Deslizador valor=\{ap\.opacidadeDoVidro\}/);
  assert.match(p, /aoMudar=\{\(v\) => mudar\('opacidadeDoVidro', v\)\}/);
  // Quem a lê fora da Customise: o vidro (por baixo dele) e a barra do sistema.
  const v = ler('src/components/Vidro.tsx');
  assert.match(v, /const fundo = fundoDoVidro\(opacidade\);/);
  assert.match(v, /\{fundo \? <View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, forma, \{ backgroundColor: fundo \}\]\} \/> : null\}\n\s+<GlassView/,
    'o fundo POR BAIXO do vidro: por cima tapava o rebordo');
  assert.match(ler('src/navigation/BarraDeSeparadores.tsx'), /opacidade=\{opacidade \/ 100\}/);
  assert.match(ler('src/i18n/fr.ts'), /"Glass opacity": "Opacité du verre"/);
});

caso('o fundo da música: a cor da capa a lavar o topo, por baixo das páginas', () => {
  const raiz = ler('src/navigation/RootNavigator.tsx');
  assert.match(raiz, /<FundoDasPaginas \/>\n\s+<Stack\.Navigator/, 'por baixo das páginas');
  const fundo = ler('src/components/FundoDasPaginas.tsx');
  assert.ok(fundo.indexOf("'rgba(6, 6, 8, 0.88)'") < fundo.indexOf('<FundoDaMusica imediato={imediato} />'), 'por cima do fundo escuro');
  const f = ler('src/components/FundoDaMusica.tsx');
  assert.match(f, /useCorDoAmbiente\(ligado && arte \? capaParaLista\(arte\) : null\)/, 'só lê a capa com a opção ligada');
  assert.match(f, /<CamadaQueAcende key=\{par\.cima\} cor=\{par\.cima\} \/>/, 'a cor nova acende por cima da antiga');
  assert.match(f, /useNativeDriver: true/);
});

caso('a pré-visualização ao vivo fica presa em cima, com dois ecrãs, e não muda a música', () => {
  const p = ler('src/screens/PersonalizarScreen.tsx');
  assert.match(p, /fixo=\{<PreviaAoVivo ap=\{ap\} capa=\{capa\} foco=\{foco\} direita=\{direita\}/);
  assert.match(p, /<MolduraDaPrevia acesa=\{foco === 'np'\}><PreviaDoLeitor ap=\{ap\} capa=\{capa\} faixa=\{faixa\} \/><\/MolduraDaPrevia>/);
  assert.match(p, /<MolduraDaPrevia acesa=\{foco !== 'np'\}><PreviaDaApp ap=\{ap\} ecra=\{direita\} faixa=\{faixa\} faixas=\{faixas\} \/><\/MolduraDaPrevia>/);
  assert.match(p, /usePlayer\.getState\(\)\.upcomingQueue\(\)\.slice\(0, 4\)/, 'as próximas pela upcomingQueue');
  assert.doesNotMatch(p.slice(p.indexOf('function PreviaAoVivo')), /\.next\(\)|playTrack|skip/, '"Next song" não mexe no que toca');
  assert.match(p, /if \(k === 'listas'\) return 'lista';/);
  assert.match(p, /k === 'vidro' \|\| k === 'opacidadeDoVidro' \|\| k === 'fundoDaMusica'/);
});

caso('a barra de cima das páginas fica opaca ao rolar, com o fundo das páginas preso ao ecrã (28/11)', () => {
  const ecra = ler('src/components/Screen.tsx');
  const encolhe = ecra.slice(ecra.indexOf('function ScreenQueEncolhe'));
  assert.doesNotMatch(encolhe, /<BlurView/, 'sem o desfoque com 72% de tinta, que deixava ler a lista');
  assert.match(encolhe, /styles\.fundoOpaco, \{ opacity: anim\.fundo, transform: \[\{ translateY: anim\.sobe \}\] \}\]\}>\n\s+<Animated\.View style=\{\[styles\.fundoDoEcra, \{ height: alturaDoEcra, transform: \[\{ translateY: anim\.preso \}\] \}\]\}>\n\s+<FundoDasPaginas imediato \/>/);
  assert.match(encolhe, /preso: p\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[0, g\?\.distancia \?\? 0\] \}\),/, 'o contrário do sobe');
  assert.match(ecra, /fundoOpaco: \{ backgroundColor: '#000', overflow: 'hidden' \},/, 'o preto de baixo, e corta o fundo do ecrã');
  const musica = ler('src/components/FundoDaMusica.tsx');
  assert.match(musica, /par\.cima && imediato && !par\.baixo \? <Lavagem cor=\{par\.cima\} \/>/, 'na barra, a primeira cor já inteira');
  assert.match(ler('src/components/FundoDasPaginas.tsx'), /transition=\{imediato \? null : 300\}/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

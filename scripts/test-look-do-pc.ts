/**
 * O look da maquete que a 5.5.0 deixou de fora (30/10, o João: "a app está
 * basicamente igual a antes"): a entrada por blocos, o play que sobe nos
 * cartões e os cartões de mistura a cores. Lê o código como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-look-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const UI = ler('src/desktop/ui.web.tsx');
const CASCA = ler('src/desktop/casca.web.tsx');
const BIBLIOTECA = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const RETRATOS = ler('src/desktop/RetratosDosArtistas.web.tsx');
const ENTRADAS = ler('src/desktop/EntradasDaHome.web.tsx');

console.log('\na entrada por blocos');
caso('as prateleiras e a linha de entrada da Home são blocos', () => {
  assert.equal((UI.match(/return <View \{\.\.\.marcar\('bloco'\)\} style=\{\{ marginBottom: ESP\.xxl \}\}>/g) ?? []).length, 4, 'as quatro prateleiras');
  assert.match(ENTRADAS, /<View \{\.\.\.marcar\('bloco'\)\} style=\{estilos\.linha\}>/);
});
caso('cada bloco entra a subir e a acender, um a seguir ao outro (só opacidade e transform)', () => {
  assert.match(CASCA, /@keyframes dt-bloco\{ from\{ opacity: 0; transform: translateY\(16px\); \} to\{ opacity: 1; transform: none; \} \}/);
  assert.match(CASCA, /\[data-dt~="bloco"\]\{ animation: dt-bloco 640ms var\(--dt-curva\) both; \}/);
  assert.match(CASCA, /\[data-dt~="bloco"\]:nth-child\(2\)\{ animation-delay: 60ms; \}/);
  assert.match(CASCA, /\[data-dt~="bloco"\]:nth-child\(n\+7\)\{ animation-delay: 360ms; \}/);
});

console.log('\no play que sobe nos cartões');
caso('com o rato no cartão (ou o foco lá dentro) sobe e acende, em CSS', () => {
  assert.match(CASCA, /\[data-dt~="play-cartao"\]\{ opacity: 0; transform: translateY\(8px\) scale\(\.92\);/);
  assert.match(CASCA, /\[data-dt~="cartao"\]:hover \[data-dt~="play-cartao"\], \[data-dt~="cartao"\]:focus-within \[data-dt~="play-cartao"\]\{ opacity: 1; transform: none; \}/);
});
caso('numa prateleira de músicas é só o convite (o cartão já toca); onde o cartão abre é um botão a sério', () => {
  assert.match(UI, /if \(!aoTocar\) return <View \{\.\.\.marcar\('play-cartao'\)\} pointerEvents="none" aria-hidden style=\{estilo\}>/);
  assert.match(UI, /onPointerDown=\{\(\(e: any\) => e\.stopPropagation\(\)\) as any\}\n\s+onPress=\{\(e: any\) => \{ e\?\.stopPropagation\?\.\(\); aoTocar\(\); \}\}/);
  assert.equal((UI.match(/<PlayDoCartao lado="esquerda" \/>/g) ?? []).length, 2, 'as duas formas da Shelf; à esquerda, porque a direita é do refrão');
});
caso('o artista da grelha toca as músicas dele da biblioteca, e a mistura da Home toca-se com a origem dela', () => {
  assert.match(BIBLIOTECA, /aoTocar=\{\(\) => tocarArtista\(nome, faixas\)\}>/);
  assert.match(RETRATOS, /\{aoTocar \? <PlayDoCartao aoTocar=\{aoTocar\} rotulo=\{`Play \$\{nome\}`\} \/> : null\}/);
  assert.match(BIBLIOTECA, /void leitor\.tocarLista\(\[\.\.\.m\.faixas\], leitor\.shuffle, leitor\.shuffleInteligente, \{ tipo: 'mistura', nome: m\.nome, id: m\.id \}\);/);
  assert.equal((BIBLIOTECA.match(/aoAbrir=\{abrirMistura\} aoTocar=\{tocarMistura\}/g) ?? []).length, (BIBLIOTECA.match(/<PrateleiraDeMisturas titulo=/g) ?? []).length, 'todas as prateleiras de misturas');
});

console.log('\nas Liked Songs');
caso('o topo leva uma lavagem de violeta que se esbate para baixo, atrás do cabeçalho', () => {
  assert.match(BIBLIOTECA, /<Page title="Liked Songs" eyebrow="Playlist" lavagem="rgba\(108,92,255,\.34\)" subtitle=\{resumo\}/);
  assert.match(UI, /\{lavagem \? <View pointerEvents="none" aria-hidden style=\{\[ui\.lavagem, \{ backgroundImage: `linear-gradient\(180deg, \$\{lavagem\}, rgba\(6,6,8,0\)\)` \} as any\]\} \/> : null\}/);
  assert.match(UI, /lavagem: \{ position: 'absolute', top: 0, left: 0, right: 0, height: 300 \}/);
});
caso('o cabeçalho de toda a página entra por blocos, como as prateleiras', () => {
  assert.match(UI, /<View \{\.\.\.marcar\('bloco'\)\} style=\{\[ui\.pageHeader, rolado && ui\.pageHeaderCurto\]\}>/);
});

console.log('\na Home com formas diferentes');
caso('a descoberta é um carrossel de capas grandes (a dois tons), e não uma parede de quadrados iguais', () => {
  assert.match(BIBLIOTECA, /<Shelf lado=\{184\} titulo="Discover daily"/);
  assert.ok(!/<Shelf grelha titulo="Discover daily"/.test(BIBLIOTECA));
  assert.match(UI, /\{capa \? capa\(t, ladoDoCarrossel\) : <Artwork track=\{t\} size=\{ladoDoCarrossel\} \/>\}/);
  assert.match(UI, /\[ui\.shelfCard, \{ width: ladoDoCarrossel \}, hovered && ui\.shelfCardHover, pressed && ui\.pressed\]/);
});
caso('as décadas são números grandes em contorno, que se enchem com o rato', () => {
  assert.match(BIBLIOTECA, /<PrateleiraDeMisturas titulo="Decades" nota="your music from that era" variante="decada"/);
  assert.match(UI, /misturaDecada: \{[^}]*fontSize: 44[^}]*color: 'transparent', WebkitTextStroke: '1\.2px rgba\(233,234,238,\.55\)'/);
  assert.match(CASCA, /\[data-dt~="cartao"\]:hover \[data-dt~="decada-nome"\], \[data-dt~="cartao"\]:focus-within \[data-dt~="decada-nome"\]\{ color: \$\{COR\.texto\}; -webkit-text-stroke-color: \$\{COR\.texto\}; \}/);
});

console.log('\nas tabelas');
caso('o cabeçalho de nenhuma tabela leva a faixa escura nem fica preso (com a cor na janela via-se como um bloco preto)', () => {
  assert.match(UI, /tableHeaderPlain: \{ paddingHorizontal: ESP\.sm, borderTopWidth: 1, borderTopColor: COR\.linhaSuave, backgroundColor: 'transparent' \}/);
  assert.ok(!/cabecalhoSolto|tableHeaderSolto/.test(UI + BIBLIOTECA), 'a opção só da página do artista saiu: é assim em toda a app');
  assert.ok(!/rgba\(12,12,16,0\.96\)/.test(UI));
});

console.log('\no Now Playing (a fila como cartão)');
const NP = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
const ESTILOS = ler('src/desktop/estilos.web.ts');
caso('a fila é um cartão redondo de vidro, com uma borda fina (como na maquete)', () => {
  assert.match(ESTILOS, /npFila: \{ flex: 1, minWidth: 300, minHeight: 0, borderRadius: 22, borderWidth: 1, borderColor: COR\.linhaSuave,/);
  assert.match(ESTILOS, /backgroundColor: 'rgba\(8,8,12,\.5\)', paddingHorizontal: ESP\.lg, paddingTop: ESP\.md, overflow: 'hidden'/);
});
caso('a que toca vem à cabeça da fila, em destaque, com as barrinhas a mexer', () => {
  assert.match(NP, /<View style=\{styles\.npAtual\} accessibilityLabel=\{`Now playing: \$\{tituloDaFaixa\(track\)\}`\}>/);
  assert.ok(NP.indexOf('styles.npAtual') < NP.indexOf('              {linhas}'), 'antes das próximas');
  assert.match(NP, /<View \{\.\.\.marcar\('eq'\)\} aria-hidden/);
  assert.match(ESTILOS, /npAtual: \{[^}]*backgroundColor: 'rgba\(233,234,238,\.09\)'/);
});
caso('o cartão tem duas abas, "Up next" e "Lyrics", no mesmo sítio (a letra é a do painel do leitor)', () => {
  assert.match(NP, /const \[abaDaFila, setAbaDaFila\] = useState<'fila' \| 'letra'>\('fila'\);/);
  assert.match(NP, /<CabecaDaFila fila=\{fila\} abas=\{\{ aba: abaDaFila, aoMudar: setAbaDaFila \}\} \/>/);
  assert.match(NP, /<LyricsView key=\{`\$\{track\.source\}:\$\{track\.sourceId\}`\} track=\{track\} visible \/>/);
  const fila = ler('src/desktop/FilaDoLeitor.web.tsx');
  assert.match(fila, /<AbaDaFila rotulo="Up next" ativa=\{abas\.aba === 'fila'\}/);
  assert.match(fila, /<AbaDaFila rotulo="Lyrics" ativa=\{abas\.aba === 'letra'\}/);
  assert.match(fila, /borderBottomWidth: 2, borderBottomColor: ativa \? COR\.texto : 'transparent'/);
});
caso('a que toca diz "playing now", e o painel e o ecrã estreito ficam sem abas', () => {
  assert.match(NP, /\{displayArtist\(track\)\} · playing now/);
  assert.match(NP, /const cabecaDaFila = <CabecaDaFila fila=\{fila\} \/>;/);
});
caso('só no ecrã largo (duas colunas): no estreito a fila fica como estava', () => {
  const estreito = NP.slice(NP.indexOf('<ScrollView style={{ flex: 1 }} contentContainerStyle={styles.npEstreito}'));
  assert.ok(!/npAtual/.test(estreito.slice(0, 400)));
});

console.log('\no cartão de mistura');
caso('um cartão de cor: a da primeira capa, com a etiqueta, o nome grande e três círculos que se sobrepõem', () => {
  assert.match(UI, /const cor = useCorDoAmbiente\(m\.faixas\[0\]\?\.artworkUrl \?\? null\) \?\? '#3a3a46';/);
  assert.match(UI, /linear-gradient\(135deg, color-mix\(in oklab, \$\{cor\} 58%, #0b0b0d\), color-mix\(in oklab, \$\{cor\} 14%, #0b0b0d\)\)/);
  assert.match(UI, /\.slice\(0, 3\)/);
  assert.match(UI, /MIX · \{m\.faixas\.length\}/);
});
caso('abre no clique e toca no play; o botão direito e o cartão levantado com o menu ficam como estavam', () => {
  assert.match(UI, /onPress=\{\(\) => \{ if \(arrastou\.current\) return; aoAbrir\(m\); \}\}/);
  assert.match(UI, /\{\.\.\.marcar\('cartao', \.\.\.\(escolhido \? \['com-menu'\] : \[\]\)\)\}/);
  assert.match(UI, /onContextMenu=\{\(\(e: any\) => \{ if \(!aoMenu\) return; e\.preventDefault\(\); aoMenu\(m, e\); \}\) as any\}/);
});
caso('nenhum pedido novo, nada de className nem de backdrop-filter', () => {
  const cartao = UI.slice(UI.indexOf('function CartaoDeMistura('), UI.indexOf('/** O lado mínimo de uma capa na grelha'));
  assert.ok(!/fetch\(|supabase|className\s*[=:]|backdrop-?[fF]ilter/.test(cartao));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

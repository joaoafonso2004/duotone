/**
 * Os menus do PC com uma só caixa, e o equalizador em curva (10/11, opção B de
 * `docs/menus-maquete.html`; o João: "todos os menus deste género devem estar
 * coerentes, senão fica uns menus de uma maneira e outros de outra").
 *
 * Lê os ficheiros como texto. O que guarda é a coerência: uma superfície que
 * flutua usa o `flutuante`, e não volta a ter a sua cor de fundo e o seu fio.
 *
 * Correr: node --experimental-strip-types scripts/test-menus-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('\numa só caixa para o que flutua');
const tokens = ler('src/desktop/tokens.web.ts');
const ui = ler('src/desktop/ui.web.tsx');
caso('a caixa não tem fio: a aresta de cima é luz, e o fundo desce de claro para escuro', () => {
  assert.match(tokens, /export const flutuante = \(raio: number, grande = false\) => \(\{\n\s+borderRadius: raio,\n\s+borderWidth: 0,/);
  assert.match(tokens, /backgroundImage: 'linear-gradient\(180deg, #17171D, #0E0E12 46%\)'/);
  assert.match(tokens, /inset 0 1px 0 rgba\(233,234,238,0\.09\)/);
  assert.match(tokens, /export const RAIO_FLUTUANTE = \{ dialogo: 20, menu: 14, aviso: 12 \} as const;/);
});
caso('usam-na o diálogo, o menu de contexto, o "Playing on…", os avisos, a barra das escolhidas e a pílula do salto', () => {
  assert.match(ui, /dialog: \{[^\n]*\.\.\.flutuante\(RAIO_FLUTUANTE\.dialogo, true\) \}/);
  assert.match(ui, /toast: \{[^\n]*\.\.\.flutuante\(RAIO_FLUTUANTE\.aviso\), overflow: 'hidden' \}/);
  assert.match(ui, /maxWidth: 420, \.\.\.flutuante\(17\) \}/);
  assert.match(ler('src/desktop/MenuDeContexto.web.tsx'), /position: 'fixed', padding: 6, \.\.\.flutuante\(RAIO_FLUTUANTE\.menu\),/);
  assert.match(ler('src/desktop/OutroAparelho.web.tsx'), /width: 360, \.\.\.flutuante\(RAIO_FLUTUANTE\.menu\), overflow: 'hidden',/);
  assert.match(ler('src/desktop/AvisoComDesfazer.web.tsx'), /\.\.\.flutuante\(RAIO_FLUTUANTE\.aviso\),/);
  assert.match(ler('src/desktop/BarraDaSelecao.web.tsx'), /paddingVertical: 6, \.\.\.flutuante\(RAIO\.pilula\) \}/);
});
caso('nenhuma delas voltou a ter a sua cor de fundo e o seu fio', () => {
  for (const f of ['src/desktop/MenuDeContexto.web.tsx', 'src/desktop/OutroAparelho.web.tsx']) {
    assert.doesNotMatch(ler(f), /backgroundColor: '#1[0-9A-Fa-f]{5}'/, f);
  }
  assert.doesNotMatch(ui, /dialog: \{[^\n]*borderColor: COR\.linha/);
});
caso('dentro de um diálogo: os botões em pílula, o secundário sem contorno, o destrutivo com fundo, o campo sem fio', () => {
  assert.match(ui, /const NoDialogo = createContext\(false\);/);
  assert.match(ui, /<NoDialogo\.Provider value>\{children\}<\/NoDialogo\.Provider>/);
  assert.match(ui, /noDialogo && ui\.buttonNoDialogo, noDialogo && secondary && !marcado && !danger && ui\.buttonSecNoDialogo, noDialogo && danger && ui\.buttonDangerNoDialogo,/);
  assert.match(ui, /buttonSecNoDialogo: \{ backgroundColor: ESTADO\.hover, borderColor: 'transparent' \},/);
  assert.match(ui, /noDialogo && !pilula && ui\.fieldNoDialogo/);
  assert.match(ui, /<View style=\{ui\.dialogFechar\}><IconButton name="close" label="Close dialog" atalho="Esc" onPress=\{onClose\} \/><\/View>/, 'o fechar num disco, com o mesmo nome e o mesmo atalho');
});

console.log('\no equalizador: a curva, numa vista só');
const eq = ler('src/desktop/PainelEqualizador.web.tsx');
caso('as dez bandas são uma curva, desenhada pela mesma onda do iPhone', () => {
  assert.match(eq, /const y = ondaDoEqualizador\(ganhos, LARGURA_DO_DESENHO, UTIL\);/);
  assert.match(eq, /<CurvaDoEqualizador\n\s+ganhos=\{g\}/);
  assert.doesNotMatch(eq, /DeslizadorVertical/);
  assert.match(eq, /strokeDasharray="2 5" vectorEffect="non-scaling-stroke"/, 'uma só linha do zero');
});
caso('cada banda continua a ser um slider: arrasto na vertical, setas de meio dB, duplo clique a zero', () => {
  assert.match(eq, /role="slider"\n\s+aria-label=\{`\$\{ETIQUETAS_BANDAS\[i\]\} band`\}/);
  assert.match(eq, /if \(e\.key === 'ArrowUp'\) \{ e\.preventDefault\(\); aoMudarBanda\(i, Math\.min\(GANHO_MAXIMO, valor \+ 0\.5\)\); \}/);
  assert.match(eq, /onDoubleClick=\{\(\) => aoMudarBanda\(i, 0\)\}/);
  assert.match(eq, /mudar\.current\(banda, Math\.round\(\(1 - f \* 2\) \* GANHO_MAXIMO \* 2\) \/ 2\);/);
});
caso('tudo numa vista: sem abas, a velocidade numa linha por baixo da curva, e um só rodapé', () => {
  assert.doesNotMatch(eq, /Tab|aba ===|setAba/, 'o João: "tudo numa aba e não em abas separadas"');
  assert.match(eq, /<BarraVelocidade rotulo="Speed" valor=\{rate\} aoMudar=\{aoMudarRate\} \/>/);
  assert.match(eq, /<EstadoDoAjuste guardado=\{naBaseRecomendada \|\| lembrado\}/);
  assert.match(eq, /if \(estado === 'error' && !offline\) return <AdjustmentSyncStatus \/>;/, 'com a sincronização falhada volta a peça que tem o retry');
  for (const velho of ['>SPEED<', '>EQUALISER<', '>RESET<', 'SAVE AS PRESET', 'WAITING FOR PLAYBACK']) assert.ok(!eq.includes(velho), `sem "${velho}" em maiúsculas`);
});
caso('abre com a cor da capa a lavar o topo, e sem escurecer o leitor', () => {
  const np = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
  assert.match(np, /<Dialog open=\{eqAberto\} title="Equaliser" onClose=\{\(\) => setEqAberto\(false\)\} width=\{580\} semVeu lavagem=\{corDoEq\}>/);
  assert.match(np, /const corDoEq = useCorDoAmbiente\(eqAberto \? track\?\.artworkUrl : null\);/, 'só se lê a capa com ele aberto');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

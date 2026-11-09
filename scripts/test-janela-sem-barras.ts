/**
 * A janela do PC sem barras (9/11, o João e um amigo: "detestamos estas barras";
 * maquete `docs/barras-da-janela-maquete.html`, opção A).
 *
 * Era uma caixa de cantos redondos com contorno, recuada 8 px da janela, com um
 * fio por baixo da barra do título, outro entre a lateral e a página, outro por
 * cima do leitor, outro dentro da lateral e outro à esquerda da fila. Agora é uma
 * superfície só: a lateral, a página e o leitor encostam às bordas e nada os
 * separa a não ser o espaço; a página desvanece antes do leitor.
 *
 * Lê os ficheiros como TEXTO.
 * Correr: node --experimental-strip-types scripts/test-janela-sem-barras.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const estilos = ler('src/desktop/estilos.web.ts');
const casca = ler('src/desktop/casca.web.tsx');
const navegador = ler('src/navigation/RootNavigator.web.tsx');
const painel = ler('src/desktop/PainelDoLeitor.web.tsx');
const ui = ler('src/desktop/ui.web.tsx');
const estilo = (nome: string) => {
  const m = new RegExp(`\\n  ${nome}: (\\{[^\\n]*\\}|\\{\\n[\\s\\S]*?\\n  \\})`).exec(estilos);
  assert.ok(m, `o estilo ${nome} existe`);
  return m![1]!;
};

console.log('\nsem moldura nem fios');
caso('a superfície não tem contorno, raio nem margens', () => {
  const main = estilo('main');
  for (const proibido of ['borderWidth', 'borderRadius', 'marginLeft', 'marginRight', 'marginTop']) {
    assert.ok(!main.includes(proibido), `o main tem ${proibido}`);
  }
});
caso('nenhum fio: barra do título, lateral, leitor e conta', () => {
  assert.ok(!estilo('titleBar').includes('borderBottom'), 'fio por baixo da barra do título');
  assert.ok(!estilo('sidebar').includes('borderRight'), 'fio entre a lateral e a página');
  assert.ok(!estilo('player').includes('borderTop'), 'fio por cima do leitor');
  assert.ok(!estilo('player').includes('marginLeft'), 'o leitor recuado da janela');
  assert.ok(!estilo('accountRow').includes('borderTop'), 'fio por baixo do Social');
  assert.ok(!estilo('account').includes('borderTop'), 'fio por cima da conta');
});
caso('a fila encostada não tem linha nem fundo; por cima da página tem fundo', () => {
  assert.doesNotMatch(painel, /borderLeftWidth/);
  assert.match(painel, /backgroundColor: porCimaAgora \? FUNDO_POR_CIMA : 'transparent'/);
});

console.log('\numa superfície só');
caso('o fundo vai na superfície, que leva a lateral, a página e o leitor', () => {
  assert.match(navegador, /<V style=\{\[styles\.superficie, [^\]]*bgStyle\]\}/);
  assert.match(navegador, /<\/PainelDoLeitor><\/View><\/View><PlayerBar [^\n]*?leitor: 'barra' \}\); \}\} \/><\/V>/, 'o leitor dentro da superfície');
});
caso('a barra de título é a faixa por cima da página, e a marca está no topo da lateral', () => {
  assert.match(navegador, /<View style=\{styles\.colunaDaPagina\}><TitleBar comPainel semMarca \/><PainelDoLeitor /);
  assert.match(casca, /<View style=\{\[styles\.sidebar, \{ flex: 1, minHeight: 0 \}\]\}>\n\s+<MarcaDaJanela compacta=\{compacta\} \/>/);
  assert.match(estilo('marcaDaJanela'), /WebkitAppRegion: 'drag'/, 'a marca arrasta a janela');
  assert.match(casca, /onDoubleClick=\{\(\) => window\.duotoneDesktop\?\.toggleMaximize\(\)\}>\n\s+<Image source=\{require\('\.\.\/\.\.\/assets\/auth-logo\.png'\)\}/, 'e o duplo clique maximiza');
});
caso('a página desvanece antes do leitor, e a barra de rolar só aparece com o rato', () => {
  assert.match(ui, /<ScrollView\n\s+ref=\{ref\}\n\s+\{\.\.\.marcar\('rolo-da-pagina'\)\}/);
  assert.match(casca, /\[data-dt~="rolo-da-pagina"\]\{ -webkit-mask-image: linear-gradient\(180deg, #000 calc\(100% - 40px\), transparent\)/);
  assert.match(casca, /::-webkit-scrollbar-thumb\{background:transparent;/);
  assert.match(casca, /\*:hover::-webkit-scrollbar-thumb\{background:#30303b;/);
});

caso('as lavagens da página desfazem-se nos lados e em cima (a borda reta lia-se como um fio)', () => {
  assert.match(ui, /<View \{\.\.\.marcar\('lavagem'\)\} pointerEvents="none" aria-hidden style=\{\[ui\.lavagem,/);
  assert.match(casca, /\[data-dt~="lavagem"\], \[data-dt~="lavagem-da-playlist"\]\{\n\s+-webkit-mask-image: linear-gradient\(90deg, transparent, #000 160px, #000 calc\(100% - 160px\), transparent\), linear-gradient\(180deg, transparent, #000 56px\);/);
  assert.match(casca, /mask-composite: intersect;/);
});

console.log('\na tabela com a fila aberta');
caso('o artista fica a 32 px do título', () => {
  assert.match(ui, /colunaDoArtista: \{ flex: 0\.6, minWidth: 0, paddingLeft: ESP\.xl, paddingRight: ESP\.sm \}/);
  assert.doesNotMatch(ui, /ui\.colunaDoArtista, \{ paddingHorizontal: ESP\.sm \}/, 'a cabeça e as linhas usam a mesma coluna');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

/**
 * Os estados dos controlos (20/10, revisão de qualidade B3; escolhidos pelo
 * João na maquete `docs/estados-dos-controlos.html`).
 *
 * - Escolhido não se confunde com hover (PC): hover = luz a 5,5 %; escolhido =
 *   metal a 12 % com aresta a 28 % (`ESTADO` em `tokens.web.ts`).
 * - O anel do foco do PC fica POR FORA: por dentro e na cor do tema, não se via
 *   no botão principal, que é de metal.
 * - Em progresso NÃO é indisponível, nas duas plataformas: fica a 100 %, com a
 *   roda e o texto. Indisponível continua apagado.
 *
 * Lê os ficheiros como TEXTO (o `tokens.web.ts` faz `require` das fontes).
 * Correr: node --experimental-strip-types scripts/test-estados-dos-controlos.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function ficheiros(pasta: string, filtro: (f: string) => boolean): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n).replace(/\\/g, '/');
    return statSync(f).isDirectory() ? ficheiros(f, filtro) : filtro(f) ? [f] : [];
  });
}

const tokens = ler('src/desktop/tokens.web.ts');
const ui = ler('src/desktop/ui.web.tsx');
const casca = ler('src/desktop/casca.web.tsx');

console.log('\nescolhido e hover no PC');
caso('a regra vive nos tokens', () => {
  assert.match(tokens, /export const ESTADO = \{/);
  assert.match(tokens, /hover: COR\.linhaSuave,/);
  assert.match(tokens, /escolhido: \{ backgroundColor: COR\.metalSuave, boxShadow: 'inset 0 0 0 1px rgba\(233,234,238,0\.28\)' \}/);
  assert.match(tokens, /aresta: 'rgba\(233,234,238,0\.28\)',/);
});
caso('o botão de ícone e os separadores usam-na', () => {
  assert.match(ui, /iconButtonHover: \{ backgroundColor: ESTADO\.hover \},/);
  assert.match(ui, /active: ESTADO\.escolhido,/);
  assert.match(ui, /separadorHover: \{ backgroundColor: ESTADO\.hover \},/);
  assert.match(ui, /separadorPilula: \{[^}]*\.\.\.ESTADO\.escolhido \}/);
  assert.match(ui, /buttonMarcado: \{ backgroundColor: COR\.metalSuave, borderColor: ESTADO\.aresta \},/);
});
caso('o hover nunca pinta por cima do escolhido', () => {
  const painel = ler('src/desktop/PainelDoLeitor.web.tsx');
  assert.doesNotMatch(painel, /hovered \|\| focused \|\| estado\.aba === aba/, 'as abas Queue/Lyrics: hover e escolhida eram o mesmo cinzento');
  assert.match(painel, /estado\.aba === aba \? ESTADO\.escolhido : \(hovered \|\| focused\) && \{ backgroundColor: ESTADO\.hover \}/);
  const biblioteca = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  assert.match(biblioteca, /hovered && ordem !== o && artistStyles\.ordemHover/);
  for (const f of ['src/desktop/paginas/ProfilePage.web.tsx', 'src/desktop/paginas/RetrospetivaPage.web.tsx']) {
    assert.doesNotMatch(ler(f), /smallSegmentActive, hovered && styles\.settingHover/, f);
  }
  assert.match(ler('src/desktop/estilos.web.ts'), /smallSegmentActive: ESTADO\.escolhido/);
});

console.log('\no anel do foco do PC');
caso('por fora, com folga, e por dentro só nas linhas das listas', () => {
  assert.match(casca, /\[tabindex\]:not\(\[tabindex="-1"\]\):not\(\[role="slider"\]\):focus-visible\{outline:2px solid var\(--accent-color, #E9EAEE\)!important;outline-offset:2px\}/);
  assert.match(casca, /\[data-dt~="fila"\]\[tabindex\]:not\(\[tabindex="-1"\]\):focus-visible\{outline-offset:-2px\}/);
});

console.log('\nem progresso não é indisponível');
caso('PC: o Button ocupado fica a 100 %, com a roda, e anuncia-se ocupado', () => {
  assert.match(ui, /ocupado\?: boolean;/);
  assert.match(ui, /accessibilityState=\{\{ disabled: disabled \|\| ocupado, busy: ocupado \}\}/);
  assert.match(ui, /disabled && !ocupado && ui\.disabled/);
  assert.match(ui, /\{ocupado \? <ActivityIndicator size=\{16\} color=\{corDoTexto\} \/>/);
});
caso('PC: nenhum botão "a fazer…" usa o disabled para isso', () => {
  // `disabled={x}` com `{x ? 'Saving…' : ...}` é o padrão que o B3 tirou.
  const errados: string[] = [];
  for (const f of [...ficheiros('src', (x) => x.endsWith('.web.tsx'))]) {
    const texto = ler(f);
    for (const m of texto.matchAll(/<Button\b[^>]*?disabled=\{([^{}]+)\}[^>]*>\s*\{([^{}?]+)\?\s*'[^']*…'/g)) {
      const condicao = m[1]!.trim(), rotulo = m[2]!.trim();
      if (condicao === rotulo || condicao.split(/\s*\|\|\s*/).includes(rotulo)) errados.push(`${f}: disabled={${condicao}} com ${rotulo} ? '…'`);
    }
  }
  assert.deepEqual(errados, []);
});
caso('iPhone: o PillButton a carregar mostra a roda E o texto, e não apaga', () => {
  const pill = ler('src/components/PillButton.tsx');
  assert.match(pill, /\{loading \? <><ActivityIndicator color=\{theme\.textColorOnGradient\} \/>\{inner\}<\/> : inner\}/);
  assert.match(pill, /disabled && !loading && \{ opacity: 0\.45 \}/);
  assert.doesNotMatch(pill, /\(disabled \|\| loading\) && \{ opacity/);
  assert.match(pill, /busy: !!loading/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');

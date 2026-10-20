/**
 * A identidade do PC (20/10, revisão de qualidade Q6): metal sobre quase-preto,
 * com a cor reservada ao que significa alguma coisa. O roxo saiu do símbolo e
 * dos tokens a 18/9 (`desktop/tokens.web.ts`), mas sobrevivia escrito à mão --
 * na linha de progresso e no anel do foco do mini leitor, e em duas bordas de
 * seleção. Este teste falha se um roxo voltar a uma superfície do PC, e se o
 * mini leitor voltar à paleta e à letra do iPhone.
 *
 * Lê os ficheiros como TEXTO (o `tokens.web.ts` faz `require` das fontes).
 * Correr: node --experimental-strip-types scripts/test-identidade-do-pc.ts
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
/** Sem comentários: contar a história de um roxo que saiu não é usá-lo. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}(,])\/\/.*$/gm, '$1');

function ficheiros(pasta: string, filtro: (f: string) => boolean): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n).replace(/\\/g, '/');
    return statSync(f).isDirectory() ? ficheiros(f, filtro) : filtro(f) ? [f] : [];
  });
}
/** As superfícies do PC: a casca, as páginas, os pares `.web` e o mini leitor. */
const DO_PC = [
  ...ficheiros('src/desktop', (f) => /\.(tsx?|ts)$/.test(f)),
  ...ficheiros('src/components', (f) => f.endsWith('.web.tsx')),
  ...ficheiros('src/navigation', (f) => f.endsWith('.web.tsx')),
  'src/janelaMini.web.tsx',
];

/** O tom (0-360), a saturação e a luz (0-1) de uma cor. */
function hsl(r: number, g: number, b: number): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
/** Roxo/violeta a sério: o tom entre o azul e o magenta, com cor que se veja. */
function eRoxo(r: number, g: number, b: number): boolean {
  const [h, s, l] = hsl(r, g, b);
  return h >= 245 && h <= 300 && s >= 0.3 && l >= 0.15 && l <= 0.9;
}
function coresDe(texto: string): { escrito: string; rgb: [number, number, number] }[] {
  const fora: { escrito: string; rgb: [number, number, number] }[] = [];
  for (const m of texto.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const n = parseInt(m[1]!, 16);
    fora.push({ escrito: m[0], rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255] });
  }
  for (const m of texto.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    fora.push({ escrito: m[0], rgb: [Number(m[1]), Number(m[2]), Number(m[3])] });
  }
  return fora;
}

console.log('\nsem roxo no PC');
caso('o detetor reconhece os roxos que lá estiveram (senão o teste não morde)', () => {
  for (const c of ['#8B5CF6', '#A78BFA', '#7C3AED', '#7C5CE5', '#3D315E']) {
    const n = parseInt(c.slice(1), 16);
    assert.ok(eRoxo((n >> 16) & 255, (n >> 8) & 255, n & 255), c);
  }
  assert.ok(eRoxo(155, 123, 255), 'rgba(155,123,255)');
  for (const c of [[233, 234, 238], [6, 6, 8], [190, 95, 98], [198, 164, 78], [127, 176, 105], [53, 53, 64]] as const) {
    assert.ok(!eRoxo(...c), `não é roxo: ${c.join(',')}`);
  }
});
caso('nenhuma superfície do PC escreve um roxo', () => {
  assert.ok(DO_PC.length > 40, `só ${DO_PC.length} ficheiros: o caminho mudou?`);
  const achados: string[] = [];
  for (const f of DO_PC) {
    for (const c of coresDe(semComentarios(ler(f)))) if (eRoxo(...c.rgb)) achados.push(`${f}: ${c.escrito}`);
  }
  assert.deepEqual(achados, []);
});

console.log('\no mini leitor fala a língua da janela principal');
const mini = ler('src/janelaMini.web.tsx');
caso('as cores e as letras vêm dos tokens do PC', () => {
  assert.match(mini, /import \{ COR, cssDasFontes, FONT, RAIO \} from '\.\/desktop\/tokens\.web';/);
  assert.match(mini, /<style>\{cssDasFontes\(\) \+ CSS\}<\/style>/, 'as fontes registadas neste documento');
  assert.match(mini, /font-family: \$\{FONT\.body\}/);
  assert.match(mini, /\.linha > div \{ height: 2px; background: \$\{COR\.metalClaro\}; \}/, 'a linha de progresso é o metal');
  assert.match(mini, /button:focus-visible \{ outline: 2px solid \$\{COR\.metalClaro\};/);
});
caso('sem a paleta nem a letra do iPhone', () => {
  for (const proibido of ['#14141C', '#F5F5F7', '#1b1b25', '245,245,247', 'Segoe UI']) {
    assert.ok(!mini.includes(proibido), `o mini leitor ainda escreve ${proibido}`);
  }
});
caso('a janela principal e o mini leitor registam as fontes no mesmo sítio', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /fontes\.textContent = cssDasFontes\(\);/);
  assert.match(ler('src/desktop/tokens.web.ts'), /export function cssDasFontes\(\): string \{/);
  assert.doesNotMatch(casca, /face\('Archivo'/, 'as @font-face já não se escrevem na casca');
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

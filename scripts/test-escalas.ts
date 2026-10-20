/**
 * As escalas de letra e de raio (20/10, revisão de qualidade B1).
 *
 * Cada plataforma tem a sua: o PC o `TIPO` e o `RAIO` de `desktop/tokens.web.ts`
 * (4/8/14/pílula), o iPhone o `type` e o `radii` de `theme/index.ts`
 * (8/12/16/24/pílula). Andavam por fora delas meios pontos de letra (11,5,
 * 12,5, 13,5, 14,5) e raios de 5, 6, 7, 9, 10, 11 e 17 -- cada um escolhido à
 * mão num componente que já tinha um equivalente na escala. O B1 pô-los no
 * degrau do equivalente (uma capa pequena como o `Artwork`/a `TrackRow`, uma
 * linha de menu como o `MenuDeContexto`, um controlo como o `IconButton`).
 *
 * Este teste falha se um deles voltar. Ficam os círculos e as pílulas (o raio
 * é metade do lado: o ponto de online, o emblema), e as exceções de baixo.
 *
 * Lê os ficheiros como TEXTO. Correr: node --experimental-strip-types scripts/test-escalas.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Ficheiro → porque é que ali fica. */
const EXCECOES: Record<string, string> = {
  'src/components/PlayerRoot.tsx': 'o leitor do iPhone não se mexe sem o João pedir',
  // A letra do aviso do handoff está toda fora da escala (9, 11, 10,5, 13):
  // dobrar só o 10,5 deixava a terceira linha maior do que a segunda.
  'src/components/HandoffBanner.web.tsx': 'a letra do cartão do handoff, por refazer inteira (backlog)',
};
const RAIOS_SOLTOS = new Set([5, 6, 7, 9, 10, 11, 17]);

function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n).replace(/\\/g, '/');
    return statSync(f).isDirectory() ? ficheiros(f) : /\.tsx?$/.test(f) ? [f] : [];
  });
}
/** Sem comentários: contar a história de um valor que saiu não é usá-lo. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/(^|[\s;{}(,])\/\/.*$/gm, '$1');

/** O objeto de estilo (ou o bloco de CSS) à volta de uma posição. */
function blocoEm(texto: string, i: number): string {
  let a = i, b = i, prof = 0;
  for (; a > 0; a--) { const c = texto[a]; if (c === '}') prof++; else if (c === '{') { if (prof === 0) break; prof--; } }
  for (prof = 0; b < texto.length; b++) { const c = texto[b]; if (c === '{') prof++; else if (c === '}') { if (prof === 0) break; prof--; } }
  return texto.slice(a, b + 1);
}
/** Um círculo ou uma pílula: o raio é metade de um lado (arredondado para cima). */
function eRedondo(bloco: string, raio: number): boolean {
  const lados = [...bloco.matchAll(/(?:^|[^a-zA-Z-])(?:width|height|minWidth|minHeight|min-width|min-height)\s*:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return lados.some((l) => Math.ceil(l / 2) === raio);
}

const errados: string[] = [];
for (const f of ficheiros('src')) {
  if (f in EXCECOES) continue;
  const texto = semComentarios(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  const linha = (i: number) => texto.slice(0, i).split('\n').length;
  for (const m of texto.matchAll(/(?:fontSize\s*:\s*|font-size\s*:\s*)(\d+\.5)\b/g)) {
    errados.push(`${f}:${linha(m.index!)}  letra ${m[1]} (fora da escala)`);
  }
  for (const m of texto.matchAll(/(?:borderRadius\s*:\s*|border-radius\s*:\s*)(\d+(?:\.\d+)?)(?:px)?\b/g)) {
    const r = Number(m[1]);
    if (!RAIOS_SOLTOS.has(r) || eRedondo(blocoEm(texto, m.index!), r)) continue;
    errados.push(`${f}:${linha(m.index!)}  raio ${r} (fora da escala)`);
  }
}

if (errados.length) {
  console.error(`  FALHOU - valores fora das escalas (TIPO/RAIO no PC, type/radii no iPhone):\n    ${errados.join('\n    ')}`);
  process.exit(1);
}
console.log(`  ok - letra e raios nas escalas, fora dos círculos e das ${Object.keys(EXCECOES).length} exceções`);

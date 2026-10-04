/**
 * A fila numa folha NATIVA do iOS, e a reordenação no Gesture Handler (3/10,
 * item 7 de docs/barra-home-folhas.html). Lê os ficheiros: o resto (a folha a
 * subir, a app de trás a recuar, o arrasto a ganhar à folha) só se vê no iPhone.
 *
 * Correr: node --experimental-strip-types scripts/test-folha-da-fila.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');

caso('a fila é um ecrã do stack apresentado como folha nativa, a meio e inteira', () => {
  const nav = ler('src/navigation/RootNavigator.tsx');
  const bloco = /name="Fila"[\s\S]*?\/>/.exec(nav)?.[0] ?? '';
  assert.match(bloco, /presentation: 'formSheet'/);
  assert.match(bloco, /sheetAllowedDetents: \[0\.5, 1\]/);
  assert.match(bloco, /sheetGrabberVisible: true/);
});
caso('o leitor abre-a pela navegação e já não desenha a folha feita à mão', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.match(leitor, /navigationRef\.navigate\('Fila'\)/);
  assert.doesNotMatch(leitor, /<QueueSheet/);
  assert.match(leitor, /registarAccoesDaFila\(/, 'o Jam e a página do artista continuam a abrir dali');
});
caso('a folha tem uma raiz do Gesture Handler e a fila sem moldura', () => {
  const ecra = ler('src/screens/FilaScreen.tsx');
  assert.match(ecra, /<GestureHandlerRootView/);
  assert.match(ecra, /<QueueSheet\s+nativa/);
  assert.match(ler('src/components/QueueSheet.tsx'), /nativa \? \(/);
});
caso('arrastar uma música é do Gesture Handler (ganha à folha do iOS), não do PanResponder', () => {
  const linha = ler('src/components/LinhaArrastavel.tsx');
  assert.match(linha, /activateAfterLongPress=\{TOQUE_LONGO_PARA_ARRASTAR_MS\}/);
  assert.match(linha, /<PanGestureHandler minDist=\{1\}/, 'a pega pega ao primeiro movimento');
  assert.doesNotMatch(linha, /PanResponder.create/);
});
caso('o toque longo já não passa pelo TrackRow, e deslizar não põe na fila', () => {
  for (const f of ['src/components/QueueSheet.tsx', 'src/screens/PlaylistDetailScreen.tsx']) {
    const c = ler(f);
    assert.doesNotMatch(c, /onLongPress=\{[^}]*comecarArrasto/, `${f} ainda pega pelo toque longo do TrackRow`);
    assert.match(c, /deslizarParaAFila=\{false\}/, `${f}: sem o onLongPress, deslizar voltava a pôr na fila`);
    assert.match(c, /envolverPega \? envolverPega\(pega\) : pega/);
  }
});
caso('a base de baixo não muda por baixo da folha', () => {
  // A `Folha` é a rota das outras folhas nativas (4/10).
  assert.match(ler('src/lib/doca.ts'), /FOLHAS: ReadonlySet<string> = new Set\(\['Fila', 'Folha'\]\)/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');

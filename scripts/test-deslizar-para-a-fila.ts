// O deslizar uma música para a direita para a pôr na fila SAIU (6/10).
//
// Existiu de 29/9 a 6/10 (`DeslizarParaAFila`, em todas as linhas de música do
// iPhone). Um gesto lateral numa linha compete sempre com o arrastar entre as
// secções da app -- que é o gesto que o João usa a toda a hora --, e no
// telemóvel dele nem chegava a pôr a música na fila. Este teste prende a saída:
// nenhuma linha volta a ter gesto lateral, e o "Add to queue" continua no menu.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const linha = ler('src/components/TrackRow.tsx');

assert.ok(!existsSync(new URL('../src/components/DeslizarParaAFila.tsx', import.meta.url)), 'o componente do gesto saiu');
assert.doesNotMatch(linha, /DeslizarParaAFila|PanGestureHandler|PanResponder/,
  'a linha de uma música não tem gesto lateral: o arrastar entre secções é da página');
assert.doesNotMatch(linha, /deslizarParaAFila/, 'nem a opção');

const menu = ler('src/lib/menuDaFaixa.ts');
assert.match(menu, /case 'por-na-fila': return acao\('Add to queue'/, 'pôr na fila continua no "…" de cada música');

console.log('Deslizar para a fila: saiu, e a linha deixa o arrastar entre secções em paz.');

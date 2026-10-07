/**
 * "O teu mês" (7/10) -- src/lib/resumoDoMes.ts e a story que o mostra.
 *
 * Correr: node --experimental-strip-types scripts/test-resumo-do-mes.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  calcularResumoDoMes, chaveDoMes, DIAS_DE_JANELA, horaEmTexto, inicioDaLeitura, mesAnterior, MINIMO_DE_ESCUTAS,
  mostrarResumo, nomeDoMes, tempoGrande,
} from '../src/lib/resumoDoMes.ts';
import type { PlayRow } from '../src/lib/listeningStats.ts';

// --- Quando aparece: nos primeiros dias do mês, uma vez ---
assert.deepEqual(mesAnterior(new Date(2026, 9, 3)), { ano: 2026, mes: 8 });
assert.deepEqual(mesAnterior(new Date(2027, 0, 1)), { ano: 2026, mes: 11 }, 'janeiro resume dezembro do ano anterior');
assert.equal(chaveDoMes({ ano: 2026, mes: 8 }), '2026-09');
assert.equal(nomeDoMes({ ano: 2026, mes: 8 }), 'September');
assert.equal(mostrarResumo(new Date(2026, 9, 1, 9), null), true, 'dia 1: mostra');
assert.equal(mostrarResumo(new Date(2026, 9, DIAS_DE_JANELA, 23), null), true, 'até ao fim da janela');
assert.equal(mostrarResumo(new Date(2026, 9, DIAS_DE_JANELA + 1), null), false, 'depois, já não');
assert.equal(mostrarResumo(new Date(2026, 9, 2), '2026-09'), false, 'uma vez por mês');
assert.equal(mostrarResumo(new Date(2026, 10, 2), '2026-09'), true, 'o mês seguinte volta a mostrar');
const inicio = new Date(inicioDaLeitura(new Date(2026, 9, 3)));
assert.deepEqual([inicio.getFullYear(), inicio.getMonth(), inicio.getDate()], [2026, 7, 1], 'lê desde agosto, para comparar');

// --- As contas ---
const linha = (dia: number, hora: number, titulo: string, artista: string, mes = 8): PlayRow => ({
  playedAt: new Date(2026, mes, dia, hora, 0).toISOString(), source: 'youtube', sourceId: titulo,
  title: titulo, artist: artista, artworkUrl: `https://capa/${titulo}`, durationSeconds: 180,
});
const setembro: PlayRow[] = [];
// 30 escutas: 15 de "Lean 4 Real" (Skepta), 10 do Dillaz, 5 do Bispo, em dias 1-5 seguidos e no 20.
for (let i = 0; i < 15; i++) setembro.push(linha(1 + (i % 5), 23, 'Lean 4 Real', 'Skepta'));
for (let i = 0; i < 10; i++) setembro.push(linha(2 + (i % 3), 15, 'Mo Bamba', 'Dillaz'));
for (let i = 0; i < 5; i++) setembro.push(linha(20, 23, 'Bairro', 'Bispo'));
const agosto = Array.from({ length: 10 }, (_, i) => linha(10 + i, 12, 'Velha', 'Skepta', 7));
const outubro = [linha(1, 10, 'Nova', 'Outro', 9)];

const r = calcularResumoDoMes([...outubro, ...setembro, ...agosto], { ano: 2026, mes: 8 })!;
assert.ok(r, 'há resumo');
assert.equal(r.nome, 'September');
assert.equal(r.escutas, 30, 'só as do mês resumido');
assert.equal(r.minutos, 90, '30 × 3 min');
assert.equal(r.dias, 6, 'dias 1-5 e 20');
assert.equal(r.seguidos, 5, 'cinco dias seguidos');
assert.equal(r.hora, 23, 'a hora a que mais se ouviu');
assert.equal(r.variacao, 200, 'agosto teve 30 min: +200%');
assert.deepEqual(r.artistas.map((a) => [a.nome, a.escutas]), [['Skepta', 15], ['Dillaz', 10], ['Bispo', 5]]);
assert.equal(r.musicas[0].titulo, 'Lean 4 Real');
assert.equal(r.musicas[0].escutas, 15);
assert.equal(r.novos, 2, 'Dillaz e Bispo não se ouviram em agosto');

// Sem o mês antes, não há comparação nem "novos" (não se sabe).
const sem = calcularResumoDoMes(setembro, { ano: 2026, mes: 8 })!;
assert.equal(sem.variacao, null);
assert.equal(sem.novos, 0);

// Um mês quase parado não merece um ecrã inteiro.
assert.equal(calcularResumoDoMes(setembro.slice(0, MINIMO_DE_ESCUTAS - 1), { ano: 2026, mes: 8 }), null);

assert.deepEqual(tempoGrande(90), { valor: '90', unidade: 'minutes' });
assert.deepEqual(tempoGrande(2280), { valor: '38', unidade: 'hours' });
assert.equal(horaEmTexto(0), 'midnight');
assert.equal(horaEmTexto(12), 'noon');
assert.equal(horaEmTexto(23), '11 pm');
assert.equal(horaEmTexto(9), '9 am');

// --- A story: três páginas, por cima de tudo, e o cartaz da semana saiu ---
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const story = ler('src/components/ResumoDoMes.tsx');
assert.match(story, /export const PAGINAS = 3;/);
assert.match(story, /<Modal visible transparent/, 'cobre o ecrã todo');
assert.match(story, /onPressIn=\{pausar\} onPressOut=\{retomar\}/, 'premir pausa');
assert.match(story, /if \(x < largura \/ 3\) setPagina/, 'o terço da esquerda volta, o resto avança');
assert.match(story, /void setResumoVistoEm\(chaveDoMes\(mes\)\)/, 'marca-se ao mostrar');
assert.match(story, /if \(!resumo \|\| tapado\) return null;/, 'não sobe por cima da abertura');
assert.match(ler('App.tsx'), /<ResumoDoMes \/>/);
for (const f of ['src/components/CartazDaSemana.tsx', 'src/lib/sextaFeira.ts', 'src/api/aSemana.ts']) {
  assert.equal(existsSync(new URL(`../${f}`, import.meta.url)), false, `${f}: o cartaz de sexta saiu`);
}

console.log('O teu mês: janela, contas, story e a saída do cartaz semanal passaram.');

/**
 * "O teu mês" (7/10) -- src/lib/resumoDoMes.ts e a story que o mostra.
 *
 * Correr: node --experimental-strip-types scripts/test-resumo-do-mes.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  calcularResumoDoMes, chaveDoMes, DIAS_DE_JANELA, diasNoMes, duracaoEmTexto, fraseDoCalendario, fraseDoTempo,
  horaEmTexto, inicioDaLeitura, LUGARES_DO_LEQUE, mesAnterior, MINIMO_DE_ESCUTAS, mostrarResumo, nomeDoMes,
  tempoGrande, tipoDeOuvinte,
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
// --- As contas novas (1/11, docs/recap-maquete.html): o calendário, o relógio, a música e o artista ---
assert.equal(diasNoMes({ ano: 2026, mes: 8 }), 30);
assert.equal(diasNoMes({ ano: 2028, mes: 1 }), 29, 'fevereiro de um ano bissexto');
assert.equal(r.diasDoMes, 30);
assert.equal(r.porDia.length, 30, 'um valor por dia do mês');
assert.equal(r.porDia.reduce((a, b) => a + b, 0), 90, 'os dias somam os minutos do mês');
assert.equal(r.porDia[0], 9, 'dia 1: três de Lean 4 Real × 3 min (as do Dillaz começam no dia 2)');
assert.equal(r.porDia[19], 15, 'dia 20: cinco do Bispo × 3 min');
assert.equal(r.porDia[10], 0, 'um dia sem música é zero');
assert.equal(r.primeiroDia, 1, '1 de setembro de 2026 é uma terça (a segunda é 0)');
assert.equal(r.porHora.length, 24);
assert.equal(r.porHora[23], 20, '15 do Skepta e 5 do Bispo às 23 h');
assert.equal(r.porHora[15], 10);
assert.equal(r.minutosAntes, 30, 'agosto: 10 × 3 min');
assert.equal(r.nomeAntes, 'Aug');
assert.equal(sem.minutosAntes, null);
assert.equal(r.artistas[0].parte, 50, 'o Skepta foi metade das escutas');
assert.deepEqual([r.musicas[0].source, r.musicas[0].sourceId], ['youtube', 'Lean 4 Real'], 'a faixa para o "Play your top 5"');
assert.equal(r.musicas[0].minutos, 45, '15 × 3 min');
assert.equal(r.musicas[0].durationSeconds, 180);
assert.equal(duracaoEmTexto(232), '3 h 52 min');
assert.equal(duracaoEmTexto(45), '45 min');
assert.equal(duracaoEmTexto(120), '2 h');
assert.equal(fraseDoTempo({ minutos: 194 * 60, dias: 31 }), "That's 8 days of nonstop music.");
assert.equal(fraseDoTempo({ minutos: 90, dias: 6 }), 'About 15 minutes on each day you listened.');
assert.equal(fraseDoCalendario({ dias: 31, diasDoMes: 31 }), 'Every single day');
assert.equal(fraseDoCalendario({ dias: 22, diasDoMes: 31 }), '22 of 31 days');
assert.equal(tipoDeOuvinte(17), 'An afternoon listener');
assert.equal(tipoDeOuvinte(8), 'A morning listener');
assert.equal(tipoDeOuvinte(20), 'An evening listener');
assert.equal(tipoDeOuvinte(2), 'A night owl');
assert.equal(tipoDeOuvinte(23), 'A night owl');
assert.deepEqual([...LUGARES_DO_LEQUE], [0, -1, 1, -2, 2], 'a primeira capa ao meio, as outras alternadas');

// --- A story: seis páginas, por cima de tudo ---
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const story = ler('src/components/ResumoDoMes.tsx');
const paginas = ler('src/components/PaginasDoResumo.tsx');
assert.match(story, /export const DURACOES_DAS_PAGINAS_MS = \[5200, 7000, 7000, 7500, 7000, 9000\] as const;/);
assert.match(paginas, /export const PAGINAS_DO_RESUMO = \[PaginaDoMes, PaginaDoTempo, PaginaDoArtista, PaginaDaMusica, PaginaDoRitmo, PaginaDoCartaz\];/);
assert.match(story, /<Modal visible transparent/, 'cobre o ecrã todo');
assert.match(story, /onPressIn=\{pausar\} onPressOut=\{retomar\}/, 'premir pausa');
assert.match(story, /if \(x < largura \/ 3\) recuar\(\);/, 'o terço da esquerda volta, o resto avança');
// O lado conta-se pela página: o locationX é relativo ao elemento tocado, e um
// toque à esquerda em cima de um texto avançava (visto no ensaio do PC, 1/11).
assert.match(story, /onPress=\{\(e\) => tocar\(e\.nativeEvent\.pageX\)\}/);
assert.ok(!/nativeEvent\.locationX/.test(story));
// A zona dos toques não é um botão: tem botões dentro ("Play your top 5", "Done").
assert.match(story, /<Pressable accessible=\{false\} style=\{StyleSheet\.absoluteFill\}/);
assert.match(story, /if \(finished && pagina < PAGINAS - 1\) avancar\(\)/, 'o cartaz não fecha sozinho');
assert.match(story, /void setResumoVistoEm\(chaveDoMes\(mes\)\)/, 'marca-se ao mostrar');
assert.match(story, /if \(!resumo \|\| tapado\) return null;/, 'não sobe por cima da abertura');
assert.match(story, /tocarLista\(faixas, false, false, \{ tipo: 'prateleira', nome: `Your \$\{resumo\.nome\}` \}\)/, '"Play your top 5" diz de onde vem');
assert.match(story, /useTeclasDoResumo\(\{ seguinte: avancar, anterior: recuar, pausa: alternarPausa, fechar: aoFechar \}\)/);
assert.ok(!/Animated\.parallel/.test(story + paginas), 'nada de Animated.parallel (a regra da casa)');
// Os títulos e as capas limpos (eram os do vídeo, com "[Official Video]" e as faixas pretas).
assert.match(paginas, /tituloDaFaixa\(\{ source: m\.source, title: m\.titulo, artist: m\.artista \}\)/);
assert.match(paginas, /const capa = \(uri: string \| null\) => capaParaLista\(uri\);/);
// Com menos movimento nada voa nem conta.
assert.match(paginas, /const \[n, setN\] = useState\(reduzido \? alvo : 0\);/);
assert.match(paginas, /useRef\(new Animated\.Value\(reduzido \? 1 : 0\)\)/);
// O teclado só no PC, e os atalhos da janela parados enquanto ela está aberta.
const teclas = ler('src/components/teclasDoResumo.web.ts');
assert.match(teclas, /pausarAtalhosDaJanela\(true\);[\s\S]*pausarAtalhosDaJanela\(false\);/);
assert.match(ler('src/components/teclasDoResumo.ts'), /export function useTeclasDoResumo\(_acoes: AcoesDoTeclado\): void \{\}/);
// Rever nas estatísticas, nas tuas (não nas de um amigo).
assert.match(ler('src/screens/ListeningStatsScreen.tsx'), /\{!route\.params\?\.userId && [^\n]*\n\s*<Pressable\n\s*onPress=\{abrirResumoDoMes\}/);
assert.match(ler('src/desktop/paginas/ProfilePage.web.tsx'), /\(!userId \|\| userId === ownId\) && \(stats\?\.totalPlays \?\? 0\) > 0 \? <Button secondary icon="calendar-outline" onPress=\{abrirResumoDoMes\}>/);
assert.match(ler('App.tsx'), /<ResumoDoMes \/>/);
for (const f of ['src/components/CartazDaSemana.tsx', 'src/lib/sextaFeira.ts', 'src/api/aSemana.ts']) {
  assert.equal(existsSync(new URL(`../${f}`, import.meta.url)), false, `${f}: o cartaz de sexta saiu`);
}

console.log('O teu mês: janela, contas (o calendário, o relógio, a música), as seis páginas, o rever e a saída do cartaz semanal passaram.');

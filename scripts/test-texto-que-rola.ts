/**
 * Os números que rolam (25/11, item 5 do plano): as contas do `lib/textoQueRola.ts`
 * e onde a peça entra.
 *
 * Correr: node --experimental-strip-types scripts/test-texto-que-rola.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bocadosDoTexto, duracaoDoRolar, ROLAR } from '../src/lib/textoQueRola.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

caso('só os algarismos rolam; o resto fica como está', () => {
  assert.deepEqual(bocadosDoTexto('≈ 2h 07m').map((b) => b.algarismo), [null, null, 2, null, null, 0, 7, null]);
  assert.deepEqual(bocadosDoTexto('87%').map((b) => b.ch), ['8', '7', '%']);
});

caso('a passagem dura o da maquete, e o algarismo da esquerda parte por último', () => {
  assert.equal(ROLAR.duracaoMs, 1150);
  assert.equal(ROLAR.atrasoPorAlgarismoMs, 70);
  assert.equal(duracaoDoRolar('1,204'), 1150 + 3 * 70);
  assert.equal(duracaoDoRolar('sem números'), 0);
});

caso('a peça: driver nativo, Reduzir movimento parado, e algarismos de largura fixa', () => {
  const p = ler('src/components/TextoQueRola.tsx');
  assert.match(p, /useNativeDriver: true/);
  assert.match(p, /if \(reduzido\) return <Text style=\{style\}>\{texto\}<\/Text>;/);
  assert.match(p, /fontVariant: \['tabular-nums'\]/);
  assert.match(p, /pedirFluidez\(duracaoDoRolar\(texto\) \+ atrasoMs \+ 100\)/);
  assert.match(p, /accessibilityLabel=\{texto\}/, 'o VoiceOver lê o número, não as colunas');
});

caso('um número que muda roda a partir do que estava; a contagem não rola ao abrir', () => {
  const p = ler('src/components/TextoQueRola.tsx');
  assert.match(p, /const casas = useRef<Animated\.Value\[\]>\(\[\]\)\.current;/, 'as colunas duram entre textos');
  assert.match(p, /const semRolar = primeira\.current && !rolarAoMontar;/);
  assert.match(ler('src/components/CabecalhoDaPlaylist.tsx'), /<TextoQueRola style=\{styles\.meta\} texto=\{meta \?\? linhaDeMeta\(faixas, duracaoSegundos\)\} rolarAoMontar=\{false\} \/>/);
});

caso('o resumo do mês rola no driver nativo, e não redesenha a cada fotograma', () => {
  const r = ler('src/components/PaginasDoResumo.tsx');
  assert.match(r, /return <TextoQueRola texto=\{alvo\.toLocaleString\('en'\)\} style=\{style\} atrasoMs=\{450\} \/>;/);
  assert.doesNotMatch(r, /addListener\(\(\{ value \}\) => setN/);
  assert.match(r, /<TextoQueRola style=\{e\.ladrilhoNumero\} texto=\{String\(resumo\.seguidos\)\}/);
});

caso('onde entra: A tua escuta e o You two', () => {
  assert.match(ler('src/screens/ListeningStatsScreen.tsx'), /<TextoQueRola style=\{\[styles\.heroValue/);
  const voces = ler('src/screens/VocesOsDoisScreen.tsx');
  assert.match(voces, /<TextoQueRola style=\{\[styles\.numerao/);
  assert.match(voces, /<TextoQueRola style=\{\[styles\.numeroMedio/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');

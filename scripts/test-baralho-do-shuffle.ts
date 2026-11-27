/**
 * O baralho do shuffle (27/11, `lib/baralhoDoShuffle.ts`): o amigo do João, com
 * quase 2000 músicas, "parece que ouço tipo 200". O Fisher-Yates estava certo; a
 * ordem é que recomeçava a cada Shuffle e a cada abertura da app. Aqui: as contas,
 * uma simulação de semanas de uso, e a ligação no player.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chaveDoBaralho, inicioAoAcaso, juntarOuvida, ouvidasParaOFim } from '../src/lib/baralhoDoShuffle.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Um gerador com semente: a simulação dá sempre o mesmo. */
function semente(s: number): () => number {
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}
function baralhar(chaves: string[], rng: () => number): string[] {
  const out = chaves.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

console.log('\nas contas');
caso('a chave da lista: o id, ou o nome; sem nenhum, não há baralho', () => {
  assert.equal(chaveDoBaralho({ tipo: 'playlist', nome: 'Chill', id: 'p1' }), 'playlist:p1');
  assert.equal(chaveDoBaralho({ tipo: 'guardadas', nome: 'Liked Songs' }), 'guardadas:Liked Songs');
  assert.equal(chaveDoBaralho({ tipo: 'playlist', nome: '' }), null);
  assert.equal(chaveDoBaralho(null), null);
});
caso('as já ouvidas vão para o fim; a cabeça fica, e a ordem de cada grupo também', () => {
  assert.deepEqual(ouvidasParaOFim(['a', 'b', 'c', 'd', 'e'], new Set(['b', 'd', 'a'])), ['a', 'c', 'e', 'b', 'd']);
  assert.deepEqual(ouvidasParaOFim(['a', 'b', 'c'], new Set()), ['a', 'b', 'c']);
  assert.deepEqual(ouvidasParaOFim(['a', 'b', 'c'], new Set(['b', 'c'])), ['a', 'b', 'c'], 'todas ouvidas: fica como veio');
});
caso('a primeira é das que faltam; tocadas todas, qualquer uma', () => {
  const rng = semente(7);
  for (let i = 0; i < 50; i++) assert.ok(['b', 'd'].includes(['a', 'b', 'c', 'd'][inicioAoAcaso(['a', 'b', 'c', 'd'], new Set(['a', 'c']), rng)]!));
  assert.ok(inicioAoAcaso(['a', 'b'], new Set(['a', 'b']), rng) < 2);
});
caso('juntar: sem repetidas, e ao chegar ao tamanho da lista recomeça', () => {
  assert.deepEqual(juntarOuvida(['a'], 'a', 3), ['a']);
  assert.deepEqual(juntarOuvida(['a'], 'b', 3), ['a', 'b']);
  assert.deepEqual(juntarOuvida(['a', 'b'], 'c', 3), [], 'tocaram as três: baralho novo');
});

console.log('\nsemanas de uso: 1900 músicas, 20 por dia, Shuffle outra vez todos os dias');
caso('com o baralho, ao fim de 95 dias tocaram todas; sem ele, ficavam centenas por ouvir', () => {
  const lista = Array.from({ length: 1900 }, (_, i) => `youtube:${i}`);
  const dias = 95, porDia = 20;
  // Sem baralho (como estava): cada dia uma ordem nova de raiz.
  let rng = semente(42);
  const semBaralho = new Set<string>();
  for (let d = 0; d < dias; d++) for (const k of baralhar(lista, rng).slice(0, porDia)) semBaralho.add(k);
  // Com baralho: a ordem nova põe as ouvidas no fim, e o começo é das que faltam.
  rng = semente(42);
  let ouvidas: string[] = [];
  const comBaralho = new Set<string>();
  for (let d = 0; d < dias; d++) {
    const ja = new Set(ouvidas);
    const inicio = lista[inicioAoAcaso(lista, ja, rng)]!;
    const ordem = ouvidasParaOFim([inicio, ...baralhar(lista.filter((k) => k !== inicio), rng)], ja);
    for (const k of ordem.slice(0, porDia)) { comBaralho.add(k); ouvidas = juntarOuvida(ouvidas, k, lista.length); }
  }
  assert.equal(comBaralho.size, 1900, 'todas');
  assert.ok(semBaralho.size < 1900 * 0.7, `sem o baralho só ${semBaralho.size} (esperava-se uns 63 %)`);
});

console.log('\nno player');
caso('as ordens novas e a primeira passam pelo baralho, e cada música que começa marca-se', () => {
  const p = ler('src/state/player.ts');
  assert.match(p, /return ouvidasParaOFim\(ordem, ouvidasDaLista\(chaveDoBaralho\(origem\)\)\);/);
  assert.match(p, /if \(!order\.length\) return novaOrdemDoShuffle\(queue, currentIndex, origem\);/, 'a app reaberta (sem percurso) também');
  assert.match(p, /listaNova \? novaOrdemDoShuffle\(q, index, origemSeguinte\) : reconciliarOrdemDoShuffle\(get\(\)\.shuffleOrder, q, index, origemSeguinte\)/);
  assert.match(p, /if \(get\(\)\.shuffle\) marcarOuvida\(chaveDoBaralho\(origemSeguinte\), trackKey\(playableTrack\), shuffleOrder\.length\);/);
  assert.match(p, /const start = inicioAoAcaso\(tracks\.map\(trackKey\), ouvidasDaLista\(chaveDoBaralho\(origem\)\)\);/);
  const disco = ler('src/state/baralhoDoShuffle.ts');
  assert.match(disco, /AsyncStorage\.setItem\(CHAVE/, 'no aparelho, e não no Supabase');
  assert.doesNotMatch(disco, /supabase/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);

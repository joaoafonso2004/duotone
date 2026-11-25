/**
 * Mexer na fila em lote e baralhar outra vez (16/11, lib/filaEmLote.ts): as
 * contas, as ações da store nos dois modos (com e sem shuffle), e os botões no
 * iPhone e no PC, lidos como texto.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-fila-em-lote.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baralharDepois, chavesLogoASeguir, porLogoASeguir, postasAMaoAFrente, tirarIndices } from '../src/lib/filaEmLote.ts';
import { usePlayer } from '../src/state/player.ts';
import type { Track } from '../src/types.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const t = (id: string): Track => ({ source: 'youtube', sourceId: id, title: id, artist: 'A', artworkUrl: null, durationSeconds: 100 } as Track);
const ids = (l: readonly Track[]) => l.map((x) => x.sourceId);

console.log('\nas contas');
await caso('baralhar mexe só depois das fixas, e nunca deixa a mesma ordem', () => {
  const l = ['m1', 'm2', 'a', 'b', 'c', 'd'];
  for (let n = 0; n < 30; n++) {
    const r = baralharDepois(l, 2);
    assert.deepEqual(r.slice(0, 2), ['m1', 'm2'], 'as postas à mão ficam à frente');
    assert.deepEqual([...r].sort(), [...l].sort());
    assert.notDeepEqual(r, l, 'outra ordem');
  }
  assert.deepEqual(baralharDepois(['a', 'b', 'c'], 0, () => 0.9999), ['b', 'c', 'a'], 'um aleatório teimoso roda');
  assert.deepEqual(baralharDepois(['a', 'b'], 1), ['a', 'b'], 'uma só para mexer: nada a fazer');
});
await caso('as postas à mão contam-se seguidas, desde o início', () => {
  assert.equal(postasAMaoAFrente(['x', 'y', 'z'], new Set(['x', 'z']), (k) => k), 1);
});
await caso('tirar várias: nunca a que toca, e o índice acompanha', () => {
  const r = tirarIndices(['p', 'agora', 'a', 'b', 'c'], 1, [0, 1, 3]);
  assert.deepEqual(r, { queue: ['agora', 'a', 'c'], queueIndex: 0, tiradas: 2 });
});
await caso('pôr várias a seguir, pela ordem em que estavam', () => {
  const r = porLogoASeguir(['p', 'agora', 'a', 'b', 'c', 'd'], 1, [5, 3]);
  assert.deepEqual(r, { queue: ['p', 'agora', 'b', 'd', 'a', 'c'], queueIndex: 1 });
  assert.deepEqual(chavesLogoASeguir(['p', 'agora', 'a', 'b', 'c'], 'agora', ['c', 'a']), ['p', 'agora', 'a', 'c', 'b']);
});

console.log('\na store');
const agora = t('agora');
const repor = (shuffle: boolean) => {
  const queue = [t('p'), agora, t('m'), t('a'), t('b'), t('c'), t('d')];
  usePlayer.setState({
    current: agora, queue, queueIndex: 1, shuffle, postasAMao: ['youtube:m'],
    shuffleOrder: shuffle ? queue.map((x) => `${x.source}:${x.sourceId}`) : [],
  } as any);
};
await caso('baralhar outra vez, sem shuffle: a posta à mão fica à frente, o resto muda', () => {
  repor(false);
  const n = usePlayer.getState().baralharProximas();
  const prox = ids(usePlayer.getState().upcomingQueue().map((u) => u.track));
  assert.equal(n, 4);
  assert.equal(prox[0], 'm');
  assert.notDeepEqual(prox, ['m', 'a', 'b', 'c', 'd']);
  assert.deepEqual(ids(usePlayer.getState().queue.slice(0, 2)), ['p', 'agora'], 'o que já tocou e a que toca não mexem');
});
await caso('baralhar outra vez, com shuffle: muda o percurso, não a fila', () => {
  repor(true);
  const antes = usePlayer.getState().queue;
  usePlayer.getState().baralharProximas();
  assert.equal(usePlayer.getState().queue, antes);
  const prox = ids(usePlayer.getState().upcomingQueue().map((u) => u.track));
  assert.equal(prox[0], 'm');
  assert.notDeepEqual(prox, ['m', 'a', 'b', 'c', 'd']);
});
await caso('tirar várias e pôr várias a seguir, nos dois modos, com Undo pela fotografia', () => {
  for (const shuffle of [false, true]) {
    repor(shuffle);
    const foto = usePlayer.getState().fotografiaDaFila();
    assert.equal(usePlayer.getState().tirarVarias([3, 5, 1]), 2, 'a que toca não sai');
    assert.deepEqual(ids(usePlayer.getState().upcomingQueue().map((u) => u.track)), ['m', 'b', 'd']);
    assert.equal(usePlayer.getState().reporFila(foto), true);
    assert.equal(usePlayer.getState().porVariasASeguir([6, 4]), 2);
    assert.deepEqual(ids(usePlayer.getState().upcomingQueue().map((u) => u.track)).slice(0, 2), ['b', 'd']);
  }
});

console.log('\nos botões');
await caso('iPhone: baralhar outra vez, escolher, e as ações das escolhidas com Undo', () => {
  const f = ler('src/components/QueueSheet.tsx');
  assert.match(f, /accessibilityLabel="Shuffle again" onPress=\{baralharOutraVez\}/);
  assert.match(f, /accessibilityLabel="Select songs"/);
  assert.match(f, /if \(aEscolher\) \{ alternarEscolhida\(realIndex\); return; \}/);
  assert.match(f, /usePlayer\.getState\(\)\.porVariasASeguir\(\[\.\.\.escolhidas\]\)/);
  assert.match(f, /usePlayer\.getState\(\)\.tirarVarias\(\[\.\.\.escolhidas\]\)/);
  assert.match(f, /desfazer: \(\) => \{ usePlayer\.getState\(\)\.reporFila\(foto\); \}/);
});
await caso('PC: Ctrl/Shift+clique escolhe, um clique simples larga sem tocar, e a cabeça mostra as ações', () => {
  const h = ler('src/desktop/useFilaDoLeitor.web.ts');
  assert.match(h, /const ctrl = !!\(e\.ctrlKey \|\| e\.metaKey\);/);
  assert.match(h, /if \(!escolhidas\.size\) return false;\n\s+setEscolhidas\(new Set\(\)\);\n\s+return true;/);
  assert.match(ler('src/desktop/FilaArrastavel.web.tsx'), /if \(aoEscolher\?\.\(e, i, entrada\.index\)\) return;\n\s+aoTocar\(entrada\.track\);/);
  const c = ler('src/desktop/FilaDoLeitor.web.tsx');
  // Os botões da fila são ícones com legenda (25/11): o `label` é o nome que o leitor de ecrã lê.
  assert.match(c, /<IconButton name="shuffle" label="Shuffle again" onPress=\{fila\.baralhar\} \/>/);
  assert.match(c, /accessibilityLabel="Play the selected songs next" onPress=\{fila\.porASeguir\}/);
  assert.match(c, /accessibilityLabel="Remove the selected songs" onPress=\{fila\.tirarEscolhidas\}/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-fila-em-lote: tudo certo');

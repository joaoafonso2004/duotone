import {
  reconcileOrder,
  shuffleKeys,
  stepIndex,
  upcomingIndexes,
  trackKey,
} from '../src/lib/shuffle.ts';
import type { Track } from '../src/types.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const t = (id: string): Track => ({
  source: 'youtube', sourceId: id, title: id, artist: null,
  album: null, artworkUrl: null, durationSeconds: 180,
});
const fila = (...ids: string[]) => ids.map(t);

/** RNG determinista, para as ordens serem reproduzíveis nos testes. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- geração da ordem -------------------------------------------------------
const q = fila('a', 'b', 'c', 'd', 'e');
const ordem = shuffleKeys(q, 2, seeded(7));
check('a ordem cobre a fila toda', ordem.length === 5, String(ordem.length));
check('sem repetições', new Set(ordem).size === 5);
// Se a atual caísse no fim, o next() seguinte julgava a fila acabada.
check('a faixa atual vem à cabeça', ordem[0] === 'youtube:c', ordem[0]);
check('fila vazia dá ordem vazia', shuffleKeys([], 0, seeded(1)).length === 0);
check('fila de uma faixa', shuffleKeys(fila('a'), 0, seeded(1)).join() === 'youtube:a');

// O bug que isto corrige: com o sorteio antigo, percorrer a fila inteira sem
// repetir era praticamente impossível. Aqui é garantido por construção.
// Começa na faixa com que a ordem foi gerada (índice 2 = 'c'), como no player.
let idx = 2;
const visitados: number[] = [idx];
for (let i = 0; i < 4; i++) {
  const nxt = stepIndex(ordem, q, idx, 1);
  check(`passo ${i + 1} avança`, nxt !== null, String(nxt));
  idx = nxt!;
  visitados.push(idx);
}
check('percorre as 5 faixas sem repetir', new Set(visitados).size === 5, visitados.join(','));
check('no fim da ordem devolve null', stepIndex(ordem, q, idx, 1) === null);

// --- andar para trás --------------------------------------------------------
const primeiro = stepIndex(ordem, q, 2, 1)!;
check('anterior volta pelo mesmo caminho', stepIndex(ordem, q, primeiro, -1) === 2, String(stepIndex(ordem, q, primeiro, -1)));
check('no início da ordem devolve null', stepIndex(ordem, q, 2, -1) === null);

// --- reconciliação com a fila ----------------------------------------------
// O caso decisivo: next() chama playTrack com a MESMA fila. Se isto baralhasse
// outra vez, a travessia reiniciava a cada faixa e o shuffle voltava a repetir.
check(
  'mesma fila preserva a ordem',
  reconcileOrder(ordem, q, 1, seeded(99)).join() === ordem.join()
);
// Fila totalmente diferente: não sobra nada, baralha de raiz.
const outra = fila('x', 'y', 'z');
const nova = reconcileOrder(ordem, outra, 1, seeded(3));
check('fila nova gera ordem nova', nova.length === 3 && nova[0] === 'youtube:y', nova.join());
// Acrescentar à fila (addToQueue) não pode destruir o que já foi percorrido.
const maisUma = reconcileOrder(ordem, [...q, t('f')], 2, seeded(3));
check('faixa acrescentada entra no fim', maisUma.length === 6 && maisUma.slice(0, 5).join() === ordem.join(), maisUma.join());
// Remover da fila: a chave desaparece sem remapear índice nenhum.
const semC = reconcileOrder(ordem, fila('a', 'b', 'd', 'e'), 0, seeded(3));
check('faixa removida sai da ordem', semC.length === 4 && !semC.includes('youtube:c'), semC.join());
check('ordem com lixo é limpa', reconcileOrder(['youtube:zzz', ...ordem], q, 0, seeded(3)).length === 5);
check('fila vazia dá ordem vazia', reconcileOrder(ordem, [], 0, seeded(3)).length === 0);

// --- degradação -------------------------------------------------------------
check('ordem vazia não avança', stepIndex([], q, 0, 1) === null);
// Fila mexida por baixo dos pés: recomeçar é melhor do que ficar preso.
check(
  'faixa atual fora da ordem recomeça do topo',
  stepIndex(['youtube:b', 'youtube:d'], q, 0, 1) === 1,
  String(stepIndex(['youtube:b', 'youtube:d'], q, 0, 1))
);
check('chave inclui a fonte', trackKey({ source: 'spotify', sourceId: 'a' }) === 'spotify:a');
// Mesmo sourceId em fontes diferentes são faixas diferentes.
check(
  'fontes diferentes não colidem',
  shuffleKeys([{ ...t('a'), source: 'spotify' }, t('a')], 0, seeded(1)).length === 2
);

// --- lista "up next" --------------------------------------------------------
// A lista tem de mostrar a ordem que vai MESMO tocar, senão mente ao utilizador.
const proximas = upcomingIndexes(ordem, q, 2);
check('up next segue a ordem do shuffle', proximas.join(',') === '4,1,3,0', proximas.join(','));
check('na ultima nao ha proximas', upcomingIndexes(ordem, q, 0).length === 0, String(upcomingIndexes(ordem, q, 0).length));
check('sem ordem nao ha lista', upcomingIndexes([], q, 0).length === 0);
check('chaves fora da fila sao ignoradas', upcomingIndexes(['youtube:c', 'youtube:zzz', 'youtube:a'], q, 2).join() === '0');

// --- simulacao do ciclo real da store --------------------------------------
// O `next()` chama `playTrack(faixa, MESMA fila)`, e o `playTrack` reconcilia a
// ordem. Se o reconcile baralhasse outra vez, a travessia reiniciava a cada
// faixa e o shuffle voltava a repetir — este e o teste que apanha isso.
{
  const grande = fila(...Array.from({ length: 20 }, (_, i) => `s${i}`));
  let i = 0;
  let ord = shuffleKeys(grande, i);              // toggleShuffle(true)
  const tocadas = [i];
  for (let passo = 0; passo < 19; passo++) {
    ord = reconcileOrder(ord, grande, i);        // o que o playTrack faz
    const nxt = stepIndex(ord, grande, i, 1);    // o que o next() faz
    if (nxt === null) break;
    i = nxt;
    tocadas.push(i);
  }
  check('20 faixas tocam todas uma vez', new Set(tocadas).size === 20, `${new Set(tocadas).size} unicas em ${tocadas.length}`);
  check('a ordem esgota-se no fim', stepIndex(reconcileOrder(ord, grande, i), grande, i, 1) === null);
}

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);

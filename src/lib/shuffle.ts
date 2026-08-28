import type { Track } from '../types';

/**
 * Ordem aleatória do player.
 *
 * O que existia antes: cada `next()` sorteava um índice diferente do atual.
 * Parece shuffle mas não é — repete faixas antes de tocar as outras todas e
 * nunca garante que um álbum acaba. Numa fila de 20, a probabilidade de
 * ouvir as 20 antes de repetir alguma é praticamente zero.
 *
 * Aqui a ordem é MATERIALIZADA (Fisher-Yates) e percorrida: cada faixa toca
 * uma vez, e o "anterior" volta pelo mesmo caminho por onde veio — coisa que
 * com sorteio à chamada era impossível.
 *
 * A ordem é guardada por CHAVE da faixa, não por índice. É o que permite
 * mexer na fila (remover, reordenar, acrescentar) sem ter de remapear nada:
 * `reconcileOrder` limpa o que saiu e acrescenta o que entrou. Funções puras,
 * testadas em scripts/test-shuffle.ts.
 */

export type Rng = () => number;

export function trackKey(t: { source: string; sourceId: string }): string {
  return `${t.source}:${t.sourceId}`;
}

/** Fisher-Yates, sem enviesamento e sem tocar no array de entrada. */
function shuffled(keys: string[], rng: Rng): string[] {
  const out = keys.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Ordem nova para a fila, com a faixa atual à cabeça.
 *
 * A faixa atual tem de vir primeiro: já está a tocar, e se calhasse no fim da
 * ordem o `next()` seguinte pensava que a fila tinha acabado.
 */
export function shuffleKeys(
  queue: Track[],
  currentIndex: number,
  rng: Rng = Math.random
): string[] {
  if (queue.length === 0) return [];
  const currentKey = queue[currentIndex] ? trackKey(queue[currentIndex]) : null;
  const rest = queue
    .map(trackKey)
    .filter((k, i, arr) => arr.indexOf(k) === i && k !== currentKey);
  const order = shuffled(rest, rng);
  return currentKey ? [currentKey, ...order] : order;
}

/**
 * Alinha uma ordem existente com a fila atual, preservando o que já foi
 * percorrido.
 *
 * É isto que faz o `next()` funcionar: `next()` chama `playTrack` com a MESMA
 * fila, aqui não muda nada, e a travessia continua. Se a fila for outra
 * (tocar uma playlist nova), não sobra nenhuma chave e sai uma ordem
 * inteiramente nova — sem precisar de distinguir os dois casos.
 */
export function reconcileOrder(
  order: string[],
  queue: Track[],
  currentIndex: number,
  rng: Rng = Math.random
): string[] {
  if (queue.length === 0) return [];

  const queueKeys = queue.map(trackKey);
  const present = new Set(queueKeys);

  const seen = new Set<string>();
  const kept = order.filter((k) => {
    if (!present.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Nada em comum com a ordem anterior: fila nova, baralhar de raiz.
  if (kept.length === 0) return shuffleKeys(queue, currentIndex, rng);

  const missing = queueKeys.filter((k, i, arr) => arr.indexOf(k) === i && !seen.has(k));
  return missing.length === 0 ? kept : [...kept, ...shuffled(missing, rng)];
}

/**
 * Índice na fila da faixa seguinte (`direction: 1`) ou anterior (`-1`) na
 * ordem aleatória, ou null quando se chegou ao fim/princípio.
 *
 * Devolver null é informação, não falha: quem chama decide se pára (repeat
 * off) ou se baralha outra vez (repeat all).
 */
export function stepIndex(
  order: string[],
  queue: Track[],
  currentIndex: number,
  direction: 1 | -1
): number | null {
  if (queue.length === 0 || order.length === 0) return null;

  const currentKey = queue[currentIndex] ? trackKey(queue[currentIndex]) : null;
  const pos = currentKey ? order.indexOf(currentKey) : -1;

  // Faixa atual fora da ordem (fila mexida entretanto): recomeçar do topo em
  // vez de ficar preso sem saber avançar.
  const target = pos < 0 ? (direction === 1 ? 0 : order.length - 1) : pos + direction;
  if (target < 0 || target >= order.length) return null;

  const queueIndex = queue.findIndex((t) => trackKey(t) === order[target]);
  return queueIndex >= 0 ? queueIndex : null;
}

/**
 * Índices da fila pela ordem em que vão MESMO tocar, a seguir à atual.
 *
 * Serve para a lista "Up next" não mentir: com o shuffle ligado, mostrar
 * `queue.slice(queueIndex + 1)` é a ordem natural, não a que vai tocar.
 * Enquanto o shuffle era sorteado à chamada isto era impossível de mostrar —
 * ninguém sabia o que vinha a seguir, nem o próprio player.
 */
export function upcomingIndexes(
  order: string[],
  queue: Track[],
  currentIndex: number
): number[] {
  if (queue.length === 0 || order.length === 0) return [];

  // Mapa uma vez em vez de um findIndex por elemento: filas importadas de
  // playlists chegam facilmente às centenas de faixas.
  const byKey = new Map<string, number>();
  queue.forEach((t, i) => {
    const k = trackKey(t);
    if (!byKey.has(k)) byKey.set(k, i);
  });

  const currentKey = queue[currentIndex] ? trackKey(queue[currentIndex]) : null;
  const pos = currentKey ? order.indexOf(currentKey) : -1;

  const out: number[] = [];
  for (let i = pos + 1; i < order.length; i++) {
    const qi = byKey.get(order[i]);
    if (qi !== undefined) out.push(qi);
  }
  return out;
}

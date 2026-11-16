/**
 * Mexer na fila em lote e baralhar outra vez (16/11, João: "algo que sinto que
 * falta ou está mal feito na app"). As contas puras; a store (`state/player.ts`)
 * aplica-as à fila ou ao percurso do shuffle, conforme o modo.
 *
 * - **Baralhar outra vez**: só o que vem a seguir, e as postas à mão ("Add to
 *   queue", "Play next") ficam à frente, pela ordem delas -- foram uma escolha.
 *   Fisher-Yates, e nunca a mesma ordem de antes (com duas ou mais para mexer).
 * - **Várias de uma vez**: tirar as escolhidas, ou pô-las logo a seguir à que
 *   toca pela ordem em que estavam. Nunca a que toca.
 *
 * Sem imports: `scripts/test-fila-em-lote.ts`.
 */

/** Baralha o que vem depois das `fixas` primeiras, numa ordem que não é a de antes. */
export function baralharDepois<T>(lista: readonly T[], fixas: number, aleatorio: () => number = Math.random): T[] {
  const n = Math.max(0, Math.min(fixas, lista.length));
  const inicio = lista.slice(0, n);
  const resto = lista.slice(n);
  if (resto.length < 2) return lista.slice();
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const c = resto.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [c[i], c[j]] = [c[j]!, c[i]!];
    }
    if (c.some((t, i) => t !== resto[i])) return [...inicio, ...c];
  }
  return [...inicio, ...resto.slice(1), resto[0]!];
}

/** Quantas das primeiras são postas à mão (seguidas, desde o início). */
export function postasAMaoAFrente<T>(proximas: readonly T[], aMao: ReadonlySet<string>, chave: (t: T) => string): number {
  let n = 0;
  while (n < proximas.length && aMao.has(chave(proximas[n]!))) n++;
  return n;
}

/** Tira estes índices da fila (a que toca nunca), e o índice da que toca acompanha. */
export function tirarIndices<T>(queue: readonly T[], queueIndex: number, indices: Iterable<number>): { queue: T[]; queueIndex: number; tiradas: number } {
  const sai = new Set([...indices].filter((i) => i >= 0 && i < queue.length && i !== queueIndex));
  if (!sai.size) return { queue: queue.slice(), queueIndex, tiradas: 0 };
  const antes = [...sai].filter((i) => i < queueIndex).length;
  return { queue: queue.filter((_, i) => !sai.has(i)), queueIndex: queueIndex - antes, tiradas: sai.size };
}

/** Põe estes índices logo a seguir à que toca, pela ordem em que estavam na fila. */
export function porLogoASeguir<T>(queue: readonly T[], queueIndex: number, indices: Iterable<number>): { queue: T[]; queueIndex: number } {
  const vao = [...new Set(indices)].filter((i) => i >= 0 && i < queue.length && i !== queueIndex).sort((a, b) => a - b);
  if (!vao.length) return { queue: queue.slice(), queueIndex };
  const escolhidas = vao.map((i) => queue[i]!);
  const sai = new Set(vao);
  const resto = queue.filter((_, i) => !sai.has(i));
  const novoIndice = queueIndex - vao.filter((i) => i < queueIndex).length;
  return { queue: [...resto.slice(0, novoIndice + 1), ...escolhidas, ...resto.slice(novoIndice + 1)], queueIndex: novoIndice };
}

/** O mesmo no percurso do shuffle (chaves): as escolhidas logo a seguir à que toca. */
export function chavesLogoASeguir(ordem: readonly string[], atual: string, escolhidas: readonly string[]): string[] {
  const vao = new Set(escolhidas.filter((k) => k !== atual));
  if (!vao.size) return ordem.slice();
  const pela = ordem.filter((k) => vao.has(k));
  const resto = ordem.filter((k) => !vao.has(k));
  const i = resto.indexOf(atual);
  return [...resto.slice(0, i + 1), ...pela, ...resto.slice(i + 1)];
}

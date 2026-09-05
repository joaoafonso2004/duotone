/**
 * Duplo de src/lib/playbackAlternatives.ts.
 *
 * O real troca o `sourceId` por uma cópia que se saiba tocar. Aqui devolve a
 * faixa tal como veio -- é o caminho normal, e é o que os testes seguem.
 */
export function applyPlaybackAlternative<T>(t: T): Promise<T> {
  return Promise.resolve(t);
}
export function rememberPlaybackAlternative(): void {}

/**
 * Duplo de src/lib/prefs.ts.
 *
 * Só as três que a `store` escreve. Guardadas num objeto, para um teste poder
 * afirmar que ligar o shuffle inteligente ficou mesmo persistido.
 */
export const guardadas: Record<string, unknown> = {};
export function setShuffle(v: boolean): Promise<void> {
  guardadas.shuffle = v;
  return Promise.resolve();
}
export function setShuffleInteligente(v: boolean): Promise<void> {
  guardadas.shuffleInteligente = v;
  return Promise.resolve();
}
export function setPlaybackRate(v: number): Promise<void> {
  guardadas.playbackRate = v;
  return Promise.resolve();
}

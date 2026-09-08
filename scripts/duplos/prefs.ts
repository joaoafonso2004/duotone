/**
 * Duplo de src/lib/prefs.ts.
 *
 * Só as que a `store` escreve. Guardadas num objeto, para um teste poder
 * afirmar que ligar o shuffle inteligente ficou mesmo persistido.
 *
 * Tem de acompanhar o `player.ts`: uma escrita nova lá sem a entrada aqui
 * rebenta o arranque do teste com "does not provide an export named", e não
 * é o typecheck que apanha isso -- foi assim que o `setEqPadrao` entrou.
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

export function setEqPadrao(ganhos: readonly number[]): Promise<void> {
  guardadas.eqPadrao = [...ganhos];
  return Promise.resolve();
}

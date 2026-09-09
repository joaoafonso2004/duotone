/**
 * Duplo de src/api/plays.ts.
 *
 * Tem de acompanhar o que a `state/player.ts` importa daqui: uma importacao
 * nova sem a entrada neste ficheiro rebenta o arranque do teste com "does not
 * provide an export named", e nao e o typecheck que apanha isso -- ele le o
 * modulo a serio. Ja aconteceu com o `setEqPadrao` no duplo das prefs.
 */
export function recordPlayInSupabase(): Promise<void> {
  return Promise.resolve();
}
export function getTopArtists(): Promise<{ name: string; count: number }[]> {
  return Promise.resolve([]);
}
export function getHeavyRotation(): Promise<Map<string, number>> {
  return Promise.resolve(new Map());
}

/** O ponto unico dos artistas com que se recomenda. Vazio, como os outros. */
export function artistasParaRecomendacoes(): Promise<{ name: string; plays: number; artworkUrl: string | null }[]> {
  return Promise.resolve([]);
}

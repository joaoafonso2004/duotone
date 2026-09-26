/**
 * Duplo de src/api/plays.ts.
 *
 * Tem de acompanhar o que a `state/player.ts` importa daqui: uma importacao
 * nova sem a entrada neste ficheiro rebenta o arranque do teste com "does not
 * provide an export named", e nao e o typecheck que apanha isso -- ele le o
 * modulo a serio. Ja aconteceu com o `setEqPadrao` no duplo das prefs.
 */
import type { Track } from '../../src/types.ts';
import type { TopArtist } from '../../src/api/plays.ts';
import { controlo } from './controlo.ts';

/** Regista no `controlo`: o teste afirma QUANDO uma reprodução conta. */
export function recordPlayInSupabase(track: Track): Promise<boolean> {
  controlo.contagens.plays.push(track.sourceId);
  return Promise.resolve(true);
}
export function registarInicioDaFaixa(track: Track): Promise<void> {
  controlo.contagens.inicios.push(track.sourceId);
  return Promise.resolve();
}
export function getTopArtists(): Promise<{ name: string; count: number }[]> {
  return Promise.resolve([]);
}
export function getHeavyRotation(): Promise<Map<string, number>> {
  return Promise.resolve(new Map());
}

export function getEscutasRecentes(): Promise<{ track: Track; em: number }[]> {
  return Promise.resolve([]);
}

export function getProfileRecentlyPlayed(): Promise<(Track & { lastPlayed?: number })[]> {
  return Promise.resolve(controlo.recentes);
}

/** O perfil agregado: controla dados/falha sem substituir a sua conversão. */
export function artistasParaRecomendacoes(): Promise<TopArtist[]> {
  return controlo.falharPerfil ? Promise.reject(new Error('Perfil indisponível')) : Promise.resolve(controlo.artistasDoPerfil);
}

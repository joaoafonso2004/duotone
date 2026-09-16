/**
 * Duplo de src/state/recommendationFeedback.ts.
 *
 * O `filterSuggestions` real tira o que o utilizador já rejeitou. Aqui deixa
 * passar tudo: o que os testes da `store` querem verificar é o percurso das
 * sugestões, não o filtro -- esse tem testes próprios.
 */
export function filterSuggestions<T>(t: readonly T[]): T[] {
  return [...t];
}
export function trackIsSuppressed(): boolean {
  return false;
}
export function feedbackReady(): Promise<void> {
  return Promise.resolve();
}
export function artistWeight(): number {
  return 1;
}
import type { Track } from '../../src/types.ts';
import { controlo } from './controlo.ts';
export function aprenderComSaltoDeRecomendacao(track: Track): void {
  controlo.aprendizagem.saltos.push(track.sourceId);
}
export function aprenderComEscutaDeRecomendacao(track: Track): void {
  controlo.aprendizagem.escutas.push(track.sourceId);
}

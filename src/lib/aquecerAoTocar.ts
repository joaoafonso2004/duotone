import type { Track } from '../types';
import { isAudioCached } from './youtubeCache';
import { resolveYouTubeStream } from '../api/ytstream';
import { getAudioQuality } from './prefs';

/**
 * Começar a resolver a música quando o dedo POUSA na linha (7/10, iPhone).
 *
 * Tocar numa música só começava a pedir o endereço do áudio ao YouTube depois
 * de o dedo sair, de a store mudar e de o leitor reagir. Isto pede-o mais
 * cedo, pelo MESMO caminho do leitor (`resolveYouTubeStream` com a mesma
 * qualidade): a resolução em curso é partilhada (`resolucoesEmCurso`), por
 * isso o leitor junta-se a esta em vez de começar outra.
 *
 * Só resolve -- não descarrega: um toque que afinal era o começo de um scroll
 * custa um pedido pequeno, e não um ficheiro. E só depois de
 * `ESPERA_AO_POUSAR_MS` com o dedo parado: um scroll cancela o toque antes
 * disso. No PC não existe (`aquecerAoTocar.web.ts`): o leitor de lá é o do
 * YouTube.
 */
export const ESPERA_AO_POUSAR_MS = 90;
/** A mesma música aquecida há menos disto não se aquece outra vez. */
export const REAQUECER_DEPOIS_MS = 60_000;

const aquecidas = new Map<string, number>();

/** A decisão, sem efeitos (testada em `scripts/test-aquecer-ao-tocar.ts`). */
export function deveAquecer(o: { fonte: string; emCache: boolean; aquecidaEm: number | undefined; agora: number }): boolean {
  if (o.fonte !== 'youtube' || o.emCache) return false;
  return o.aquecidaEm === undefined || o.agora - o.aquecidaEm >= REAQUECER_DEPOIS_MS;
}

export function aquecerAoTocar(track: Track): void {
  const agora = Date.now();
  let emCache = false;
  try { emCache = isAudioCached(track.sourceId); } catch { /* sem cache lida, resolve-se */ }
  if (!deveAquecer({ fonte: track.source, emCache, aquecidaEm: aquecidas.get(track.sourceId), agora })) return;
  aquecidas.set(track.sourceId, agora);
  if (aquecidas.size > 50) aquecidas.delete(aquecidas.keys().next().value!);
  void getAudioQuality()
    .then((qualidade) => resolveYouTubeStream(track.sourceId, qualidade))
    // Falhar aqui não é nada: o leitor resolve como sempre, e diz o que correu mal.
    .catch(() => { aquecidas.delete(track.sourceId); });
}

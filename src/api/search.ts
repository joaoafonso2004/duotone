import { searchYouTubeFree } from './ytSearchFree';
import { searchYouTube } from './youtube';
import type { Track } from '../types';

/** A Data API só gasta quota quando a pesquisa livre falha. */
export async function pesquisarMusica(query: string, signal?: AbortSignal): Promise<Track[]> {
  const livre = new AbortController();
  const cancelar = () => livre.abort();
  if (signal?.aborted) return [];
  signal?.addEventListener('abort', cancelar, { once: true });
  const timeout = setTimeout(cancelar, 10000);
  try {
    return await searchYouTubeFree(query, livre.signal);
  } catch {
    // Apagar o campo não deve lançar uma pesquisa paga para o texto antigo.
    if (signal?.aborted) return [];
    return searchYouTube(query);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelar);
  }
}

import { continuarPesquisaFree, pesquisarPaginaFree } from './ytSearchFree';
import { searchYouTube } from './youtube';
import type { Track } from '../types';

export interface ResultadoDePesquisa {
  faixas: Track[];
  /** Token da página seguinte, ou `null` quando não há mais nada. */
  continuacao: string | null;
}

const VAZIO: ResultadoDePesquisa = { faixas: [], continuacao: null };

/** A Data API só gasta quota quando a pesquisa livre falha. */
export async function pesquisarMusica(query: string, signal?: AbortSignal): Promise<ResultadoDePesquisa> {
  const livre = new AbortController();
  const cancelar = () => livre.abort();
  if (signal?.aborted) return VAZIO;
  signal?.addEventListener('abort', cancelar, { once: true });
  const timeout = setTimeout(cancelar, 10000);
  try {
    const pagina = await pesquisarPaginaFree(query, livre.signal);
    // Uma pesquisa livre VAZIA não cai para a Data API de propósito: são 100
    // unidades por chamada de um tecto diário de 10.000, e uma pesquisa sem
    // resultados costuma ser mesmo uma pesquisa sem resultados. A alternativa
    // paga é para quando a livre FALHA.
    return { faixas: pagina.resultados.map((r) => r.track), continuacao: pagina.continuacao };
  } catch {
    // Apagar o campo não deve lançar uma pesquisa paga para o texto antigo.
    if (signal?.aborted) return VAZIO;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelar);
  }
  if (signal?.aborted) return VAZIO;
  return { faixas: await searchYouTube(query), continuacao: null };
}

/** A página seguinte da pesquisa livre. A Data API não pagina. */
export async function pesquisarMaisMusica(
  continuacao: string,
  signal?: AbortSignal,
): Promise<ResultadoDePesquisa> {
  if (signal?.aborted) return VAZIO;
  const pagina = await continuarPesquisaFree(continuacao, signal);
  return { faixas: pagina.resultados.map((r) => r.track), continuacao: pagina.continuacao };
}

import { create } from 'zustand';
import { getLibraryKeys } from '../api/library';
import type { Track } from '../types';

/**
 * Que faixas é que já estão guardadas, em memória.
 *
 * Existe para as listas poderem marcar "já a tens" sem uma ida ao servidor
 * por linha: pesquisas devolvem 20 resultados e o `checkIsSaved` é um par de
 * queries por faixa. O `getLibraryKeys` traz o conjunto todo num pedido.
 *
 * As chaves são `source:sourceId` e não ids da BD: resultados de pesquisa vêm
 * do YouTube e ainda não existem na tabela `tracks`.
 */

export function savedKey(t: Pick<Track, 'source' | 'sourceId'>): string {
  return `${t.source}:${t.sourceId}`;
}

interface SavedState {
  keys: Set<string>;
  loaded: boolean;
  /** Recarrega do servidor. Barato (um pedido) e idempotente. */
  refresh: () => Promise<void>;
  /** Atualização otimista, para o coração responder no instante do toque em
   * vez de esperar pelo servidor. */
  markSaved: (track: Pick<Track, 'source' | 'sourceId'>, saved: boolean) => void;
  isSaved: (track: Pick<Track, 'source' | 'sourceId'>) => boolean;
}

export const useSaved = create<SavedState>()((set, get) => ({
  keys: new Set(),
  loaded: false,

  refresh: async () => {
    try {
      set({ keys: await getLibraryKeys(), loaded: true });
    } catch {
      // Sem rede ou sessão expirada: fica o que já se sabia. Marcar tudo como
      // não guardado seria pior — o utilizador via corações a apagar-se.
    }
  },

  markSaved: (track, saved) => {
    const key = savedKey(track);
    set((s) => {
      if (s.keys.has(key) === saved) return s;
      // Set novo, não mutado: o zustand compara por referência.
      const keys = new Set(s.keys);
      if (saved) keys.add(key);
      else keys.delete(key);
      return { keys };
    });
  },

  isSaved: (track) => get().keys.has(savedKey(track)),
}));

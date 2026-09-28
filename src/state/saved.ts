import { create } from 'zustand';
import { getLibraryKeys } from '../api/library';
import type { Track } from '../types';
import { ajustarGostada, esquecerBiblioteca } from '../lib/cacheDaBiblioteca';

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
  markSaved: (track: Pick<Track, 'source' | 'sourceId'> & Partial<Track>, saved: boolean) => void;
  isSaved: (track: Pick<Track, 'source' | 'sourceId'>) => boolean;
  /**
   * Esquece tudo -- ao mudar de conta (App.tsx). As guardadas de quem sai não
   * são de quem entra, e o `loaded` também decide o questionário da primeira
   * vez (state/boasVindas.ts): com as dez guardadas da conta anterior, uma conta
   * nova no mesmo aparelho era dada como "já usa a app" e nunca o via.
   */
  limpar: () => void;
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
    // A biblioteca mudou: a lista guardada deixou de ser verdade. Isto é o
    // sítio porque TODOS os caminhos de guardar/tirar passam por aqui -- é a
    // regra que já existia para os corações se acenderem. Com a faixa inteira
    // na mão, muda-se a lista em vez de a reler toda (27/9, `ajustarGostada`).
    if (typeof track.title === 'string') ajustarGostada(track as Track, saved);
    else esquecerBiblioteca();
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

  limpar: () => set({ keys: new Set(), loaded: false }),
}));

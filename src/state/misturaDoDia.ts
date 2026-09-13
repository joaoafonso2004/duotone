import { create } from 'zustand';
import { getLibrary } from '../api/library';
import { misturaDoDia } from '../api/descoberta';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { guardarEmSegundoPlano } from '../lib/descarregarFaixa';
import { MUSICAS_DA_MISTURA } from '../lib/misturaDoDia';
import type { Track } from '../types';

/**
 * A Daily mix fora do ecrã que a mostra -- ver `lib/misturaDoDia.ts`.
 *
 * **Não é uma prateleira das recomendações, de propósito.** As prateleiras
 * partilham faixas entre si por uma ordem (`ORDEM_DAS_PRATELEIRAS`), e o
 * `flow` está à frente da Heavy Rotation: calculá-lo no iPhone para esta mix
 * tirava à Heavy Rotation as músicas que as duas têm em comum -- que são quase
 * todas. Aqui vive à parte, e ninguém tira nada a ninguém.
 *
 * Carrega no arranque (`useAquecerSeccoes`, só no iPhone) e, com a lista na
 * mão, deixa as primeiras descarregadas em segundo plano.
 */

type Estado = 'vazio' | 'a-carregar' | 'pronto';

type MisturaDoDia = {
  faixas: Track[];
  estado: Estado;
  /** Sem `forcar` não faz nada se já estiver pronta ou a carregar. */
  carregar: (forcar?: boolean) => Promise<void>;
  limpar: () => void;
};

let emCurso: Promise<void> | null = null;
let geracao = 0;

export const useMisturaDoDia = create<MisturaDoDia>((set, get) => ({
  faixas: [],
  estado: 'vazio',

  carregar: async (forcar = false) => {
    if (emCurso) return emCurso;
    if (!forcar && get().estado === 'pronto') return;
    const esta = geracao;
    // Com uma lista no ecrã, refazer não se anuncia: era esse anúncio o pisca.
    if (get().faixas.length === 0) set({ estado: 'a-carregar' });

    const trabalho = (async () => {
      try {
        const biblioteca = await lerFaixas(getLibrary).catch(() => [] as Track[]);
        const faixas = await misturaDoDia(MUSICAS_DA_MISTURA, biblioteca, forcar);
        if (esta !== geracao) return;
        set({ faixas, estado: 'pronto' });
        void guardarEmSegundoPlano(faixas);
      } catch {
        if (esta === geracao) set({ estado: 'pronto' });
      }
    })();
    emCurso = trabalho;
    try {
      await trabalho;
    } finally {
      if (emCurso === trabalho) emCurso = null;
    }
  },

  limpar: () => {
    geracao++;
    emCurso = null;
    set({ faixas: [], estado: 'vazio' });
  },
}));

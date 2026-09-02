import { create } from 'zustand';
import { getLibrary } from '../api/library';
import { descobrirNovas, flowDoDia } from '../api/descoberta';
import {
  getForgottenFavorites, getHeavyRotation, getProfileRecentlyPlayed,
} from '../api/plays';
import type { Track } from '../types';

/**
 * As prateleiras de recomendações, fora do ecrã que as mostra.
 *
 * **Porque saíram de dentro da página.** Estavam num `useState` da `SearchPage`,
 * e essa página desmonta quando se muda de separador: bastava ir aos Artists e
 * voltar para o "Preparing recommendations…" começar do zero. E não é uma
 * espera pequena — a descoberta fala com um catálogo e com o YouTube, faixa a
 * faixa. Perder isso por carregar num separador é perder o trabalho todo.
 *
 * Agora carregam **uma vez, quando a app liga**, e ficam. Voltar à Pesquisa
 * mostra o que já lá está. Refazê-las é uma decisão explícita — o botão de
 * refrescar — e não um acidente da navegação.
 *
 * Falham em silêncio, uma a uma: se uma RPC não existir na base de dados, as
 * outras prateleiras aparecem na mesma.
 */

export type EstadoDasRecomendacoes = 'vazio' | 'a-carregar' | 'pronto';

type Recomendacoes = {
  descobrir: Track[];
  ouvirDeNovo: Track[];
  flow: Track[];
  maisTocadas: Track[];
  esquecidas: Track[];
  estado: EstadoDasRecomendacoes;
  /** Quando ficaram prontas nesta sessão. */
  carregadoEm: number;
  /**
   * Carrega as prateleiras. Sem `forcar`, não faz nada se já estiverem
   * carregadas ou a carregar — é assim que chamar isto de dois sítios (o
   * arranque da app e a própria página) não duplica o trabalho.
   */
  carregar: (forcar?: boolean) => Promise<void>;
  limpar: () => void;
};

/** Quantas faixas por prateleira. */
const POR_PRATELEIRA = 14;

/** Impede que duas chamadas ao mesmo tempo façam o trabalho a dobrar. */
let emCurso: Promise<void> | null = null;
let geracao = 0;

export const useRecomendacoes = create<Recomendacoes>((set, get) => ({
  descobrir: [],
  ouvirDeNovo: [],
  flow: [],
  maisTocadas: [],
  esquecidas: [],
  estado: 'vazio',
  carregadoEm: 0,
  limpar: () => {
    geracao++;
    emCurso = null;
    set({ descobrir: [], ouvirDeNovo: [], flow: [], maisTocadas: [], esquecidas: [], estado: 'vazio', carregadoEm: 0 });
  },

  carregar: async (forcar = false) => {
    if (emCurso) return emCurso;
    if (!forcar && get().estado === 'pronto') return;
    const atual = geracao;

    set({ estado: 'a-carregar' });
    const semFalhar = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

    const trabalho = Promise.all([
      semFalhar(getProfileRecentlyPlayed(POR_PRATELEIRA)),
      // A descoberta e o flow precisam ambos da biblioteca: pede-se uma vez.
      semFalhar(getLibrary()).then((lib) => Promise.all([
        descobrirNovas(POR_PRATELEIRA, lib),
        flowDoDia(POR_PRATELEIRA, lib),
      ])).catch(() => [[], []] as [Track[], Track[]]),
      semFalhar(getHeavyRotation(POR_PRATELEIRA)),
      semFalhar(getForgottenFavorites(POR_PRATELEIRA)),
    ]).then(([recentes, [novas, f], maisTocadas, esquecidas]) => {
      if (atual !== geracao) return;
      set({
        descobrir: novas,
        // `getProfileRecentlyPlayed` devolve ProfilePlayEntry, sem `album`.
        ouvirDeNovo: recentes.map((r: any) => ({ ...r, album: null } as Track)),
        flow: f,
        maisTocadas,
        esquecidas,
        estado: 'pronto',
        carregadoEm: Date.now(),
      });
    }).catch(() => {
      // Nem isto devia acontecer (cada parte já falha sozinha), mas ficar
      // preso em "a-carregar" para sempre seria pior do que dizer que não há.
      if (atual === geracao) set({ estado: 'pronto', carregadoEm: Date.now() });
    }).finally(() => {
      if (atual === geracao) emCurso = null;
    });

    emCurso = trabalho;
    return trabalho;
  },
}));

/** Há alguma coisa para mostrar? */
export const temRecomendacoes = (r: Recomendacoes): boolean =>
  r.descobrir.length > 0 || r.ouvirDeNovo.length > 0 || r.flow.length > 0
  || r.maisTocadas.length > 0 || r.esquecidas.length > 0;

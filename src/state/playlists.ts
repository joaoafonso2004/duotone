import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listPlaylists } from '../api/playlists';
import { useAuth } from './auth';
import { useConnectivity } from './connectivity';
import type { Playlist } from '../types';

/**
 * As playlists, fora dos ecrãs que as mostram.
 *
 * **O problema que isto resolve.** O ecrã de Playlists tinha um `useFocusEffect`
 * a chamar `load()` a cada vez que o separador ganhava foco, e esse `load()`
 * punha `loading` a true sem olhar para o que já tinha na mão — o que trocava a
 * grelha inteira pelo esqueleto. Ir aos Artists e voltar dava um pisca e uma
 * espera, todas as vezes, para ir buscar a mesma lista. No Windows era igual,
 * pelo `useEffect` de montagem do `PlaylistPages.web.tsx`.
 *
 * E não era só um pedido: o `listPlaylists` ainda dispara uma contagem exacta
 * por cada playlist com mil ou mais faixas (ver `api/playlists.ts`), porque o
 * PostgREST corta as relações embutidas nesse número.
 *
 * **A regra agora.** Quem já tem lista mostra-a e revalida por baixo, em
 * silêncio; o esqueleto é para quem ainda não tem nada. É a mesma decisão que
 * o `state/recomendacoes.ts` tomou pela mesma razão — e daí vem também o
 * `emCurso` (duas chamadas ao mesmo tempo não fazem o trabalho a dobrar) e o
 * contador de `geracao` (uma resposta que chega depois de se mudar de conta
 * não entra).
 */

export type EstadoDasPlaylists = 'vazio' | 'a-carregar' | 'pronto';

/**
 * Quanto tempo uma lista acabada de chegar se considera fresca.
 *
 * Sem isto, cada regresso ao separador era na mesma uma ida à rede — só que
 * calada em vez de a piscar, que é melhor mas continua a ser trabalho por
 * nada. Trinta segundos apanham o caso real (sair aos Artists e voltar) sem
 * arriscar mostrar uma playlist apagada noutro aparelho durante muito tempo;
 * quem MUDA alguma coisa não passa por aqui, força.
 */
export const FRESCO_MS = 30_000;

type Playlists = {
  items: Playlist[];
  estado: EstadoDasPlaylists;
  /** Só é preenchido quando não há nada para mostrar. Falhar a revalidar com a
   *  lista no ecrã não é um erro que valha a pena dar à cara do utilizador. */
  erro: string;
  /** Quando a última resposta boa chegou. */
  carregadoEm: number;
  /**
   * Traz a lista. Sem `forcar`, não vai à rede se a que está for recente — e
   * nunca mostra esqueleto a quem já tem alguma coisa no ecrã.
   */
  carregar: (forcar?: boolean) => Promise<void>;
  /** Substitui a lista já, sem esperar pela rede. Para quem acabou de criar,
   *  renomear ou apagar e não quer ver a mudança só daqui a um segundo. */
  aplicar: (fn: (items: Playlist[]) => Playlist[]) => void;
  limpar: () => void;
};

/** Impede que duas chamadas ao mesmo tempo façam o trabalho a dobrar. */
let emCurso: Promise<void> | null = null;
let geracao = 0;

/**
 * A última lista boa, em disco, por conta (16/10, auditoria 29): sem rede as
 * Playlists abrem com ela, e com rede ela pinta o ecrã antes da resposta. A
 * conta é a do aparelho (`offlineUserId`), que não precisa da rede.
 */
const CHAVE_DO_DISCO = 'duotone:playlists:v1:';
const contaDoAparelho = (): string | null => {
  const a = useAuth.getState();
  return a.session?.user.id ?? a.offlineUserId ?? null;
};
async function lerDoDisco(conta: string): Promise<Playlist[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_DO_DISCO + conta);
    const lista = raw ? JSON.parse(raw) : null;
    return Array.isArray(lista) ? lista : null;
  } catch { return null; }
}

export const usePlaylists = create<Playlists>((set, get) => ({
  items: [],
  estado: 'vazio',
  erro: '',
  carregadoEm: 0,

  limpar: () => {
    geracao++;
    emCurso = null;
    set({ items: [], estado: 'vazio', erro: '', carregadoEm: 0 });
  },

  aplicar: (fn) => set({ items: fn(get().items) }),

  carregar: async (forcar = false) => {
    if (emCurso) return emCurso;
    if (!forcar && get().estado === 'pronto' && Date.now() - get().carregadoEm < FRESCO_MS) return;
    const atual = geracao;
    const conta = contaDoAparelho();

    // O esqueleto é SÓ para quem não tem nada. Com lista no ecrã, a
    // revalidação não se anuncia — era esse anúncio o pisca.
    if (get().items.length === 0) set({ estado: 'a-carregar', erro: '' });

    const trabalho = (async () => {
      // Sem nada no ecrã, o disco primeiro: é instantâneo, e sem rede é tudo.
      if (get().items.length === 0 && conta) {
        const doDisco = await lerDoDisco(conta);
        if (doDisco && atual === geracao && get().items.length === 0) set({ items: doDisco, estado: 'pronto', erro: '' });
      }
      if (useConnectivity.getState().offline) {
        if (atual === geracao && get().items.length === 0) set({ estado: 'pronto', erro: 'Your playlists need an internet connection the first time.' });
        return;
      }
      return listPlaylists();
    })()
      .then((rows) => {
        if (!rows || atual !== geracao) return;
        set({ items: rows, estado: 'pronto', erro: '', carregadoEm: Date.now() });
        if (conta) void AsyncStorage.setItem(CHAVE_DO_DISCO + conta, JSON.stringify(rows)).catch(() => {});
      })
      .catch(() => {
        if (atual !== geracao) return;
        // Falhar a revalidar NÃO deita fora o que já está no ecrã: uma lista
        // de há trinta segundos vale muito mais do que uma mensagem de erro
        // por cima de um vazio.
        set(get().items.length > 0
          ? { estado: 'pronto' }
          : { estado: 'pronto', erro: 'Could not load your playlists. Please try again.' });
      })
      .finally(() => {
        if (atual === geracao) emCurso = null;
      });

    emCurso = trabalho;
    return trabalho;
  },
}));

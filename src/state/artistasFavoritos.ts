import { create } from 'zustand';
import { getArtistasFavoritos, setArtistasFavoritos } from '../lib/prefs';

/**
 * Os artistas favoritos, em memória, para os dois ecrãs dos Artists.
 *
 * Numa store e não num `useState` de cada ecrã: a estrela tem de acender no
 * instante do toque e a lista tem de reordenar-se por baixo dela, e o iPhone e
 * o PC têm ecrãs diferentes a ler a mesma coisa.
 *
 * As chaves são as canónicas (`chaveDeArtista`) -- ver `getArtistasFavoritos`.
 */
interface Favoritos {
  chaves: Set<string>;
  carregados: boolean;
  carregar: () => Promise<void>;
  /** Favorita ou desfavorita, e grava. O ecrã não espera pelo disco. */
  alternar: (chave: string) => void;
  /** Limpa o que está em memória -- ao sair da conta. */
  esquecer: () => void;
}

export const useArtistasFavoritos = create<Favoritos>()((set, get) => ({
  chaves: new Set(),
  carregados: false,

  carregar: async () => {
    try {
      set({ chaves: new Set(await getArtistasFavoritos()), carregados: true });
    } catch {
      // Sem disco não há favoritos: a página continua pela ordem de sempre.
      set({ carregados: true });
    }
  },

  alternar: (chave) => {
    if (!chave) return;
    const chaves = new Set(get().chaves);
    if (chaves.has(chave)) chaves.delete(chave);
    else chaves.add(chave);
    set({ chaves });
    // A escrita é o efeito, não a fonte: falhar aqui deixa o ecrã certo e a
    // preferência por gravar, que é melhor do que uma estrela que não acende.
    void setArtistasFavoritos([...chaves]).catch(() => {});
  },

  esquecer: () => set({ chaves: new Set(), carregados: false }),
}));

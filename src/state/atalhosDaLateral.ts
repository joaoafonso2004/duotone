import { create } from 'zustand';
import { getAtalhosDaLateral, setAtalhosDaLateral } from '../lib/prefs';
import {
  chaveDoAtalho, fixar as fixarNaLista, lerAtalhos, mover as moverNaLista, tirar as tirarDaLista, type Atalho,
} from '../lib/atalhosDaLateral';

/**
 * Os atalhos da lateral do PC em memória -- as regras vivem em
 * `lib/atalhosDaLateral.ts`. Cada mudança escreve logo no disco (e daí para a
 * conta, pelo `prefsSync`), pela ordem em que aconteceu.
 */
type Atalhos = {
  lista: Atalho[];
  carregados: boolean;
  carregar: () => Promise<void>;
  /** Devolve `false` quando a lista está cheia. */
  fixar: (a: Atalho) => boolean;
  tirar: (chave: string) => void;
  mover: (chave: string, passo: number) => void;
  alternar: (a: Atalho) => boolean;
  esquecer: () => void;
};

let gravacao: Promise<void> = Promise.resolve();
const gravar = (lista: Atalho[]) => {
  gravacao = gravacao.then(() => setAtalhosDaLateral(lista)).catch(() => {});
};

export const useAtalhosDaLateral = create<Atalhos>((set, get) => ({
  lista: [],
  carregados: false,
  carregar: async () => {
    const lista = lerAtalhos(await getAtalhosDaLateral());
    set({ lista, carregados: true });
  },
  fixar: (a) => {
    const { lista, cheia } = fixarNaLista(get().lista, a);
    if (cheia) return false;
    set({ lista });
    gravar(lista);
    return true;
  },
  tirar: (chave) => {
    const lista = tirarDaLista(get().lista, chave);
    set({ lista });
    gravar(lista);
  },
  mover: (chave, passo) => {
    const lista = moverNaLista(get().lista, chave, passo);
    set({ lista });
    gravar(lista);
  },
  alternar: (a) => {
    const k = chaveDoAtalho(a);
    if (get().lista.some((x) => chaveDoAtalho(x) === k)) { get().tirar(k); return true; }
    return get().fixar(a);
  },
  esquecer: () => set({ lista: [], carregados: false }),
}));

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  alternarBotao, aplicarTema, lerAparencia, PADRAO, temaDe,
  type Aparencia, type BotaoDoLeitor, type IdDoTema,
} from '../lib/aparencia';

/**
 * A personalização do iPhone (10/10, `lib/aparencia.ts`): a store que o leitor,
 * a barra de baixo, as listas e o fundo leem. Fica no aparelho
 * (`pref:aparencia`): o iPhone e o PC não se parecem, e não custa nada ao
 * Supabase. Carrega no arranque (`App.tsx`); até lá, o de sempre.
 */
const CHAVE = 'pref:aparencia';

type Estado = Aparencia & {
  carregar: () => Promise<void>;
  mudar: <K extends keyof Aparencia>(chave: K, valor: Aparencia[K]) => void;
  escolherTema: (id: IdDoTema) => void;
  alternarBotao: (b: BotaoDoLeitor) => void;
};

function guardar(a: Aparencia): void {
  void AsyncStorage.setItem(CHAVE, JSON.stringify(a)).catch(() => {});
}
function soAparencia(s: Estado): Aparencia {
  const { carregar: _c, mudar: _m, escolherTema: _e, alternarBotao: _a, ...a } = s;
  return a;
}

export const useAparencia = create<Estado>((set, get) => ({
  ...PADRAO,
  carregar: async () => {
    try {
      const v = await AsyncStorage.getItem(CHAVE);
      if (v) set(lerAparencia(JSON.parse(v)));
    } catch { /* fica o de sempre */ }
  },
  mudar: (chave, valor) => {
    set({ [chave]: valor } as Partial<Aparencia>);
    guardar(soAparencia(get()));
  },
  escolherTema: (id) => {
    set(aplicarTema(id));
    guardar(soAparencia(get()));
  },
  alternarBotao: (b) => {
    set({ botoes: alternarBotao(get().botoes, b) });
    guardar(soAparencia(get()));
  },
}));

/** O tema que as opções de agora fazem, ou "custom". */
export function useTemaDaAparencia(): IdDoTema | 'custom' {
  return useAparencia((s) => temaDe(soAparencia(s)));
}

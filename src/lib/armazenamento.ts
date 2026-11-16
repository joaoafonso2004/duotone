import AsyncStorageDeSempre from '@react-native-async-storage/async-storage';

/**
 * O AsyncStorage da app no iPhone, por cima do MMKV (16/11, pedido do João:
 * react-native-mmkv). O `metro.config.js` desvia para aqui todo o
 * `import AsyncStorage from '@react-native-async-storage/async-storage'` do
 * código da app no iPhone: as ~250 leituras e escritas ficam como estavam, e
 * passam a ser do MMKV (síncronas, sem a ponte). No PC (e nos testes em Node)
 * nada muda.
 *
 * O cuidado com o Supabase (o João: "atenção aos gastos na base de dados"): o
 * que está no aparelho são caches que poupam pedidos (o catálogo, os ids das
 * músicas, as playlists, a biblioteca). Trocar de cofre sem as trazer era pôr
 * todos os iPhones a pedir tudo outra vez no dia da atualização. Por isso:
 *
 * - **ler**: primeiro o MMKV; o que lá não está lê-se do AsyncStorage de
 *   sempre e copia-se para o MMKV. Nada se perde, e cada chave muda uma vez,
 *   quando é precisa -- sem uma migração inteira no arranque;
 * - **apagar**: dos dois, senão o que estava no antigo voltava ao ler;
 * - **valores grandes** (mais de `GRANDE` caracteres: a biblioteca inteira,
 *   uma playlist enorme) ficam no AsyncStorage: o MMKV é um ficheiro mapeado
 *   em memória, e é para chaves pequenas e muitas;
 * - **sem o módulo nativo** (um binário antigo com este JavaScript), é o
 *   AsyncStorage de sempre: a app degrada, não rebenta.
 *
 * Puro na lógica: `criarArmazem` recebe os dois cofres
 * (`scripts/test-armazenamento.ts`).
 */

/** O que se usa do MMKV (react-native-mmkv 4). */
export type CofreRapido = {
  getString(chave: string): string | undefined;
  set(chave: string, valor: string): void;
  remove(chave: string): boolean | void;
  getAllKeys(): string[];
  clearAll(): void;
};

/** O que se usa do AsyncStorage. */
export type CofreLento = {
  getItem(chave: string): Promise<string | null>;
  setItem(chave: string, valor: string): Promise<void>;
  removeItem(chave: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove?(chaves: readonly string[]): Promise<void>;
  clear?(): Promise<void>;
};

/** Daqui para cima, o valor fica no AsyncStorage. ~200 KB. */
export const GRANDE = 200_000;

export function criarArmazem(rapido: CofreRapido | null, lento: CofreLento) {
  const getItem = async (chave: string): Promise<string | null> => {
    if (!rapido) return lento.getItem(chave);
    const ja = rapido.getString(chave);
    if (ja !== undefined) return ja;
    const antigo = await lento.getItem(chave);
    // Trazido uma vez; os grandes continuam lá.
    if (antigo != null && antigo.length <= GRANDE) {
      try { rapido.set(chave, antigo); } catch { /* fica no antigo, lê-se de lá */ }
    }
    return antigo;
  };
  const setItem = async (chave: string, valor: string): Promise<void> => {
    if (!rapido) return lento.setItem(chave, valor);
    if (valor.length > GRANDE) {
      rapido.remove(chave);
      await lento.setItem(chave, valor);
      return;
    }
    rapido.set(chave, valor);
  };
  const removeItem = async (chave: string): Promise<void> => {
    if (rapido) rapido.remove(chave);
    await lento.removeItem(chave);
  };
  return {
    getItem,
    setItem,
    removeItem,
    async multiGet(chaves: readonly string[]): Promise<[string, string | null][]> {
      return Promise.all(chaves.map(async (k) => [k, await getItem(k)] as [string, string | null]));
    },
    async multiSet(pares: readonly (readonly [string, string])[]): Promise<void> {
      for (const [k, v] of pares) await setItem(k, v);
    },
    async multiRemove(chaves: readonly string[]): Promise<void> {
      if (rapido) for (const k of chaves) rapido.remove(k);
      if (lento.multiRemove) await lento.multiRemove(chaves);
      else for (const k of chaves) await lento.removeItem(k);
    },
    async getAllKeys(): Promise<string[]> {
      const antigas = await lento.getAllKeys();
      return [...new Set([...(rapido?.getAllKeys() ?? []), ...antigas])];
    },
    async clear(): Promise<void> {
      rapido?.clearAll();
      await lento.clear?.();
    },
  };
}

/** O MMKV, se o binário o tiver (a 6.0.6 em diante); senão, nada. */
function abrirMmkv(): CofreRapido | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMMKV } = require('react-native-mmkv') as { createMMKV: (c?: { id?: string }) => CofreRapido };
    return createMMKV({ id: 'duotone' });
  } catch {
    return null;
  }
}

const AsyncStorage = criarArmazem(abrirMmkv(), AsyncStorageDeSempre as unknown as CofreLento);
export default AsyncStorage;

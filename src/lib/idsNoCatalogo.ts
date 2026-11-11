import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * O id de cada faixa na tabela `tracks`, guardado no aparelho (11/11).
 *
 * Contar uma escuta precisa do id da faixa, e pedi-lo é um
 * `upsert_catalog_tracks` (um pedido à API, uma linha de log). Já se guardava
 * em memória durante a sessão (`api/plays.ts`); agora fica também no disco,
 * porque o id de uma faixa nunca muda e quem ouve volta muitas vezes às mesmas
 * músicas. Com a app pública, uma conta pedia-o 18 vezes por hora.
 *
 * Best-effort: um disco que falha só faz pedir outra vez, como antes.
 */
const CHAVE = 'duotone:ids-do-catalogo:v1';
const MAXIMO = 3000;
const ids = new Map<string, string>();
let carregamento: Promise<void> | null = null;
let escrita: ReturnType<typeof setTimeout> | undefined;

function carregar(): Promise<void> {
  return carregamento ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(CHAVE);
      const dados: unknown = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(dados)) return;
      for (const par of dados) {
        if (Array.isArray(par) && typeof par[0] === 'string' && typeof par[1] === 'string') ids.set(par[0], par[1]);
      }
    } catch { /* uma cópia inválida só faz pedir outra vez */ }
  })();
}

function agendarEscrita(): void {
  while (ids.size > MAXIMO) ids.delete(ids.keys().next().value as string);
  if (escrita) return;
  escrita = setTimeout(() => {
    escrita = undefined;
    try { void AsyncStorage.setItem(CHAVE, JSON.stringify([...ids])).catch(() => {}); } catch { /* best-effort */ }
  }, 2_000);
}

/** O id guardado de `source:sourceId`, ou null. */
export async function idGuardado(chave: string): Promise<string | null> {
  await carregar();
  return ids.get(chave) ?? null;
}

export async function guardarId(chave: string, id: string): Promise<void> {
  await carregar();
  ids.delete(chave);
  ids.set(chave, id);
  agendarEscrita();
}

/** Um id que o servidor recusou (a faixa saiu da tabela): pede-se outra vez. */
export async function esquecerId(chave: string): Promise<void> {
  await carregar();
  if (ids.delete(chave)) agendarEscrita();
}

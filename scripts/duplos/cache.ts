/**
 * Duplo de src/api/cache.ts: o `yt_cache` da conta, num Map.
 *
 * É por ele que a memória do Smart Shuffle passa de um aparelho para o outro,
 * por isso o teste semeia aqui o que "o outro aparelho" deixou e lê o que este
 * enviou.
 */
export const DIA_MS = 24 * 60 * 60 * 1000;

export const naConta = new Map<string, unknown>();

export function cacheGet<T>(key: string): Promise<T | null> {
  return Promise.resolve((naConta.get(key) as T | undefined) ?? null);
}

export function cacheSet(key: string, payload: unknown): Promise<void> {
  naConta.set(key, payload);
  return Promise.resolve();
}

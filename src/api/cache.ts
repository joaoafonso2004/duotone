import { supabase } from '../lib/supabase';

/**
 * Cache partilhada, no Supabase, para respostas de serviços externos.
 *
 * Estava dentro do `api/youtube.ts` porque só ele precisava — a pesquisa da
 * Data API custa 100 unidades das 10.000 diárias. Saiu para aqui quando o
 * catálogo de artistas (`api/catalogo.ts`) passou a precisar do mesmo, e por um
 * motivo melhor do que a poupança: ficando na base de dados, a resposta é a
 * mesma no telemóvel e no computador, e sobrevive a fechar a app.
 *
 * Best-effort de propósito: uma cache que rebenta não pode partir a chamada
 * que ela devia acelerar.
 */

export const DIA_MS = 24 * 60 * 60 * 1000;

export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | null> {
  try {
    const { data } = await supabase
      .from('yt_cache')
      .select('payload, fetched_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const age = Date.now() - new Date(data.fetched_at as string).getTime();
    if (age > maxAgeMs) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, payload: unknown): Promise<void> {
  try {
    await supabase.from('yt_cache').upsert({
      cache_key: key,
      payload,
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // cache é best-effort
  }
}

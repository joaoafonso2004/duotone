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

/**
 * Uma camada em MEMÓRIA à frente do `yt_cache` (2/10), só para o que vem de
 * fora (`{ memoria: true }`: o catálogo de artistas e o YouTube). A mesma
 * vizinhança de um artista ia ao Supabase em cada sugestão do Smart Shuffle,
 * cada volta do rádio e cada mistura -- dezenas de pedidos iguais numa sessão,
 * e cada pedido é uma linha de log. O que é da CONTA (a memória do Smart
 * Shuffle, a aprendizagem, a mistura do dia) não a usa: outro aparelho pode
 * tê-lo mudado, e esses leem sempre o servidor.
 *
 * Guarda também a FALTA (a chave não existe ou caducou) por pouco tempo: quem
 * pede a seguir vai logo à fonte, e o `cacheSet` que vem depois substitui-a.
 * Pedidos iguais em simultâneo partilham o mesmo.
 */
const FALTA = Symbol('falta');
type NaMemoria = { payload: unknown; em: number };
const memoria = new Map<string, NaMemoria>();
const aCaminho = new Map<string, Promise<unknown>>();
const MAX_NA_MEMORIA = 600;
const FALTA_VALE_MS = 10 * 60 * 1000;

function lembrar(key: string, valor: NaMemoria): void {
  // Map pela ordem de inserção: reinserir põe-na no fim, e sai a mais antiga.
  memoria.delete(key);
  memoria.set(key, valor);
  if (memoria.size > MAX_NA_MEMORIA) memoria.delete(memoria.keys().next().value as string);
}

/** Só para os testes, e para quem queira começar do zero. */
export function esquecerCacheEmMemoria(): void {
  memoria.clear();
  aCaminho.clear();
}

async function lerDoServidor<T>(key: string, maxAgeMs: number, guardar: boolean): Promise<T | null> {
  try {
    const { data } = await supabase
      .from('yt_cache')
      .select('payload, fetched_at')
      .eq('cache_key', key)
      .maybeSingle();
    const em = data ? new Date(data.fetched_at as string).getTime() : 0;
    if (!data || Date.now() - em > maxAgeMs) {
      if (guardar) lembrar(key, { payload: FALTA, em: Date.now() });
      return null;
    }
    if (guardar) lembrar(key, { payload: data.payload, em });
    return data.payload as T;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string, maxAgeMs: number, opcoes?: { memoria?: boolean }): Promise<T | null> {
  if (!opcoes?.memoria) return lerDoServidor<T>(key, maxAgeMs, false);
  const m = memoria.get(key);
  if (m) {
    if (m.payload === FALTA) {
      if (Date.now() - m.em < FALTA_VALE_MS) return null;
    } else if (Date.now() - m.em <= maxAgeMs) {
      lembrar(key, m);
      return m.payload as T;
    }
  }
  const pendente = aCaminho.get(key);
  if (pendente) return pendente as Promise<T | null>;
  const pedido = lerDoServidor<T>(key, maxAgeMs, true).finally(() => aCaminho.delete(key));
  aCaminho.set(key, pedido);
  return pedido;
}

export async function cacheSet(key: string, payload: unknown): Promise<void> {
  // Quem leu com memória passa a ter o valor novo sem voltar ao servidor.
  if (memoria.has(key)) lembrar(key, { payload, em: Date.now() });
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

import { supabase } from '../lib/supabase';
import {
  addSearchHistoryEntry as addLocal,
  clearSearchHistory as clearLocal,
  getSearchHistory as getLocal,
} from '../lib/prefs';

/**
 * Pesquisas recentes ligadas à CONTA (Supabase), com fallback LOCAL.
 *
 * Antes eram só locais (AsyncStorage), por isso perdiam-se ao reinstalar a
 * app. Agora guardam-se por utilizador no Supabase (tabela `search_history`,
 * ver supabase/search-history.sql) e sobrevivem a logout/login, reinstalações
 * e sincronizam entre dispositivos. Se o SQL ainda não foi corrido (a tabela
 * não existe) ou não há rede, cai automaticamente no armazenamento local — a
 * funcionalidade nunca deixa de funcionar.
 */

const MAX = 10;

export async function getSearchHistory(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('search_history')
      .select('query')
      .order('searched_at', { ascending: false })
      .limit(MAX);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.query as string);
  } catch {
    return getLocal();
  }
}

export async function addSearchHistoryEntry(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return getSearchHistory();

  // Mantém sempre uma cópia local (backup + funciona sem o SQL corrido).
  addLocal(q).catch(() => {});

  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) {
      await supabase
        .from('search_history')
        .upsert(
          { user_id: uid, query: q, searched_at: new Date().toISOString() },
          { onConflict: 'user_id,query' }
        );
    }
  } catch {
    // sem conta/rede/tabela — a cópia local já ficou guardada
  }
  return getSearchHistory();
}

export async function clearSearchHistory(): Promise<void> {
  clearLocal().catch(() => {});
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) await supabase.from('search_history').delete().eq('user_id', uid);
  } catch {
    // ignorar
  }
}

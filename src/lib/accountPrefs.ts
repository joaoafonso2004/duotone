import { supabase } from './supabase';

export type AccountPrefs = Record<string, unknown>;

/** Compare-and-swap: concurrent devices change individual keys without
 * replacing a newer snapshot. Preserves fields owned by other features. */
export async function updateAccountPrefs(
  userId: string, change: (prefs: AccountPrefs) => AccountPrefs,
  active: () => boolean = () => true,
): Promise<AccountPrefs> {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!active()) throw new Error('Account changed');
    const { data, error } = await supabase.from('user_prefs')
      .select('prefs,updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!active()) throw new Error('Account changed');
    const prefs = change(data?.prefs ?? {});
    if (data && JSON.stringify(prefs) === JSON.stringify(data.prefs)) return prefs;
    const row = { user_id: userId, prefs, updated_at: new Date(Math.max(Date.now(), Date.parse(data?.updated_at ?? '') + 1 || 0)).toISOString() };
    const result = data
      ? await supabase.from('user_prefs').update(row).eq('user_id', userId)
        .eq('updated_at', data.updated_at).select('user_id')
      : await supabase.from('user_prefs').insert(row).select('user_id');
    if (result.error) {
      if (result.error.code === '23505') continue;
      throw result.error;
    }
    if (result.data?.length) return prefs;
  }
  throw new Error('Preferences changed concurrently; retrying later');
}

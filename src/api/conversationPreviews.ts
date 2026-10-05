import { supabase } from '../lib/supabase';
import type { ConversationPreview } from '../lib/socialActivity';

/** Substitui a leitura de datas por uma linha compacta por conversa, nas duas direções. */
export async function getConversationPreviews(): Promise<{
  activity: Record<string, number>; previews: Record<string, ConversationPreview>; complete: boolean;
}> {
  const result = await supabase.rpc('conversation_summaries');
  if (result.error) {
    if (!['PGRST202', '42883'].includes(result.error.code)) throw result.error;
    // Clientes novos continuam a abrir Social antes de a migração ficar disponível.
    const old = await supabase.rpc('conversation_activity');
    if (old.error) throw old.error;
    return { activity: Object.fromEntries((old.data ?? []).map((r: {outro: string; ultima: string}) => [r.outro, Date.parse(r.ultima)])),
      previews: {}, complete: false };
  }
  const activity: Record<string, number> = {}, previews: Record<string, ConversationPreview> = {};
  for (const row of result.data ?? []) {
    const at = Date.parse(row.ultima);
    if (!row.outro || !Number.isFinite(at)) continue;
    const key = row.is_group ? `group:${row.outro}` : row.outro;
    activity[row.outro] = at;
    previews[key] = { createdAt: row.ultima, senderId: row.sender_id, itemType: row.item_type,
      message: row.message, trackTitle: row.track_title, trackArtist: row.track_artist };
  }
  return { activity, previews, complete: true };
}

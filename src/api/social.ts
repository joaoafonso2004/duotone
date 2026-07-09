import { supabase } from '../lib/supabase';
import type { Track } from '../types';

export interface Friendship {
  friendId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  status: 'pending' | 'accepted';
  isSender: boolean;
  lastSeenAt: string | null;
}

export interface SharedItem {
  id: string;
  sender: {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  itemType: 'playlist' | 'track';
  playlistId: string | null;
  trackData: Track | null;
  message: string | null;
  createdAt: string;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Session expired');
  return data.user.id;
}

export async function sendFriendRequest(username: string): Promise<void> {
  const uname = username.trim();
  if (!uname) throw new Error('Insira um nome de utilizador válido.');

  const currentUid = await currentUserId();

  // Procurar o utilizador alvo na tabela profiles (case-insensitive)
  const { data: targetProfile, error: pError } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', uname)
    .single();

  if (pError || !targetProfile) {
    throw new Error('Utilizador não encontrado.');
  }

  if (targetProfile.id === currentUid) {
    throw new Error('Não se pode adicionar a si próprio.');
  }

  // Garantir a ordem dos IDs na amizade (user_id_1 < user_id_2)
  const user_id_1 = currentUid < targetProfile.id ? currentUid : targetProfile.id;
  const user_id_2 = currentUid < targetProfile.id ? targetProfile.id : currentUid;

  const { error: insError } = await supabase
    .from('friendships')
    .insert({
      user_id_1,
      user_id_2,
      status: 'pending',
      requester_id: currentUid,
    });

  if (insError) {
    throw new Error('Já existe um pedido pendente ou ligação com este utilizador.');
  }
}

export async function getFriendships(): Promise<Friendship[]> {
  const currentUid = await currentUserId();

  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`user_id_1.eq.${currentUid},user_id_2.eq.${currentUid}`);

  if (error || !data || data.length === 0) return [];

  const otherIds = data.map((r) => (r.user_id_1 === currentUid ? r.user_id_2 : r.user_id_1));

  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, last_seen_at')
    .in('id', otherIds);

  if (pError || !profiles) return [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return data.map((r) => {
    const otherId = r.user_id_1 === currentUid ? r.user_id_2 : r.user_id_1;
    const profile = profileMap.get(otherId);
    return {
      friendId: otherId,
      username: profile?.username || 'unknown',
      name: profile?.name || 'Unknown',
      avatarUrl: profile?.avatar_url || null,
      status: r.status as 'pending' | 'accepted',
      isSender: r.requester_id === currentUid,
      lastSeenAt: profile?.last_seen_at || null,
    };
  });
}

export async function acceptFriendRequest(friendId: string): Promise<void> {
  const currentUid = await currentUserId();
  const user_id_1 = currentUid < friendId ? currentUid : friendId;
  const user_id_2 = currentUid < friendId ? friendId : currentUid;

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2);

  if (error) throw new Error('Não foi possível aceitar o pedido.');
}

export async function declineOrRemoveFriendship(friendId: string): Promise<void> {
  const currentUid = await currentUserId();
  const user_id_1 = currentUid < friendId ? currentUid : friendId;
  const user_id_2 = currentUid < friendId ? friendId : currentUid;

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2);

  if (error) throw new Error('Não foi possível remover a amizade.');
}

export async function shareItem(
  friendId: string,
  itemType: 'playlist' | 'track',
  item: any,
  message?: string
): Promise<void> {
  const currentUid = await currentUserId();

  const payload: any = {
    sender_id: currentUid,
    recipient_id: friendId,
    item_type: itemType,
    message: message?.trim() || null,
  };

  if (itemType === 'playlist') {
    payload.playlist_id = item.id;
  } else {
    payload.track_data = item;
  }

  const { error } = await supabase.from('shared_items').insert(payload);
  if (error) throw new Error('Não foi possível partilhar o item.');
}

export async function getInboxItems(): Promise<SharedItem[]> {
  const currentUid = await currentUserId();

  // Carregar os itens em que o destinatário é o utilizador atual
  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('recipient_id', currentUid)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return [];

  // Obter perfis dos remetentes
  const senderIds = Array.from(new Set(data.map((r) => r.sender_id)));
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .in('id', senderIds);

  if (pError || !profiles) return [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return data.map((r) => {
    const sender = profileMap.get(r.sender_id);
    return {
      id: r.id,
      sender: {
        id: r.sender_id,
        username: sender?.username || 'unknown',
        name: sender?.name || 'Unknown',
        avatarUrl: sender?.avatar_url || null,
      },
      itemType: r.item_type as 'playlist' | 'track',
      playlistId: r.playlist_id,
      trackData: r.track_data,
      message: r.message,
      createdAt: r.created_at,
    };
  });
}

export async function deleteInboxItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('shared_items').delete().eq('id', itemId);
  if (error) throw new Error('Não foi possível apagar a partilha.');
}

export async function getFriendCount(): Promise<number> {
  try {
    const uid = await currentUserId();
    const { count, error } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`user_a.eq.${uid},user_b.eq.${uid}`);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function updateLastSeen(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id);
  } catch {
    // silently fail
  }
}

export async function getChatMessages(friendId: string): Promise<SharedItem[]> {
  const currentUid = await currentUserId();

  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .or(`and(sender_id.eq.${currentUid},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${currentUid})`)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) return [];

  const senderIds = Array.from(new Set(data.map((r) => r.sender_id)));
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .in('id', senderIds);

  if (pError || !profiles) return [];
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return data.map((r) => {
    const sender = profileMap.get(r.sender_id);
    return {
      id: r.id,
      sender: {
        id: r.sender_id,
        username: sender?.username || 'unknown',
        name: sender?.name || 'Unknown',
        avatarUrl: sender?.avatar_url || null,
      },
      itemType: r.item_type as 'playlist' | 'track',
      playlistId: r.playlist_id,
      trackData: r.track_data,
      message: r.message,
      createdAt: r.created_at,
    };
  });
}

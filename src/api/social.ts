import { livePresence, PRESENCE_DEBOUNCE_MS, PRESENCE_HEARTBEAT_MS } from '../lib/presence';
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
  currentlyPlaying?: {
    id: string | null;
    source: string;
    sourceId: string;
    title: string;
    artist: string | null;
    artworkUrl: string | null;
    durationSeconds: number | null;
    isPlaying: boolean;
    updatedAt: string;
  } | null;
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

export async function sendFriendRequest(targetUserId: string): Promise<void> {
  const currentUid = await currentUserId();

  if (targetUserId === currentUid) {
    throw new Error('Não se pode adicionar a si próprio.');
  }

  // Garantir a ordem dos IDs na amizade (user_id_1 < user_id_2)
  const user_id_1 = currentUid < targetUserId ? currentUid : targetUserId;
  const user_id_2 = currentUid < targetUserId ? targetUserId : currentUid;

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

export async function searchProfiles(query: string): Promise<any[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const currentUid = await currentUserId();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
    .neq('id', currentUid)
    .limit(15);

  if (error || !data) return [];
  return data;
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
    .select('id, name, username, avatar_url, last_seen_at, currently_playing')
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
      // Filtrado à leitura: registos antigos (app fechada sem limpar) ou em
      // pausa não contam como "a ouvir". Corrige também o que já está preso
      // na base de dados, sem migração.
      currentlyPlaying: livePresence(profile?.currently_playing),
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

/**
 * Partilha com um amigo ou com varios de uma vez.
 *
 * Aceita uma lista porque mandar a mesma musica a tres pessoas eram tres
 * viagens a base de dados e tres sitios onde falhar a meio; o Supabase insere
 * um array numa chamada so, e ou entram todas ou nao entra nenhuma.
 */
export async function shareItem(
  friendId: string | readonly string[],
  itemType: 'playlist' | 'track',
  item: any,
  message?: string
): Promise<void> {
  const currentUid = await currentUserId();

  // Sem duplicados: a mesma pessoa escolhida duas vezes na interface nao pode
  // dar duas mensagens iguais.
  const destinatarios = Array.from(new Set(
    (Array.isArray(friendId) ? friendId : [friendId]).filter(Boolean),
  ));
  if (destinatarios.length === 0) return;

  const comum: any = {
    sender_id: currentUid,
    item_type: itemType,
    message: message?.trim() || null,
  };

  if (itemType === 'playlist') {
    comum.playlist_id = item.id;
  } else {
    comum.track_data = item;
  }

  const linhas = destinatarios.map((id) => ({ ...comum, recipient_id: id }));

  const { error } = await supabase.from('shared_items').insert(linhas);
  if (error) {
    throw new Error(destinatarios.length > 1
      ? 'Não foi possível partilhar com todos.'
      : 'Não foi possível partilhar o item.');
  }
}

export async function getInboxItems(): Promise<SharedItem[]> {
  const currentUid = await currentUserId();

  // Carregar os itens em que o destinatário é o utilizador atual.
  // Itens arquivados (removidos da inbox) ficam de fora — mas continuam
  // a existir na conversa (getChatMessages não filtra por archived_at).
  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('recipient_id', currentUid)
    .is('archived_at', null)
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

/** Remove um item da caixa de entrada SEM o apagar da conversa: marca
 * archived_at em vez de DELETE (que apagava a mensagem dos dois lados —
 * requer a migração supabase/inbox-archive.sql). */
export async function archiveInboxItem(itemId: string): Promise<void> {
  // .select() no fim: sem a política de UPDATE da migração, o Supabase
  // "atualiza" 0 linhas sem erro — o select vazio denuncia isso.
  const { data, error } = await supabase
    .from('shared_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('id');
  if (error || !data || data.length === 0) {
    throw new Error(
      'Não foi possível remover da caixa de entrada. (Já correste a migração supabase/inbox-archive.sql?)'
    );
  }
}

export async function getFriendCount(): Promise<number> {
  try {
    const uid = await currentUserId();
    const { count, error } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`user_id_1.eq.${uid},user_id_2.eq.${uid}`);
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

/**
 * Escreve (ou limpa) o "a ouvir agora" do utilizador atual.
 *
 * Chamar diretamente a cada mudança de estado do leitor era o que causava
 * lag ao saltar faixas — cada salto disparava um pedido. Usa antes
 * `publishPresence`, que agrupa as chamadas.
 */
export async function updateCurrentlyPlaying(track: any | null, isPlaying: boolean): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Em pausa não se guarda a faixa: um registo pausado deixado para trás é
    // exatamente o que fazia os amigos aparecerem a ouvir algo para sempre.
    const payload =
      track && isPlaying
        ? {
            id: track.id || null,
            source: track.source,
            sourceId: track.sourceId,
            title: track.title,
            artist: track.artist || null,
            artworkUrl: track.artworkUrl || null,
            durationSeconds: track.durationSeconds || null,
            isPlaying: true,
            updatedAt: new Date().toISOString(),
          }
        : null;

    await supabase
      .from('profiles')
      .update({ currently_playing: payload })
      .eq('id', user.id);
  } catch {
    // silently fail
  }
}

let presenceTimer: ReturnType<typeof setTimeout> | null = null;
let presenceBeat: ReturnType<typeof setInterval> | null = null;
let presenceLast: { track: any | null; isPlaying: boolean } = { track: null, isPlaying: false };

/**
 * Ponto de entrada usado pelas duas plataformas.
 *
 * Agrupa as escritas (saltar 5 faixas seguidas dá um pedido, não cinco) e
 * mantém um batimento enquanto toca, para o registo não expirar a meio de um
 * tema longo.
 */
export function publishPresence(track: any | null, isPlaying: boolean): void {
  presenceLast = { track, isPlaying };

  if (presenceTimer) clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    void updateCurrentlyPlaying(presenceLast.track, presenceLast.isPlaying);
  }, PRESENCE_DEBOUNCE_MS);

  if (presenceBeat) {
    clearInterval(presenceBeat);
    presenceBeat = null;
  }
  if (track && isPlaying) {
    presenceBeat = setInterval(() => {
      void updateCurrentlyPlaying(presenceLast.track, presenceLast.isPlaying);
    }, PRESENCE_HEARTBEAT_MS);
  }
}

/**
 * Limpeza imediata, sem passar pelo agrupamento: para sair da app, ir para
 * segundo plano ou fechar a janela, onde não há tempo para esperar.
 */
export function clearPresence(): void {
  if (presenceTimer) {
    clearTimeout(presenceTimer);
    presenceTimer = null;
  }
  if (presenceBeat) {
    clearInterval(presenceBeat);
    presenceBeat = null;
  }
  presenceLast = { track: null, isPlaying: false };
  void updateCurrentlyPlaying(null, false);
}

export interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
}

export async function getFriendProfile(friendId: string): Promise<FriendProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, last_seen_at')
    .eq('id', friendId)
    .single();
  if (error || !data) throw new Error('Perfil não encontrado');
  return {
    id: data.id,
    name: data.name || 'Unknown',
    username: data.username || 'unknown',
    avatarUrl: data.avatar_url,
    lastSeenAt: data.last_seen_at,
  };
}

// ============================================================ conversas de grupo ==

/**
 * Um grupo, com quem la esta dentro.
 *
 * As mensagens de grupo vivem na MESMA tabela das outras (`shared_items`), mas
 * apontam para o grupo em vez de para uma pessoa (`group_id` em vez de
 * `recipient_id`). Guardar uma copia por membro parecia mais simples e nao e:
 * partia-se assim que alguem entrasse ou saisse, porque as mensagens antigas
 * ficavam com a lista de membros de quando foram enviadas. Ver
 * `supabase/group-chats.sql`.
 */
export interface ChatGroup {
  id: string;
  name: string;
  createdBy: string;
  membros: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  }[];
}

/**
 * Cria um grupo e mete la dentro quem foi escolhido -- e a ti.
 *
 * Quem cria entra sempre: um grupo sem o dono e um grupo que ele nao consegue
 * ver, porque a politica de leitura pede que se seja membro.
 */
export async function criarGrupo(
  nome: string,
  membros: readonly string[],
): Promise<string> {
  const currentUid = await currentUserId();
  const limpo = nome.trim();
  if (!limpo) throw new Error('O grupo precisa de um nome.');

  const { data, error } = await supabase
    .from('chat_groups')
    .insert({ name: limpo, created_by: currentUid })
    .select('id')
    .single();
  if (error || !data) throw new Error('Não foi possível criar o grupo.');

  const todos = Array.from(new Set([currentUid, ...membros].filter(Boolean)));
  const { error: erroMembros } = await supabase
    .from('chat_group_members')
    .insert(todos.map((id) => ({ group_id: data.id, user_id: id })));

  if (erroMembros) {
    // Um grupo sem membros nao serve para nada e ficava la a ocupar espaco.
    await supabase.from('chat_groups').delete().eq('id', data.id);
    throw new Error('Não foi possível adicionar os membros.');
  }
  return data.id as string;
}

/** Os grupos em que estas, com os membros de cada um. */
export async function getGrupos(): Promise<ChatGroup[]> {
  const currentUid = await currentUserId();

  // Os grupos onde estou. A politica ja filtra por mim, mas pedir explicito
  // poupa trabalho ao servidor e diz o que se quer.
  const { data: meus, error } = await supabase
    .from('chat_group_members')
    .select('group_id')
    .eq('user_id', currentUid);
  if (error || !meus || meus.length === 0) return [];

  const ids = meus.map((m) => m.group_id);
  const [{ data: grupos }, { data: membros }] = await Promise.all([
    supabase.from('chat_groups').select('id, name, created_by').in('id', ids),
    supabase.from('chat_group_members').select('group_id, user_id').in('group_id', ids),
  ]);
  if (!grupos) return [];

  const pessoas = Array.from(new Set((membros ?? []).map((m) => m.user_id)));
  const { data: perfis } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .in('id', pessoas.length ? pessoas : ['']);
  const porId = new Map((perfis ?? []).map((p) => [p.id, p]));

  return grupos.map((g) => ({
    id: g.id as string,
    name: g.name as string,
    createdBy: g.created_by as string,
    membros: (membros ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => {
        const p = porId.get(m.user_id);
        return {
          id: m.user_id as string,
          name: p?.name || 'Unknown',
          username: p?.username || 'unknown',
          avatarUrl: p?.avatar_url || null,
        };
      }),
  }));
}

/** As mensagens de um grupo, da mais antiga para a mais nova. */
export async function getGroupMessages(groupId: string): Promise<SharedItem[]> {
  const { data, error } = await supabase
    .from('shared_items')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) return [];

  const senderIds = Array.from(new Set(data.map((r) => r.sender_id)));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .in('id', senderIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

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
      itemType: r.item_type,
      playlistId: r.playlist_id,
      trackData: r.track_data,
      message: r.message,
      createdAt: r.created_at,
    } as SharedItem;
  });
}

/** Partilha (ou escreve) num grupo. */
export async function shareComGrupo(
  groupId: string,
  itemType: 'playlist' | 'track',
  item: any,
  message?: string,
): Promise<void> {
  const currentUid = await currentUserId();

  const payload: any = {
    sender_id: currentUid,
    group_id: groupId,
    // A base de dados exige um destino e SO um: com o group_id preenchido, o
    // recipient_id tem de ficar a null (ver a constraint destino_unico).
    recipient_id: null,
    item_type: itemType,
    message: message?.trim() || null,
  };
  if (itemType === 'playlist') payload.playlist_id = item.id;
  else payload.track_data = item;

  const { error } = await supabase.from('shared_items').insert(payload);
  if (error) throw new Error('Não foi possível enviar para o grupo.');
}

/** Sair de um grupo. Sair e sempre direito de cada um. */
export async function sairDoGrupo(groupId: string): Promise<void> {
  const currentUid = await currentUserId();
  const { error } = await supabase
    .from('chat_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', currentUid);
  if (error) throw new Error('Não foi possível sair do grupo.');
}

/** Acrescenta pessoas a um grupo onde ja estas. */
export async function acrescentarAoGrupo(
  groupId: string,
  membros: readonly string[],
): Promise<void> {
  const novos = Array.from(new Set(membros.filter(Boolean)));
  if (novos.length === 0) return;
  const { error } = await supabase
    .from('chat_group_members')
    // Quem ja la esta nao pode dar erro: a chave e (grupo, pessoa).
    .upsert(novos.map((id) => ({ group_id: groupId, user_id: id })),
      { onConflict: 'group_id,user_id', ignoreDuplicates: true });
  if (error) throw new Error('Não foi possível adicionar ao grupo.');
}

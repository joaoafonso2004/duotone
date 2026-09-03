import { getPublicProfiles, searchPublicProfiles } from './profiles';
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
  online?: boolean;
  currentlyPlaying?: {
    id?: string | null;
    source: 'youtube' | 'spotify';
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
  groupId?: string | null;
  itemType: 'playlist' | 'track';
  playlistId: string | null;
  trackData: Track | null;
  message: string | null;
  createdAt: string;
}

/** Dados sociais são entrada não confiável, mesmo depois da validação SQL:
 * instalações antigas e linhas já existentes também passam por aqui. */
export function sharedTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if ((row.source !== 'youtube' && row.source !== 'spotify')
      || typeof row.sourceId !== 'string' || !row.sourceId || row.sourceId.length > 300
      || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500
      || (row.artist != null && typeof row.artist !== 'string')
      || (row.album != null && typeof row.album !== 'string')
      || (row.artworkUrl != null && typeof row.artworkUrl !== 'string')
      || (row.durationSeconds != null && (typeof row.durationSeconds !== 'number' || !Number.isFinite(row.durationSeconds)))) return null;
  return {
    source: row.source, sourceId: row.sourceId, title: row.title.trim(),
    artist: typeof row.artist === 'string' ? row.artist.slice(0, 500) : null,
    album: typeof row.album === 'string' ? row.album.slice(0, 500) : null,
    artworkUrl: typeof row.artworkUrl === 'string' && row.artworkUrl.length <= 2048 ? row.artworkUrl : null,
    durationSeconds: typeof row.durationSeconds === 'number' && row.durationSeconds >= 0 && row.durationSeconds <= 86400 ? row.durationSeconds : null,
  };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Session expired');
  return data.user.id;
}

export async function sendFriendRequest(targetUserId: string): Promise<void> {
  const currentUid = await currentUserId();

  if (targetUserId === currentUid) {
    throw new Error('You cannot add yourself.');
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
    if(insError.code==='23505')return;
    throw new Error('Could not send the request. Try again.');
  }
}

export async function searchProfiles(query: string): Promise<any[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const currentUid = await currentUserId();

  return (await searchPublicProfiles(q)).filter((p) => p.id !== currentUid);
}

export async function getFriendships(): Promise<Friendship[]> {
  const currentUid = await currentUserId();

  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`user_id_1.eq.${currentUid},user_id_2.eq.${currentUid}`);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const otherIds = data.map((r) => (r.user_id_1 === currentUid ? r.user_id_2 : r.user_id_1));

  const profiles = await getPublicProfiles(otherIds);

  if (!profiles) return [];

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
      lastSeenAt: null,
      // Filtrado à leitura: registos antigos (app fechada sem limpar) ou em
      // pausa não contam como "a ouvir". Corrige também o que já está preso
      // na base de dados, sem migração.
      currentlyPlaying: null,
    };
  });
}

export async function acceptFriendRequest(friendId: string): Promise<void> {
  const currentUid = await currentUserId();
  const user_id_1 = currentUid < friendId ? currentUid : friendId;
  const user_id_2 = currentUid < friendId ? friendId : currentUid;

  const { data,error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2).eq('status','pending').eq('requester_id',friendId).select('status');

  if (error) throw new Error('Could not accept the request.');
  if(!data?.length){const {data:existing}=await supabase.from('friendships').select('status').eq('user_id_1',user_id_1).eq('user_id_2',user_id_2).maybeSingle();if(existing?.status!=='accepted')throw new Error('This request is no longer available. Refresh your friends.');}
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

  if (error) throw new Error('Could not remove this friend.');
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
      ? 'Could not share with everyone.'
      : 'Could not share this item.');
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
    .neq('sender_id', currentUid)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Obter perfis dos remetentes
  const senderIds = Array.from(new Set(data.map((r) => r.sender_id)));
  const profiles = await getPublicProfiles(senderIds);

  if (!profiles) return [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return data.map((r) => {
    const sender = profileMap.get(r.sender_id);
    const trackData = r.item_type === 'track' ? sharedTrack(r.track_data) : null;
    return {
      id: r.id,
      groupId: r.group_id ?? null,
      sender: {
        id: r.sender_id,
        username: sender?.username || 'unknown',
        name: sender?.name || 'Unknown',
        avatarUrl: sender?.avatar_url || null,
      },
      itemType: r.item_type as 'playlist' | 'track',
      playlistId: r.playlist_id,
      trackData,
      message: r.item_type === 'track' && !trackData && !r.message ? 'This shared track is unavailable.' : r.message,
      createdAt: r.created_at,
    };
  });
}

/** Remove um item da caixa de entrada SEM o apagar da conversa: marca
 * archived_at em vez de DELETE (que apagava a mensagem dos dois lados —
 * requer a migração supabase/inbox-archive.sql). */
export async function archiveInboxItem(itemId: string): Promise<void> {
  const { data, error } = await supabase.rpc('set_shared_item_archived', { p_item: itemId, p_archived: true });
  if (error || data !== true) {
    throw new Error(
      'Could not remove this from your inbox. (Have you run the supabase/inbox-archive.sql migration?)'
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

type MessageCursor=Pick<SharedItem,'id'|'createdAt'>;
export function getChatMessages(friendId:string,before?:MessageCursor):Promise<SharedItem[]> {
  return getConversationMessages({p_friend:friendId},before);
}
async function getConversationMessages(target:{p_friend?:string;p_group?:string},before?:MessageCursor):Promise<SharedItem[]> {
  const {data,error}=await supabase.rpc('get_social_messages',{...target,p_before_time:before?.createdAt,p_before_id:before?.id});
  if(error)throw error;
  if(!data?.length)return [];
  const profiles=await getPublicProfiles(Array.from(new Set<string>(data.map((r:any)=>r.sender_id))));
  const map=new Map(profiles.map(p=>[p.id,p]));
  return [...data].reverse().map((r:any)=>{
    const p=map.get(r.sender_id);
    const trackData=r.item_type==='track'?sharedTrack(r.track_data):null;
    return {id:r.id,groupId:r.group_id??null,sender:{id:r.sender_id,name:p?.name||'Utilizador',username:p?.username||'',avatarUrl:p?.avatar_url||null},
      itemType:r.item_type,playlistId:r.playlist_id,trackData,message:r.item_type==='track'&&!trackData&&!r.message?'This shared track is unavailable.':r.message,createdAt:r.created_at};
  });
}

export interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
}

export async function getFriendProfile(friendId: string): Promise<FriendProfile> {
  const data = (await getPublicProfiles([friendId]))[0];
  if (!data) throw new Error('Profile not found.');
  return { id:data.id, name:data.name || 'Sem nome', username:data.username || '', avatarUrl:data.avatar_url, lastSeenAt:null };

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
/**
 * Junta a causa real à mensagem, quando o servidor a dá.
 *
 * Deitar fora o erro do Postgres foi o que fez a criação de grupos falhar
 * às escuras: a app dizia "não foi possível" e o servidor tinha dito
 * "new row violates row-level security policy", que é a resposta inteira.
 */
function detalhe(mensagem: string, erro: { message?: string } | null): string {
  return erro?.message ? mensagem + ' (' + erro.message + ')' : mensagem;
}

export async function criarGrupo(
  nome: string,
  membros: readonly string[],
): Promise<string> {
  const currentUid = await currentUserId();
  const limpo = nome.trim();
  if (!limpo) throw new Error('The group needs a name.');

  const { data, error } = await supabase
    .from('chat_groups')
    .insert({ name: limpo, created_by: currentUid })
    .select('id')
    .single();
  // O erro do Postgres diz o que se passou -- a politica que barrou, a
  // coluna que falta. Sem ele fica-se com um "nao foi possivel" seco e a
  // adivinhar, que foi exatamente o que aconteceu aqui uma vez.
  if (error || !data) throw new Error(detalhe('Could not create the group.', error));

  const todos = Array.from(new Set([currentUid, ...membros].filter(Boolean)));
  const { error: erroMembros } = await supabase
    .from('chat_group_members')
    .insert(todos.map((id) => ({ group_id: data.id, user_id: id })));

  if (erroMembros) {
    // Um grupo sem membros nao serve para nada e ficava la a ocupar espaco.
    await supabase.from('chat_groups').delete().eq('id', data.id);
    throw new Error(detalhe('Could not add the members.', erroMembros));
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
  if(error)throw error;
  if (!meus || meus.length === 0) return [];

  const ids = meus.map((m) => m.group_id);
  const [{ data: grupos,error:groupError }, { data: membros,error:memberError }] = await Promise.all([
    supabase.from('chat_groups').select('id, name, created_by').in('id', ids),
    supabase.from('chat_group_members').select('group_id, user_id').in('group_id', ids),
  ]);
  if(groupError||memberError)throw groupError||memberError;
  if (!grupos) return [];

  const pessoas = Array.from(new Set((membros ?? []).map((m) => m.user_id)));
  const perfis = await getPublicProfiles(pessoas);
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
export function getGroupMessages(groupId:string,before?:MessageCursor):Promise<SharedItem[]> {
  return getConversationMessages({p_group:groupId},before);
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
  if (error) throw new Error('Could not send to this group.');
}

/** Sair de um grupo. Sair e sempre direito de cada um. */
export async function sairDoGrupo(groupId: string): Promise<void> {
  const currentUid = await currentUserId();
  const { error } = await supabase
    .from('chat_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', currentUid);
  if (error) throw new Error('Could not leave this group.');
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
  if (error) throw new Error('Could not add people to this group.');
}

/**
 * Apaga a conversa inteira com uma pessoa.
 *
 * Serve para as conversas que ficam para tras depois de se remover uma
 * amizade: o historico e preservado de proposito (a mensagem que alguem te
 * mandou nao desaparece porque deixaram de ser amigos), mas tem de haver
 * maneira de o arrumar.
 *
 * Apaga os dois sentidos. A politica de RLS deixa: numa conversa a dois podes
 * apagar o que enviaste E o que te enviaram. Numa de grupo so o que escreveste
 * -- por isso esta funcao nao serve para grupos, onde sair e o gesto certo.
 */
export async function apagarConversa(friendId: string): Promise<void> {
  const currentUid = await currentUserId();
  const { error } = await supabase
    .from('shared_items')
    .delete()
    .is('group_id', null)
    .or(`and(sender_id.eq.${currentUid},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${currentUid})`);
  if (error) throw new Error('Could not delete this conversation.');
}

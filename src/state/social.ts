import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import { getFriendships, getGrupos, getInboxItems, lerConversasVistas, marcarConversaVista, type Friendship, type ChatGroup, type SharedItem } from '../api/social';
import { getChatsVistos, marcarChatVisto } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { estadoDaPresenca, type SocialPresence } from '../lib/socialPresence';
import { fundirVistos } from '../lib/social';
import { clearProfileMediaCache } from '../lib/profileMedia';
import { getSocialConversations,type PublicProfile } from '../api/profiles';
import { appEstaVisivel } from '../lib/appVisibility';
import { serialRefresh, type InboxSnapshot } from '../lib/inAppNotifications';

interface SocialState {
  inboxSnapshot: InboxSnapshot | null;
  inboxError: boolean;
  profileVersion: number;
  contacts:PublicProfile[];
  conversation: {kind:'friend'|'group';id:string}|null;
  drafts: Record<string,string>;
  friends: Friendship[];
  groups: ChatGroup[];
  received: SharedItem[];
  /** Última mensagem de cada conversa, nas duas direções, para a ordenar. */
  activity: Record<string, number>;
  seen: Record<string, string>;
  loading: boolean;
  error: string | null;
  now: number;
  refresh: () => Promise<void>;
  markRead: (id: string, timestamp: string) => Promise<void>;
}
let generation = 0;
let running: Promise<void> | null = null;
let queued = false;
let rawFriends: Friendship[] = [];
let presences: Record<string, SocialPresence> = {};
let clockOffset = 0;
let available = false;
const friendsNow = (now: number) => rawFriends.map((friend) => {
  if (!available) return friend;
  const state = estadoDaPresenca(presences[friend.friendId], now);
  return { ...friend, online: state.online, lastSeenAt: state.lastSeenAt ?? friend.lastSeenAt, currentlyPlaying: state.track };
});

export const useSocial = create<SocialState>((set, get) => ({
  inboxSnapshot:null,inboxError:false,contacts:[],profileVersion:0,conversation:null,drafts:{},
  friends: [], groups: [], received: [], activity: {}, seen: {}, loading: true, error: null, now: Date.now(),
  refresh: () => {
    if (running) { queued = true; return running; }
    const gen = generation;
    const job = async () => {
      try {
        const [, groups, presence,contacts,activity] = await Promise.all([
          refreshInbox(), getGrupos(), supabase.rpc('get_social_presence'),getSocialConversations(),
          // Uma instalação sem o SQL novo continua a abrir: fica sem ordem, não sem lista.
          (async():Promise<Record<string,number>>=>{
            try{
              const r=await supabase.rpc('conversation_activity');
              if(r.error||!r.data)return {};
              return Object.fromEntries((r.data as {outro:string;ultima:string}[]).map(x=>[x.outro,Date.parse(x.ultima)]));
            }catch{return {};}
          })(),
        ]);
        if (gen !== generation) return;
        if (!presence.error && presence.data) {
          available = true;
          clockOffset = Date.parse(presence.data.serverTime) - Date.now();
          for (const p of presence.data.items as SocialPresence[]) {
            if (!presences[p.user_id] || Date.parse(p.updated_at) >= Date.parse(presences[p.user_id].updated_at)) presences[p.user_id] = p;
          }
        }
        const now = Date.now() + clockOffset;
        set({ contacts,friends: friendsNow(now), groups, activity, now, loading: false,
          error: get().inboxError ? INBOX_ERROR : presence.error ? 'Could not update presence. Try again.' : null });
      } catch (e) {
        if (gen === generation) set({ loading: false, error: 'Could not refresh Social. What you see may be out of date.' });
        console.warn('Erro ao atualizar o Social:', e);
      }
    };
    running = job().finally(() => {
      if (gen !== generation) return;
      running = null;
      if (queued) { queued = false; void get().refresh(); }
    });
    return running;
  },
  markRead: async (id,timestamp) => {
    const gen=generation;
    // O local primeiro: a bolinha tem de sair já, com ou sem rede.
    const seen=await marcarChatVisto(id,timestamp,accountId);
    if(gen===generation)set({seen:fundirVistos(get().seen,seen)});
    // E depois a conta, para os outros aparelhos saberem. Falhar aqui só
    // deixa a marca por partilhar; o próximo markRead com rede resolve.
    if(gen !== generation)return;
    try{await marcarConversaVista(id,timestamp);}catch{/* sem rede, ou SQL por aplicar */}
  },
}));
const INBOX_ERROR = 'Could not update messages or friend requests. Retrying while the app is open.';
let accountId='';
let refreshInbox: () => Promise<void> = async () => {};

/** Messages and requests must not wait for presence, groups or profile queries.
 * Both the Social UI and notifications observe this same successful snapshot. */
function createInboxRefresh(userId: string, gen: number) {
  return serialRefresh(async () => {
    if (gen !== generation || !appEstaVisivel()) return;
    const [inbox, friendships, local, remote] = await Promise.allSettled([
      getInboxItems(), getFriendships(), getChatsVistos(userId), lerConversasVistas(),
    ]);
    if (gen !== generation) return;
    const seen = fundirVistos(useSocial.getState().seen, fundirVistos(
      local.status === 'fulfilled' ? local.value : {}, remote.status === 'fulfilled' ? remote.value : {}));
    const snapshot: InboxSnapshot = {accountId:userId};
    if (inbox.status === 'fulfilled') snapshot.received = inbox.value;
    if (friendships.status === 'fulfilled') {
      snapshot.friends = friendships.value;
      if (rawFriends.some(f => f.status === 'accepted' && !friendships.value.some(n => n.friendId === f.friendId && n.status === 'accepted'))) clearProfileMediaCache();
      rawFriends = friendships.value;
    }
    const inboxError = inbox.status === 'rejected' || friendships.status === 'rejected';
    useSocial.setState({inboxError, error:inboxError ? INBOX_ERROR : useSocial.getState().error === INBOX_ERROR ? null : useSocial.getState().error, seen, friends:friendsNow(Date.now()+clockOffset),
      ...(snapshot.received ? {received:snapshot.received} : {}), inboxSnapshot:snapshot});
  });
}


/** A lista, o perfil e os cabeçalhos das conversas observam as mesmas entidades. */
export function iniciarSocial(userId: string): () => void {
  const gen = ++generation;
  accountId=userId;clearProfileMediaCache();
  refreshInbox=createInboxRefresh(userId,gen);
  const inboxRefresh=refreshInbox;
  rawFriends = []; presences = {}; available = false; clockOffset = 0; running = null; queued = false;
  useSocial.setState({ inboxSnapshot:null,inboxError:false,contacts:[],friends: [], groups: [], received: [], activity: {}, seen: {}, loading: true, error: null,conversation:null,drafts:{} });
  let debounce: ReturnType<typeof setTimeout>;
  let dirty=false;
  const refresh = () => {
    if(!appEstaVisivel()){dirty=true;return;}
    dirty=false;
    clearTimeout(debounce); debounce = setTimeout(() => void useSocial.getState().refresh(), 100);
  };
  const refreshMessages = () => {
    if (gen !== generation) return;
    if (!appEstaVisivel()) { dirty=true; return; }
    void inboxRefresh();
    refresh();
  };
  const channel = supabase.channel(`social:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'social_presence' }, (event) => {
      if (gen !== generation) return;
      const p = event.new as SocialPresence;
      if (p.user_id && (!presences[p.user_id] || Date.parse(p.updated_at) >= Date.parse(presences[p.user_id].updated_at))) {
        presences[p.user_id] = p;
        if(appEstaVisivel())useSocial.setState({ friends: friendsNow(Date.now() + clockOffset) });
        else dirty=true;
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refreshMessages)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_items' }, refreshMessages)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ()=>{useSocial.setState(s=>({profileVersion:s.profileVersion+1}));refresh();})
    .subscribe((status) => { if (status === 'SUBSCRIBED') refreshMessages(); });
  const tick = setInterval(() => {
    if(!appEstaVisivel())return;
    const now = Date.now() + clockOffset;
    useSocial.setState({ now, friends: friendsNow(now) });
  }, 30000);
  // Realtime é o caminho normal. A consulta periódica é só recuperação de uma
  // quebra silenciosa, por isso dois minutos chegam e evitam duas leituras
  // sociais completas por minuto enquanto nada muda.
  const recovery = setInterval(refresh, 120000);
  // Foreground-only recovery even when the SQL Realtime publication is absent.
  // This reads the inbox, requests and read markers, not all Social metadata.
  const inboxRecovery = setInterval(() => { if (appEstaVisivel()) void inboxRefresh(); }, 15000);
  const acordar=()=>{
    if(!appEstaVisivel())return;
    const now=Date.now()+clockOffset;
    useSocial.setState({now,friends:friendsNow(now)});
    void inboxRefresh();
    if(dirty)refresh(); else void useSocial.getState().refresh();
  };
  const app=AppState.addEventListener('change',acordar);
  if(Platform.OS==='web')document.addEventListener('visibilitychange',acordar);
  void useSocial.getState().refresh();
  return () => {
    ++generation; clearTimeout(debounce); clearInterval(tick); clearInterval(recovery); clearInterval(inboxRecovery);
    app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',acordar);
    accountId='';refreshInbox=async()=>{};clearProfileMediaCache();
    void supabase.removeChannel(channel);
    rawFriends = []; presences = {}; available = false; running = null; queued = false;
    useSocial.setState({ inboxSnapshot:null,inboxError:false,contacts:[],friends: [], groups: [], received: [], seen: {}, error: null, loading: true,conversation:null,drafts:{} });
  };
}

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

interface SocialState {
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
  contacts:[],profileVersion:0,conversation:null,drafts:{},
  friends: [], groups: [], received: [], activity: {}, seen: {}, loading: true, error: null, now: Date.now(),
  refresh: () => {
    if (running) { queued = true; return running; }
    const gen = generation;
    const job = async () => {
      try {
        const [friends, groups, received, seenLocal, presence,contacts,activity,seenRemoto] = await Promise.all([
          getFriendships(), getGrupos(), getInboxItems(), getChatsVistos(accountId), supabase.rpc('get_social_presence'),getSocialConversations(),
          // Uma instalação sem o SQL novo continua a abrir: fica sem ordem, não sem lista.
          (async():Promise<Record<string,number>>=>{
            try{
              const r=await supabase.rpc('conversation_activity');
              if(r.error||!r.data)return {};
              return Object.fromEntries((r.data as {outro:string;ultima:string}[]).map(x=>[x.outro,Date.parse(x.ultima)]));
            }catch{return {};}
          })(),
          // Idem: sem o chat-reads.sql aplicado, a marca fica só local — que
          // é exatamente o comportamento antigo, não uma avaria.
          (async():Promise<Record<string,string>>=>{
            try{return await lerConversasVistas();}catch{return {};}
          })(),
        ]);
        if (gen !== generation) return;
        if (rawFriends.some(f=>f.status==='accepted'&&!friends.some(n=>n.friendId===f.friendId&&n.status==='accepted'))) clearProfileMediaCache();
        rawFriends = friends;
        if (!presence.error && presence.data) {
          available = true;
          clockOffset = Date.parse(presence.data.serverTime) - Date.now();
          for (const p of presence.data.items as SocialPresence[]) {
            if (!presences[p.user_id] || Date.parse(p.updated_at) >= Date.parse(presences[p.user_id].updated_at)) presences[p.user_id] = p;
          }
        }
        const now = Date.now() + clockOffset;
        // Nenhum lado manda sobre o outro: o local pode estar à frente (leste
        // agora, sem rede) e a conta também (leste no outro aparelho).
        const seen = fundirVistos(seenLocal, seenRemoto);
        set({ contacts,friends: friendsNow(now), groups, received, activity, seen, now, loading: false,
          error: presence.error ? 'Could not update presence. Try again.' : null });
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
    if(gen===generation)set({seen});
    // E depois a conta, para os outros aparelhos saberem. Falhar aqui só
    // deixa a marca por partilhar; o próximo markRead com rede resolve.
    try{await marcarConversaVista(id,timestamp);}catch{/* sem rede, ou SQL por aplicar */}
  },
}));
let accountId='';

/** A lista, o perfil e os cabeçalhos das conversas observam as mesmas entidades. */
export function iniciarSocial(userId: string): () => void {
  const gen = ++generation;
  accountId=userId;clearProfileMediaCache();
  rawFriends = []; presences = {}; available = false; clockOffset = 0; running = null; queued = false;
  useSocial.setState({ contacts:[],friends: [], groups: [], received: [], activity: {}, seen: {}, loading: true, error: null,conversation:null,drafts:{} });
  let debounce: ReturnType<typeof setTimeout>;
  let dirty=false;
  const refresh = () => {
    if(!appEstaVisivel()){dirty=true;return;}
    dirty=false;
    clearTimeout(debounce); debounce = setTimeout(() => void useSocial.getState().refresh(), 100);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_items' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ()=>{useSocial.setState(s=>({profileVersion:s.profileVersion+1}));refresh();})
    .subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
  const tick = setInterval(() => {
    if(!appEstaVisivel())return;
    const now = Date.now() + clockOffset;
    useSocial.setState({ now, friends: friendsNow(now) });
  }, 30000);
  // Realtime é o caminho normal. A consulta periódica é só recuperação de uma
  // quebra silenciosa, por isso dois minutos chegam e evitam duas leituras
  // sociais completas por minuto enquanto nada muda.
  const recovery = setInterval(refresh, 120000);
  const acordar=()=>{
    if(!appEstaVisivel())return;
    const now=Date.now()+clockOffset;
    useSocial.setState({now,friends:friendsNow(now)});
    if(dirty)refresh(); else void useSocial.getState().refresh();
  };
  const app=AppState.addEventListener('change',acordar);
  if(Platform.OS==='web')document.addEventListener('visibilitychange',acordar);
  void useSocial.getState().refresh();
  return () => {
    ++generation; clearTimeout(debounce); clearInterval(tick); clearInterval(recovery);
    app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',acordar);
    accountId='';clearProfileMediaCache();
    void supabase.removeChannel(channel);
    rawFriends = []; presences = {}; available = false; running = null; queued = false;
    useSocial.setState({ contacts:[],friends: [], groups: [], received: [], seen: {}, error: null, loading: true,conversation:null,drafts:{} });
  };
}

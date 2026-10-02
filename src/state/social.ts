import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import { getFriendships, getGrupos, getInboxItems, lerConversasVistas, marcarConversaVista, type Friendship, type ChatGroup, type SharedItem } from '../api/social';
import { getChatsVistos, marcarChatVisto } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { estadoDaPresenca, type SocialPresence } from '../lib/socialPresence';
import { fundirRecebidas, fundirVistos, marcaDasNovas } from '../lib/social';
import { clearProfileMediaCache } from '../lib/profileMedia';
import { getSocialConversations,type PublicProfile } from '../api/profiles';
import { appEstaVisivel, intervaloComAppVisivel } from '../lib/appVisibility';
import { serialRefresh, type InboxSnapshot } from '../lib/inAppNotifications';
import { deveRelerAInbox, TIQUE_DA_INBOX_MS } from '../lib/recuperacaoDaInbox';

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
/** A hora do servidor, pelo desvio medido na leitura da presença. */
export const agoraNoServidor = () => Date.now() + clockOffset;

/**
 * A presença CRUA de um amigo, e quem quer saber quando muda (27/9, "Listen
 * along", `state/seguirAmigo.ts`). A lista dos amigos só mostra a música de
 * quem está online -- e um iPhone a tocar no bolso não conta como online --,
 * mas para SEGUIR alguém interessa a música que ele publica, esteja à frente
 * ou não. E a lista só se redesenha com a app à vista; quem segue precisa de
 * saber também com o ecrã bloqueado.
 */
type OuvinteDaPresenca = (p: SocialPresence) => void;
const ouvintesDaPresenca = new Set<OuvinteDaPresenca>();
export function ouvirPresencas(fn: OuvinteDaPresenca): () => void {
  ouvintesDaPresenca.add(fn);
  return () => { ouvintesDaPresenca.delete(fn); };
}
export function presencaDe(userId: string): SocialPresence | undefined {
  return presences[userId];
}
function guardarPresenca(p: SocialPresence): boolean {
  if (presences[p.user_id] && Date.parse(p.updated_at) < Date.parse(presences[p.user_id].updated_at)) return false;
  presences[p.user_id] = p;
  for (const fn of ouvintesDaPresenca) {
    try { fn(p); } catch { /* um ouvinte partido não cala os outros */ }
  }
  return true;
}
/** Relê só as presenças (um pedido pequeno): a rede de quem segue, se o Realtime calar. */
export async function relerPresencas(): Promise<void> {
  const presence = await supabase.rpc('get_social_presence');
  if (presence.error || !presence.data) return;
  available = true;
  clockOffset = Date.parse(presence.data.serverTime) - Date.now();
  for (const p of presence.data.items as SocialPresence[]) guardarPresenca(p);
}
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
          for (const p of presence.data.items as SocialPresence[]) guardarPresenca(p);
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
// The Windows taskbar needs a fresh inbox even while the main window is hidden.
const canReadInbox = () => appEstaVisivel() || (Platform.OS === 'web' && !!window.duotoneDesktop);
/** Tiques da recuperação desde a última leitura da inbox, viesse ela de onde viesse. */
let tiquesDaInbox = 0;
/**
 * A inbox lê-se às NOVAS (27/9, `marcaDasNovas` em lib/social.ts). Inteira só
 * ao entrar, de dez em dez minutos, e quando uma mensagem é apagada ou
 * arquivada ou uma amizade muda -- o que as novas não apanham.
 */
let inboxInteiraPedida = true;
let ultimaInboxInteira = 0;
const INBOX_INTEIRA_MS = 10 * 60 * 1000;
/** Voltar à app com o Realtime ligado relê no máximo uma vez neste tempo. */
const RELER_AO_VOLTAR_MS = 60 * 1000;

/** Messages and requests must not wait for presence, groups or profile queries.
 * Both the Social UI and notifications observe this same successful snapshot. */
function createInboxRefresh(userId: string, gen: number) {
  return serialRefresh(async () => {
    if (gen !== generation || !canReadInbox()) return;
    tiquesDaInbox = 0;
    const atual = useSocial.getState();
    const base = atual.inboxSnapshot?.accountId === userId ? atual.received : null;
    const inteira = !base || inboxInteiraPedida || Date.now() - ultimaInboxInteira >= INBOX_INTEIRA_MS;
    // Pedida ANTES de ler: um aviso que chegue durante a leitura volta a pedi-la.
    inboxInteiraPedida = false;
    const [inbox, friendships, local, remote] = await Promise.allSettled([
      getInboxItems(inteira || !base ? null : marcaDasNovas(base)),
      // Os pedidos de amizade chegam por aviso, e esse pede a leitura inteira.
      inteira ? getFriendships() : Promise.resolve(null),
      getChatsVistos(userId), lerConversasVistas(),
    ]);
    if (gen !== generation) return;
    const seen = fundirVistos(useSocial.getState().seen, fundirVistos(
      local.status === 'fulfilled' ? local.value : {}, remote.status === 'fulfilled' ? remote.value : {}));
    const snapshot: InboxSnapshot = {accountId:userId};
    if (inbox.status === 'fulfilled') {
      snapshot.received = inteira || !base ? inbox.value : fundirRecebidas(base, inbox.value);
      if (inteira) ultimaInboxInteira = Date.now();
    } else if (inteira) {
      inboxInteiraPedida = true;
    }
    const amizades = friendships.status === 'fulfilled' ? friendships.value : null;
    if (amizades) {
      snapshot.friends = amizades;
      if (rawFriends.some(f => f.status === 'accepted' && !amizades.some(n => n.friendId === f.friendId && n.status === 'accepted'))) clearProfileMediaCache();
      rawFriends = amizades;
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
    if (!canReadInbox()) { dirty=true; return; }
    // refresh() já inclui a inbox, em paralelo com os metadados. Pedir também
    // inboxRefresh() fazia duas leituras da mesma inbox por aviso/ligação.
    if (appEstaVisivel()) {
      dirty = false;
      clearTimeout(debounce);
      void useSocial.getState().refresh();
    } else {
      dirty = true;
      void inboxRefresh();
    }
  };
  /** O canal está `SUBSCRIBED`: as mensagens novas chegam por ele. */
  let aoVivo = false;
  tiquesDaInbox = 0;
  inboxInteiraPedida = true;
  ultimaInboxInteira = 0;
  // Uma mensagem nova lê-se às novas; apagada, arquivada ou uma amizade mudada,
  // só a leitura inteira a apanha.
  const aoMudarMensagens = (evento?: { eventType?: string }) => {
    if (evento?.eventType !== 'INSERT') inboxInteiraPedida = true;
    refreshMessages();
  };
  const aoMudarAmizades = () => { inboxInteiraPedida = true; refreshMessages(); };
  // O canal é largado com o iPhone em segundo plano (1/10): com o ecrã
  // desligado, cada batimento de cada amigo online (de minuto a minuto) chegava
  // por aqui, acordava a rede e a app, e ia para o `dirty` sem ninguém o ver.
  // Ao voltar à frente liga-se outra vez e o `SUBSCRIBED` relê o que mudou. Fica
  // ligado enquanto alguém ouve as presenças cruas (seguir um amigo), e no PC
  // sempre: a barra de tarefas avisa das mensagens com a janela escondida.
  let channel: ReturnType<typeof supabase.channel> | null = null;
  const ligarCanal = () => supabase.channel(`social:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'social_presence' }, (event) => {
      if (gen !== generation) return;
      const p = event.new as SocialPresence;
      if (p.user_id && guardarPresenca(p)) {
        if(appEstaVisivel())useSocial.setState({ friends: friendsNow(Date.now() + clockOffset) });
        else dirty=true;
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, aoMudarAmizades)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_items' }, aoMudarMensagens)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ()=>{useSocial.setState(s=>({profileVersion:s.profileVersion+1}));refresh();})
    .subscribe((status) => { aoVivo = status === 'SUBSCRIBED'; if (aoVivo) refreshMessages(); });
  channel = ligarCanal();
  // A saída do canal ainda a meio: o `supabase.channel` devolve o canal que
  // ainda lá está com o mesmo nome, e ligá-lo outra vez antes de ele sair dava
  // ouvintes em dobro. Volta-se a ligar só depois.
  let aSair: Promise<unknown> = Promise.resolve();
  const pousarCanal = (estado: string) => {
    if (Platform.OS === 'web' || gen !== generation) return;
    if (estado === 'background' && channel && ouvintesDaPresenca.size === 0) {
      const largado = channel;
      channel = null;
      aoVivo = false;
      aSair = supabase.removeChannel(largado).catch(() => {});
    } else if (estado === 'active' && !channel) {
      void aSair.then(() => {
        if (gen === generation && !channel && AppState.currentState === 'active') channel = ligarCanal();
      });
    }
  };
  const pararTick = intervaloComAppVisivel(() => {
    const now = Date.now() + clockOffset;
    useSocial.setState({ now, friends: friendsNow(now) });
  }, 30000);
  // Realtime é o caminho normal. A consulta periódica é só recuperação de uma
  // quebra silenciosa: de dois em dois minutos sem ele, de dez em dez com ele
  // (27/9: cada uma relê também a inbox inteira, e um PC com a janela à vista
  // fazia isto o dia todo).
  let voltasAoVivo = 0;
  const pararRecovery = intervaloComAppVisivel(() => {
    if (aoVivo && ++voltasAoVivo % 5 !== 0) return;
    refresh();
  }, 120000);
  // Só a rede para quando o Realtime cai: de minuto a minuto sem ele, de cinco
  // em cinco com ele e a app à frente, e nunca com ele e a app escondida
  // (lib/recuperacaoDaInbox.ts). Era de 15 em 15 s, também no tabuleiro do PC.
  const recuperarInbox = () => {
    tiquesDaInbox++;
    if (deveRelerAInbox({ aoVivo, visivel: appEstaVisivel(), podeLer: canReadInbox(), tiques: tiquesDaInbox })) {
      void inboxRefresh();
    }
  };
  // O PC precisa da inbox escondida para a barra de tarefas; o iPhone não.
  const pararInboxRecovery = Platform.OS === 'web'
    ? (() => { const t = setInterval(recuperarInbox, TIQUE_DA_INBOX_MS); return () => clearInterval(t); })()
    : intervaloComAppVisivel(recuperarInbox, TIQUE_DA_INBOX_MS);
  // Voltar à app relê tudo (inbox, amigos, grupos, presença: ~6 pedidos), mas
  // com o Realtime ligado no máximo uma vez por minuto (2/10): no iPhone, puxar o
  // Centro de Controlo ou uma notificação é sair e voltar, e no PC cada restauro
  // da janela -- e com o canal ligado nada se perdeu entretanto. Sem ele (o
  // iPhone larga-o em segundo plano) relê sempre.
  let releuAoVoltarEm = 0;
  const acordar=(estado?: unknown)=>{
    if (typeof estado === 'string') pousarCanal(estado);
    if(!appEstaVisivel())return;
    const now=Date.now()+clockOffset;
    useSocial.setState({now,friends:friendsNow(now)});
    if (aoVivo && !dirty && Date.now() - releuAoVoltarEm < RELER_AO_VOLTAR_MS) return;
    releuAoVoltarEm = Date.now();
    if(dirty)refresh(); else void useSocial.getState().refresh();
  };
  const app=AppState.addEventListener('change',acordar);
  if(Platform.OS==='web')document.addEventListener('visibilitychange',acordar);
  void useSocial.getState().refresh();
  return () => {
    ++generation; clearTimeout(debounce); pararTick(); pararRecovery(); pararInboxRecovery();
    app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',acordar);
    accountId='';refreshInbox=async()=>{};clearProfileMediaCache();
    if (channel) void supabase.removeChannel(channel);
    channel = null;
    rawFriends = []; presences = {}; available = false; running = null; queued = false;
    useSocial.setState({ inboxSnapshot:null,inboxError:false,contacts:[],friends: [], groups: [], received: [], seen: {}, error: null, loading: true,conversation:null,drafts:{} });
  };
}

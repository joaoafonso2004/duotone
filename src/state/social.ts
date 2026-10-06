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
import { getConversationPreviews } from '../api/conversationPreviews';
import { musicActivity, mergePreviews, previewOf, receivedPreviews, type MusicActivity, type ConversationPreview } from '../lib/socialActivity';

export type SocialFriend = Friendship & { musicActivity?: MusicActivity | null };

interface SocialState {
  inboxSnapshot: InboxSnapshot | null;
  inboxError: boolean;
  profileVersion: number;
  contacts:PublicProfile[];
  conversation: {kind:'friend'|'group';id:string}|null;
  drafts: Record<string,string>;
  friends: SocialFriend[];
  groups: ChatGroup[];
  received: SharedItem[];
  /** Última mensagem de cada conversa, nas duas direções, para a ordenar. */
  activity: Record<string, number>;
  conversationPreviews: Record<string, ConversationPreview>;
  rememberConversation: (key: string, messages: readonly SharedItem[]) => void;
  seen: Record<string, string>;
  loading: boolean;
  error: string | null;
  now: number;
  /** `tudo` (o de quem chama à mão) relê também os grupos e os contactos. */
  refresh: (tudo?: boolean) => Promise<void>;
  markRead: (id: string, timestamp: string) => Promise<void>;
}
let generation = 0;
let running: Promise<void> | null = null;
let queued = false;

/**
 * Os pedidos do Social (6/10). Eram o que mais enchia os logs do Supabase
 * (num dia: 1,5 mil get_public_profiles, 977 chat_group_members, 805
 * chat_reads, 486 chat_groups). Cada atualização relia TUDO, uns dez pedidos,
 * e havia atualizações a mais: duas a cada regresso à app no iPhone (o
 * regresso e o canal a ligar), uma por cada mensagem enviada ou recebida, e no
 * PC uma a cada vez que a janela voltava -- um amigo a publicar a presença
 * (de 75 em 75 s) marcava-a como "por atualizar".
 *
 * Agora os grupos e os contactos ("fixos") leem-se no máximo de 30 em 30 min,
 * ou quando alguém os pede (à mão, uma amizade ou um perfil que mudou, uma
 * mensagem de um grupo ou de uma pessoa que ainda não se conhece); a presença
 * só sem o canal ou passados 5 min (com ele chega pelo Realtime).
 */
const FIXOS_MS = 30 * 60_000;
const PRESENCA_MS = 5 * 60_000;
/** O canal a ligar logo depois de uma atualização: só falta o que chegou entre as duas. */
const LIGOU_LOGO_A_SEGUIR_MS = 15_000;
let fixosPedidos = true;
let fixosLidosEm = 0;
let presencaLidaEm = 0;
let ultimaAtualizacaoEm = 0;
/** O canal do Social está `SUBSCRIBED`. */
let canalAoVivo = false;
/** Grupos e pessoas que já levaram a uma releitura dos fixos (não se repete por elas). */
const jaProcurados = new Set<string>();
/** A marca de leitura de cada conversa já enviada à conta (não se reenvia a mesma). */
let marcasNaConta: Record<string, string> = {};

/** Grupos e remetentes das mensagens que a lista ainda não conhece. */
function desconhecidos(recebidas: readonly SharedItem[], grupos: readonly ChatGroup[], contactos: readonly PublicProfile[]): string[] {
  const ids = new Set<string>();
  for (const m of recebidas) {
    const id = m.groupId ?? m.sender.id;
    if (!id || jaProcurados.has(id)) continue;
    const conhecido = m.groupId
      ? grupos.some((g) => g.id === m.groupId)
      : rawFriends.some((f) => f.friendId === m.sender.id) || contactos.some((c) => c.id === m.sender.id);
    if (!conhecido) ids.add(id);
  }
  return [...ids];
}

/** A ordem das conversas sai da `activity`: cada pré-visualização puxa a sua para a data dela. */
function actividadeCom(activity: Record<string, number>, previews: Readonly<Record<string, ConversationPreview>>): Record<string, number> {
  let nova = activity;
  for (const [key, p] of Object.entries(previews)) {
    const id = key.replace(/^group:/, '');
    const at = Date.parse(p.createdAt);
    if (!Number.isFinite(at) || at <= (nova[id] ?? 0)) continue;
    if (nova === activity) nova = { ...activity };
    nova[id] = at;
  }
  return nova;
}
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
  return { ...friend, online: state.online, lastSeenAt: state.lastSeenAt ?? friend.lastSeenAt, currentlyPlaying: state.track,
    musicActivity: musicActivity(presences[friend.friendId], now) };
});

export const useSocial = create<SocialState>((set, get) => ({
  inboxSnapshot:null,inboxError:false,contacts:[],profileVersion:0,conversation:null,drafts:{},
  friends: [], groups: [], received: [], activity: {}, conversationPreviews: {}, seen: {}, loading: true, error: null, now: Date.now(),
  rememberConversation: (key, messages) => {
    const latest = messages.reduce<SharedItem | null>((last, item) =>
      !last || Date.parse(item.createdAt) > Date.parse(last.createdAt) ? item : last, null);
    if (!latest) return;
    const preview = previewOf(latest);
    set(s => ({ conversationPreviews: mergePreviews(s.conversationPreviews, { [key]: preview }),
      activity: { ...s.activity, [key.replace(/^group:/, '')]: Math.max(s.activity[key.replace(/^group:/, '')] ?? 0, Date.parse(preview.createdAt)) } }));
  },
  refresh: (tudo = true) => {
    if (tudo) fixosPedidos = true;
    if (running) { queued = true; return running; }
    const gen = generation;
    const beganAt = agoraNoServidor();
    ultimaAtualizacaoEm = Date.now();
    const lerFixos = fixosPedidos || Date.now() - fixosLidosEm >= FIXOS_MS;
    const lerPresenca = lerFixos || !canalAoVivo || Date.now() - presencaLidaEm >= PRESENCA_MS;
    fixosPedidos = false;
    const job = async () => {
      try {
        const [, gruposLidos, presence, contactosLidos, conversations] = await Promise.all([
          refreshInbox(),
          lerFixos ? getGrupos() : null,
          lerPresenca ? supabase.rpc('get_social_presence') : null,
          lerFixos ? getSocialConversations() : null,
          getConversationPreviews().catch(() => ({ activity: get().activity, previews: {}, complete: false })),
        ]);
        if (gen !== generation) return;
        let groups = gruposLidos ?? get().groups, contacts = contactosLidos ?? get().contacts;
        if (lerFixos) fixosLidosEm = Date.now();
        // Uma mensagem de um grupo novo, ou de alguém que a lista ainda não
        // tem: sem os fixos, a conversa não aparecia.
        const faltam = lerFixos ? [] : desconhecidos(get().received, groups, contacts);
        if (faltam.length) {
          for (const id of faltam) jaProcurados.add(id);
          [groups, contacts] = await Promise.all([getGrupos(), getSocialConversations()]);
          if (gen !== generation) return;
          fixosLidosEm = Date.now();
        }
        if (presence && !presence.error && presence.data) {
          available = true;
          presencaLidaEm = Date.now();
          clockOffset = Date.parse(presence.data.serverTime) - Date.now();
          for (const p of presence.data.items as SocialPresence[]) guardarPresenca(p);
        }
        const now = Date.now() + clockOffset;
        const recent = Object.fromEntries(Object.entries(get().conversationPreviews)
          .filter(([, p]) => !conversations.complete || Date.parse(p.createdAt) >= beganAt));
        const previews = mergePreviews(conversations.previews,
          mergePreviews(receivedPreviews(get().received), recent));
        const activity = { ...conversations.activity };
        for (const [key, p] of Object.entries(previews)) {
          const id = key.replace(/^group:/, '');
          activity[id] = Math.max(activity[id] ?? 0, Date.parse(p.createdAt));
        }
        set({ contacts,friends: friendsNow(now), groups, activity, conversationPreviews: previews, now, loading: false,
          error: get().inboxError ? INBOX_ERROR : presence?.error ? 'Could not update presence. Try again.' : null });
      } catch (e) {
        // Os fixos que falharam ficam pedidos para a próxima.
        if (lerFixos) fixosPedidos = true;
        if (gen === generation) set({ loading: false, error: 'Could not refresh Social. What you see may be out of date.' });
        console.warn('Erro ao atualizar o Social:', e);
      }
    };
    running = job().finally(() => {
      if (gen !== generation) return;
      running = null;
      // Um pedido com `tudo` durante esta deixou os fixos pedidos.
      if (queued) { queued = false; void get().refresh(false); }
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
    // Cada carga da conversa aberta chamava isto com a mesma mensagem, e cada
    // vez era um upsert ao `chat_reads` (6/10): só se manda uma marca mais nova.
    const naConta=Date.parse(marcasNaConta[id]??'');
    if(Number.isFinite(naConta)&&naConta>=Date.parse(timestamp))return;
    try{await marcarConversaVista(id,timestamp);marcasNaConta={...marcasNaConta,[id]:timestamp};}catch{/* sem rede, ou SQL por aplicar */}
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
 * ao entrar, de dez em dez minutos (de trinta em trinta com o canal ligado:
 * as apagadas, as arquivadas e as amizades chegam por ele), e quando uma
 * mensagem é apagada ou arquivada ou uma amizade muda -- o que as novas não
 * apanham.
 */
let inboxInteiraPedida = true;
let ultimaInboxInteira = 0;
const INBOX_INTEIRA_MS = 10 * 60 * 1000;
const INBOX_INTEIRA_AO_VIVO_MS = 30 * 60 * 1000;
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
    const inteira = !base || inboxInteiraPedida
      || Date.now() - ultimaInboxInteira >= (canalAoVivo ? INBOX_INTEIRA_AO_VIVO_MS : INBOX_INTEIRA_MS);
    // Pedida ANTES de ler: um aviso que chegue durante a leitura volta a pedi-la.
    inboxInteiraPedida = false;
    const [inbox, friendships, local, remote] = await Promise.allSettled([
      getInboxItems(inteira || !base ? null : marcaDasNovas(base)),
      // Os pedidos de amizade chegam por aviso, e esse pede a leitura inteira.
      inteira ? getFriendships() : Promise.resolve(null),
      getChatsVistos(userId), lerConversasVistas(),
    ]);
    if (gen !== generation) return;
    if (remote.status === 'fulfilled') marcasNaConta = fundirVistos(marcasNaConta, remote.value);
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
      if (rawFriends.some(f => f.status === 'accepted' && !amizades.some(n => n.friendId === f.friendId && n.status === 'accepted'))) clearProfileMediaCache(true);
      rawFriends = amizades;
    }
    const inboxError = inbox.status === 'rejected' || friendships.status === 'rejected';
    // A `activity` também, e não só as pré-visualizações: uma mensagem nova já
    // não passa por uma atualização inteira, e é por ela que a lista se ordena.
    const previews = snapshot.received
      ? mergePreviews(useSocial.getState().conversationPreviews, receivedPreviews(snapshot.received)) : null;
    useSocial.setState({inboxError, error:inboxError ? INBOX_ERROR : useSocial.getState().error === INBOX_ERROR ? null : useSocial.getState().error, seen, friends:friendsNow(Date.now()+clockOffset),
      ...(snapshot.received && previews ? {received:snapshot.received, conversationPreviews: previews,
        activity: actividadeCom(useSocial.getState().activity, previews)} : {}), inboxSnapshot:snapshot});
  });
}


/** A lista, o perfil e os cabeçalhos das conversas observam as mesmas entidades. */
export function iniciarSocial(userId: string): () => void {
  const gen = ++generation;
  accountId=userId;clearProfileMediaCache();
  refreshInbox=createInboxRefresh(userId,gen);
  const inboxRefresh=refreshInbox;
  rawFriends = []; presences = {}; available = false; clockOffset = 0; running = null; queued = false;
  fixosPedidos = true; fixosLidosEm = 0; presencaLidaEm = 0; ultimaAtualizacaoEm = 0; canalAoVivo = false;
  jaProcurados.clear(); marcasNaConta = {};
  useSocial.setState({ inboxSnapshot:null,inboxError:false,contacts:[],friends: [], groups: [], received: [], activity: {}, conversationPreviews: {}, seen: {}, loading: true, error: null,conversation:null,drafts:{} });
  let debounce: ReturnType<typeof setTimeout>;
  let dirty=false;
  /** As automáticas não releem os fixos (ver `FIXOS_MS`); `tudo` pede-os. */
  const refresh = (tudo = false) => {
    if (tudo) fixosPedidos = true;
    if(!appEstaVisivel()){dirty=true;return;}
    dirty=false;
    clearTimeout(debounce); debounce = setTimeout(() => void useSocial.getState().refresh(false), 100);
  };
  const refreshMessages = () => {
    if (gen !== generation) return;
    if (!canReadInbox()) { dirty=true; return; }
    // refresh() já inclui a inbox, em paralelo com os metadados. Pedir também
    // inboxRefresh() fazia duas leituras da mesma inbox por aviso/ligação.
    if (appEstaVisivel()) {
      dirty = false;
      clearTimeout(debounce);
      debounce = setTimeout(() => { if (gen === generation) void useSocial.getState().refresh(false); }, 100);
    } else {
      dirty = true;
      void inboxRefresh();
    }
  };
  /** O canal está `SUBSCRIBED`: as mensagens novas chegam por ele. */
  let aoVivo = false;
  const marcarAoVivo = (ligado: boolean) => { aoVivo = ligado; canalAoVivo = ligado; };
  tiquesDaInbox = 0;
  inboxInteiraPedida = true;
  ultimaInboxInteira = 0;
  // Uma mensagem nova lê-se às novas; apagada, arquivada ou uma amizade mudada,
  // só a leitura inteira a apanha.
  const aoMudarMensagens = (evento?: { eventType?: string }) => {
    if (evento?.eventType !== 'INSERT') inboxInteiraPedida = true;
    refreshMessages();
  };
  const aoMudarAmizades = () => { inboxInteiraPedida = true; fixosPedidos = true; refreshMessages(); };
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
      // Escondida, a presença fica guardada e a lista refaz-se ao voltar
      // (`acordar`), sem ir à rede: marcava o `dirty`, e no PC cada regresso
      // da janela era uma atualização inteira (6/10).
      if (p.user_id && guardarPresenca(p) && appEstaVisivel()) {
        useSocial.setState({ friends: friendsNow(Date.now() + clockOffset) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, aoMudarAmizades)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_items' }, aoMudarMensagens)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ()=>{useSocial.setState(s=>({profileVersion:s.profileVersion+1}));refresh(true);})
    .subscribe((status) => {
      if (gen !== generation) return;
      marcarAoVivo(status === 'SUBSCRIBED');
      if (!aoVivo) return;
      // Ligou logo a seguir a uma atualização (o arranque, o regresso à app):
      // só falta o que chegou entre ela e o canal. Eram duas inteiras seguidas.
      if (Date.now() - ultimaAtualizacaoEm < LIGOU_LOGO_A_SEGUIR_MS) { if (canReadInbox()) void inboxRefresh(); }
      else refreshMessages();
    });
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
      marcarAoVivo(false);
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
  // quebra silenciosa: de dois em dois minutos sem ele, de trinta em trinta com
  // ele (era de dez em dez; 27/9 e 6/10: um PC com a janela à vista fazia isto
  // o dia todo).
  let voltasAoVivo = 0;
  const pararRecovery = intervaloComAppVisivel(() => {
    if (aoVivo && ++voltasAoVivo % 15 !== 0) return;
    refresh();
  }, 120000);
  // Só a rede para quando o Realtime cai: de minuto a minuto sem ele, de quinze
  // em quinze com ele e a app à frente, e nunca com ele e a app escondida
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
  // Voltar à app relê a inbox, as pré-visualizações e, sem o canal, a presença
  // (os grupos e os contactos só passados 30 min), mas com o Realtime ligado no
  // máximo uma vez por minuto (2/10): no iPhone, puxar o Centro de Controlo ou
  // uma notificação é sair e voltar, e no PC cada restauro da janela -- e com o
  // canal ligado nada se perdeu entretanto. Sem ele (o iPhone larga-o em
  // segundo plano) relê sempre.
  let releuAoVoltarEm = 0;
  const acordar=(estado?: unknown)=>{
    if (typeof estado === 'string') pousarCanal(estado);
    if(!appEstaVisivel())return;
    const now=Date.now()+clockOffset;
    useSocial.setState({now,friends:friendsNow(now)});
    if (aoVivo && !dirty && Date.now() - releuAoVoltarEm < RELER_AO_VOLTAR_MS) return;
    releuAoVoltarEm = Date.now();
    if(dirty)refresh(); else void useSocial.getState().refresh(false);
  };
  const app=AppState.addEventListener('change',acordar);
  if(Platform.OS==='web')document.addEventListener('visibilitychange',acordar);
  void useSocial.getState().refresh();
  return () => {
    ++generation; clearTimeout(debounce); pararTick(); pararRecovery(); pararInboxRecovery();
    app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',acordar);
    accountId='';refreshInbox=async()=>{};clearProfileMediaCache(true);
    if (channel) void supabase.removeChannel(channel);
    channel = null;
    rawFriends = []; presences = {}; available = false; running = null; queued = false; canalAoVivo = false;
    useSocial.setState({ inboxSnapshot:null,inboxError:false,contacts:[],friends: [], groups: [], received: [], activity: {}, conversationPreviews: {}, seen: {}, error: null, loading: true,conversation:null,drafts:{} });
  };
}

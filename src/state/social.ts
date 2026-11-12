import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import { getFriendships, getGrupos, getInboxItems, lerConversasVistas, marcarConversaVista, type Friendship, type ChatGroup, type SharedItem } from '../api/social';
import { getChatsVistos, marcarChatVisto } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { estadoDaPresenca, type SocialPresence } from '../lib/socialPresence';
import { ouvirPresencasAoVivo, presencaDoEstado } from '../lib/presencaAoVivo';
import { fundirRecebidas, fundirVistos, marcaDasNovas } from '../lib/social';
import { clearProfileMediaCache } from '../lib/profileMedia';
import { esquecerPerfisPublicos, getSocialConversations,type PublicProfile } from '../api/profiles';
import { appEstaVisivel, intervaloComAppVisivel } from '../lib/appVisibility';
import { serialRefresh, type InboxSnapshot } from '../lib/inAppNotifications';
import { deveRelerAInbox, TIQUE_DA_INBOX_MS } from '../lib/recuperacaoDaInbox';
import { getConversationPreviews } from '../api/conversationPreviews';
import { useConnectivity } from './connectivity';
import { verificarMudancas } from '../lib/oQueMudou';
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
/**
 * Os canais da presença dos amigos (11/11, `lib/presencaAoVivo.ts`): o que lá
 * chega é mais fresco do que a tabela e entra por cima dela (`forcar`). Quem
 * nunca aparece no canal (uma versão antiga) fica pela tabela.
 */
let presencasAoVivo: ReturnType<typeof ouvirPresencasAoVivo> | null = null;
const atualizarCanaisDosAmigos = () =>
  presencasAoVivo?.atualizar(rawFriends.filter((f) => f.status === 'accepted').map((f) => f.friendId));
function guardarPresenca(p: SocialPresence, forcar = false): boolean {
  if (!forcar && presences[p.user_id] && Date.parse(p.updated_at) < Date.parse(presences[p.user_id].updated_at)) return false;
  presences[p.user_id] = p;
  for (const fn of ouvintesDaPresenca) {
    try { fn(p); } catch { /* um ouvinte partido não cala os outros */ }
  }
  return true;
}
/** Relê só as presenças (um pedido pequeno): a rede de quem segue, se o Realtime calar. */
export async function relerPresencas(): Promise<void> {
  const gen = generation;
  const presence = await supabase.rpc('get_social_presence');
  if (gen !== generation || presence.error || !presence.data) return;
  available = true;
  presencaLidaEm = Date.now();
  clockOffset = Date.parse(presence.data.serverTime) - Date.now();
  for (const p of presence.data.items as SocialPresence[]) guardarPresenca(p);
  const now = agoraNoServidor();
  useSocial.setState({ now, friends: friendsNow(now) });
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
          error: get().inboxError ? INBOX_ERROR : presence?.error ? "Couldn't update presence. Try again." : null });
      } catch (e) {
        // Os fixos que falharam ficam pedidos para a próxima.
        if (lerFixos) fixosPedidos = true;
        // Sem rede não é um erro: fica a lista que havia (10/11).
        if (gen === generation) set({ loading: false, error: useConnectivity.getState().offline ? null : "Couldn't refresh Social. What you see may be out of date." });
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
const INBOX_ERROR = "Couldn't update messages or friend requests. Retrying while the app is open.";
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
      atualizarCanaisDosAmigos();
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


/**
 * A última lista do Social NO APARELHO (10/11), para abrir sem rede: os amigos,
 * os grupos, as conversas e as mensagens recebidas mais recentes. Sem ela, abrir
 * a app no comboio mostrava o Social vazio. Com rede, a leitura nova vem por
 * cima, como sempre; a cópia só entra se a lista ainda estiver vazia.
 */
const COPIA_DO_SOCIAL = (userId: string) => `duotone:social:${userId}`;
/** Pedido só quando é preciso: os testes que carregam esta loja não o conhecem. */
const armazenamento = () => import('@react-native-async-storage/async-storage').then((m) => m.default);
/** Recebidas guardadas: as mais recentes chegam para a lista e para os não lidos. */
const RECEBIDAS_NA_COPIA = 150;

async function lerCopiaDoSocial(userId: string, gen: number): Promise<void> {
  try {
    const texto = await (await armazenamento()).getItem(COPIA_DO_SOCIAL(userId));
    if (!texto || gen !== generation) return;
    const s = useSocial.getState();
    if (s.friends.length || s.groups.length || Object.keys(s.conversationPreviews).length) return;
    const c = JSON.parse(texto);
    if (Array.isArray(c.amizades) && !rawFriends.length) { rawFriends = c.amizades; atualizarCanaisDosAmigos(); }
    useSocial.setState({
      friends: friendsNow(Date.now() + clockOffset),
      contacts: Array.isArray(c.contacts) ? c.contacts : [],
      groups: Array.isArray(c.groups) ? c.groups : [],
      received: Array.isArray(c.received) ? c.received : [],
      activity: c.activity && typeof c.activity === 'object' ? c.activity : {},
      conversationPreviews: c.conversationPreviews && typeof c.conversationPreviews === 'object' ? c.conversationPreviews : {},
      loading: false,
    });
  } catch { /* uma cópia partida é como não haver cópia */ }
}

function guardarCopiaDoSocial(userId: string): void {
  const s = useSocial.getState();
  if (!rawFriends.length && !s.groups.length && !Object.keys(s.conversationPreviews).length) return;
  const recebidas = [...s.received].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, RECEBIDAS_NA_COPIA);
  const texto = JSON.stringify({
    amizades: rawFriends, contacts: s.contacts, groups: s.groups, received: recebidas,
    activity: s.activity, conversationPreviews: s.conversationPreviews,
  });
  armazenamento().then((a) => a.setItem(COPIA_DO_SOCIAL(userId), texto)).catch(() => { /* sem espaço: fica a da memória */ });
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
  // A cópia do aparelho entra já (sem rede é tudo o que há); a rede vem por cima.
  void lerCopiaDoSocial(userId, gen);
  // E guarda-se de novo quando a lista muda, com uma folga (a lista muda aos bocados).
  let paraGuardar: ReturnType<typeof setTimeout> | undefined;
  const pararCopia = useSocial.subscribe((s, p) => {
    if (s.friends === p.friends && s.groups === p.groups && s.conversationPreviews === p.conversationPreviews && s.received === p.received) return;
    if (s.loading) return;
    clearTimeout(paraGuardar);
    paraGuardar = setTimeout(() => { if (gen === generation) guardarCopiaDoSocial(userId); }, 3000);
  });
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
  /**
   * Antes de reler ao voltar (11/11): o pedido único "o que mudou?"
   * (`lib/oQueMudou.ts`), partilhado com as outras partes da app. Se nenhuma
   * mensagem, reação, leitura, grupo ou amizade mudou noutro aparelho ou
   * noutra pessoa desde a última leitura, relê-se só a presença dos amigos
   * (sem o canal, ou passados 5 min) -- eram uns seis pedidos a cada
   * desbloqueio do iPhone. Os grupos e contactos continuam de 30 em 30 min.
   * Sem a migração, ou sem rede, relê-se como antes. Uma de cada vez: a
   * segunda espera pela primeira e já vê a marca confirmada.
   */
  let jaLigouOCanal = false;
  let verificacaoEmCurso: Promise<void> = Promise.resolve();
  const verificarELer = async (fresco: boolean, comoAntes?: () => void): Promise<void> => {
    const g = await verificarMudancas(['mensagens', 'amizades'], { fresco });
    if (gen !== generation) return;
    if (!appEstaVisivel()) { if (g.mudou) dirty = true; return; }
    const fixosVelhos = fixosPedidos || Date.now() - fixosLidosEm >= FIXOS_MS;
    if (!g.mudou && !dirty && !fixosVelhos) {
      if (!canalAoVivo || Date.now() - presencaLidaEm >= PRESENCA_MS) void relerPresencas();
      return;
    }
    // O canal a religar: com alguma coisa nova faz o que fazia (só a inbox, se
    // acabou de haver uma atualização), e a marca confirma-se no regresso seguinte.
    if (comoAntes) { comoAntes(); return; }
    dirty = false;
    clearTimeout(debounce);
    await useSocial.getState().refresh(false);
    if (gen === generation && !useSocial.getState().inboxError) g.confirmar();
  };
  const lerSeMudou = (fresco: boolean, comoAntes?: () => void): Promise<void> =>
    (verificacaoEmCurso = verificacaoEmCurso.then(() => verificarELer(fresco, comoAntes)).catch(() => {}));
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
  // A saída do canal ainda a meio: o `supabase.channel` devolve o canal que
  // ainda lá está com o mesmo nome, e ligá-lo outra vez antes de ele sair dava
  // ouvintes em dobro. Volta-se a ligar só depois.
  let aSair: Promise<unknown> = Promise.resolve();
  const topico = `social:${userId}`;
  /**
   * O canal fechado pelo servidor (12/11). O realtime-js tira-o da ligação e
   * nunca mais volta a entrar nele; no iPhone o `pousarCanal` recriava-o ao
   * voltar à frente, mas no PC ficava assim até se fechar a app, com a inbox a
   * ser lida de minuto a minuto (o relatório do PC do João: `realtime: NOT
   * connected, 0/0 channels joined`). Volta-se a ligar aqui, com uma espera que
   * cresce enquanto ele não pega.
   */
  const RELIGAR_MS = [5_000, 30_000, 120_000, 300_000];
  let religar: ReturnType<typeof setTimeout> | null = null;
  let tentativas = 0;
  const agendarReligacao = () => {
    if (religar || gen !== generation) return;
    const espera = RELIGAR_MS[Math.min(tentativas, RELIGAR_MS.length - 1)];
    tentativas++;
    religar = setTimeout(() => {
      religar = null;
      if (gen !== generation) return;
      const velho = channel;
      channel = null;
      marcarAoVivo(false);
      if (velho) aSair = supabase.removeChannel(velho).catch(() => {});
      // O iPhone escondido fica sem canal; o `pousarCanal` liga-o ao voltar.
      if (Platform.OS !== 'web' && AppState.currentState !== 'active') return;
      void aSair.then(() => ligarCanal());
    }, espera);
  };
  /** Liga o canal (e guarda-o em `channel`); não faz nada se já houver um. */
  const ligarCanal = (): void => {
    if (gen !== generation || channel) return;
    // Um canal com o mesmo nome que ainda não saiu (12/11): o `supabase.channel`
    // devolvia-o, e o `subscribe` de um canal que não está fechado não faz
    // nada -- o SUBSCRIBED nunca chegava. Primeiro sai, depois liga-se.
    const restos = (supabase.getChannels?.() ?? []).filter((c) => c.topic === `realtime:${topico}`);
    if (restos.length) {
      aSair = Promise.all(restos.map((c) => supabase.removeChannel(c).catch(() => {})));
      void aSair.then(() => { if (gen === generation && !channel) criarCanal(); });
      return;
    }
    criarCanal();
  };
  const criarCanal = (): void => {
    const este = supabase.channel(topico)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'social_presence' }, (event) => {
      if (gen !== generation) return;
      const p = event.new as SocialPresence;
      // Escondida, a presença fica guardada e a lista refaz-se ao voltar
      // (`acordar`), sem ir à rede: marcava o `dirty`, e no PC cada regresso
      // da janela era uma atualização inteira (6/10).
      if (p.user_id && guardarPresenca(p)) {
        available = true;
        if (appEstaVisivel()) useSocial.setState({ friends: friendsNow(Date.now() + clockOffset) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, aoMudarAmizades)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_items' }, aoMudarMensagens)
    // Um perfil mudou: os nomes e as fotografias guardadas (30 min) esquecem-se antes de reler.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ()=>{esquecerPerfisPublicos();useSocial.setState(s=>({profileVersion:s.profileVersion+1}));refresh(true);});
    // Antes do `subscribe`: um estado que chegue logo já encontra este canal.
    channel = este;
    este.subscribe((status) => {
      // Um canal que já não é o nosso (largado, ou substituído) não muda nada.
      if (gen !== generation || channel !== este) return;
      marcarAoVivo(status === 'SUBSCRIBED');
      if (status === 'CLOSED') { agendarReligacao(); return; }
      if (!aoVivo) return;
      tentativas = 0;
      // O canal a religar depois do arranque (11/11): o regresso à app no
      // iPhone, ou uma quebra de rede. O pedido único "o que mudou?" diz se
      // chegou alguma coisa entre a última leitura e o canal.
      // Ligou logo a seguir a uma atualização (o arranque, o regresso à app):
      // só falta o que chegou entre ela e o canal. Eram duas inteiras seguidas.
      const comoAntes = () => {
        if (Date.now() - ultimaAtualizacaoEm < LIGOU_LOGO_A_SEGUIR_MS) { if (canReadInbox()) void inboxRefresh(); }
        else refreshMessages();
      };
      if (jaLigouOCanal && appEstaVisivel()) { void lerSeMudou(true, comoAntes); return; }
      jaLigouOCanal = true;
      comoAntes();
    });
  };
  ligarCanal();
  // A presença dos amigos pelos canais deles (11/11). Por cima da tabela.
  presencasAoVivo = ouvirPresencasAoVivo((id, estado) => {
    if (gen !== generation) return;
    if (!guardarPresenca(presencaDoEstado(id, estado, agoraNoServidor(), presences[id]), true)) return;
    available = true;
    if (appEstaVisivel()) { const now = agoraNoServidor(); useSocial.setState({ now, friends: friendsNow(now) }); }
  });
  atualizarCanaisDosAmigos();
  const pousarCanal = (estado: string) => {
    if (Platform.OS === 'web' || gen !== generation) return;
    // Os canais da presença dos amigos seguem a mesma regra: sem ninguém a
    // seguir, largam-se com o iPhone escondido e voltam ao voltar (11/11).
    if (estado === 'background' && ouvintesDaPresenca.size === 0) presencasAoVivo?.pausar();
    else if (estado === 'active') presencasAoVivo?.retomar();
    if (estado === 'background' && channel && ouvintesDaPresenca.size === 0) {
      const largado = channel;
      channel = null;
      marcarAoVivo(false);
      aSair = supabase.removeChannel(largado).catch(() => {});
    } else if (estado === 'active' && !channel) {
      void aSair.then(() => {
        if (gen === generation && !channel && AppState.currentState === 'active') ligarCanal();
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
    // O canal que desapareceu sem o CLOSED chegar (12/11): fora da ligação, ou
    // nenhum no PC (no iPhone à frente o `pousarCanal` já o ligou).
    if (!aoVivo && !religar && Platform.OS === 'web') {
      const ligados = supabase.getChannels?.();
      if (!channel) ligarCanal();
      else if (ligados && !ligados.includes(channel)) agendarReligacao();
    }
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
    void lerSeMudou(false);
  };
  const app=AppState.addEventListener('change',acordar);
  if(Platform.OS==='web')document.addEventListener('visibilitychange',acordar);
  void useSocial.getState().refresh();
  return () => {
    pararCopia(); clearTimeout(paraGuardar);
    // Só se para ao trocar de conta (App.tsx): a cópia de quem sai vai com ele.
    armazenamento().then((a) => a.removeItem(COPIA_DO_SOCIAL(userId))).catch(() => {});
    ++generation; clearTimeout(debounce); pararTick(); pararRecovery(); pararInboxRecovery();
    app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',acordar);
    accountId='';refreshInbox=async()=>{};clearProfileMediaCache(true);
    if (religar) clearTimeout(religar);
    religar = null;
    if (channel) void supabase.removeChannel(channel);
    channel = null;
    presencasAoVivo?.parar();
    presencasAoVivo = null;
    rawFriends = []; presences = {}; available = false; running = null; queued = false; canalAoVivo = false;
    useSocial.setState({ inboxSnapshot:null,inboxError:false,contacts:[],friends: [], groups: [], received: [], activity: {}, conversationPreviews: {}, seen: {}, error: null, loading: true,conversation:null,drafts:{} });
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  deleteOwnSession,
  fetchOtherSessions,
  writeSession,
  type SessionSnapshot,
} from '../api/playerSessions';
import { getDeviceId } from './deviceIdentity';
import {
  extrapolatedPositionMs,
  pickHandoffSession,
  saltouNaBarra,
  shouldOfferHandoff,
  SESSION_DEBOUNCE_MS,
  SESSION_HEARTBEAT_MS,
  type LeituraDoEscritor,
  type RemoteSession,
} from './handoff';

import { usePlayer } from '../state/player';
import { appEstaVisivel } from './appVisibility';
import { supabase } from './supabase';

/**
 * O motor do "continuar noutro dispositivo": escreve a sessão deste
 * dispositivo e lê a dos outros.
 *
 * Vive em `lib/` e não em `api/` porque lê a store do player — a camada
 * `api/` só fala com o Supabase.
 */

const POLL_MS = 60_000;

/** Quanto tempo um dispositivo fica silenciado depois de o dispensarmos (ou
 * de lhe assumirmos a reprodução). Ver a nota em `shouldOfferHandoff`: a
 * regra da "mesma faixa" já trata do caso normal; isto é a válvula para
 * quando o outro dispositivo continua mesmo a tocar noutra coisa. */
const DISMISS_MS = 15 * 60 * 1000;
const dismissedUntil = new Map<string, number>();

function isDismissed(deviceId: string, now = Date.now()): boolean {
  const until = dismissedUntil.get(deviceId);
  return typeof until === 'number' && now < until;
}

export function dismissDevice(deviceId: string): void {
  dismissedUntil.set(deviceId, Date.now() + DISMISS_MS);
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

function snapshot(): SessionSnapshot | null {
  const s = usePlayer.getState();
  if (!s.current) return null;
  return {
    track: s.current,
    queue: s.queue.length > 0 ? s.queue : [s.current],
    queueIndex: s.queueIndex,
    positionMs: s.positionMs,
    positionAt: s.positionAt,
    isPlaying: s.isPlaying,
    ritmo: s.playbackRate,
  };
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
/** Quando é que a sessão foi publicada pela última vez. */
let ultimaEscrita = 0;

function clearTimers() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
}

function escrever(): void {
  const snap = snapshot();
  if (!snap) return;
  ultimaEscrita = Date.now();
  void writeSession(snap);
}

/**
 * Agrupa as escritas: saltar cinco faixas dá um pedido, não cinco.
 *
 * Relê a store no fim da espera em vez de guardar o que lhe passaram, para a
 * posição que viaja ser a de então.
 */
export function publishSession(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    escrever();
  }, SESSION_DEBOUNCE_MS);
}

/**
 * O batimento, chamado pelo RELÓGIO DO PLAYER a cada progresso.
 *
 * Era um `setInterval`, e é por isso que não funcionava onde mais fazia
 * falta: no iPhone com o ecrã bloqueado o iOS suspende os temporizadores de
 * JS, e a sessão ficava congelada no instante em que a app foi para trás --
 * com a faixa errada, se entretanto tivesse mudado. O evento de progresso
 * vem do AVPlayer e continua a chegar. (A mesma lição do crossfade, ver
 * src/lib/crossfade.ts.)
 *
 * Barato de chamar a cada segundo: é uma comparação de dois números, e só
 * escreve de 90 em 90 segundos -- ou já, quando a posição salta (ver
 * `saltouNaBarra`): quem lê extrapola, e depois de um salto na barra ficava a
 * mostrar um sítio que já não existia até ao batimento seguinte.
 */
let ultimaLeitura: LeituraDoEscritor | null = null;
export function baterSessao(): void {
  const s = usePlayer.getState();
  const agora = Date.now();
  const leitura = { posicaoMs: s.positionMs, instante: agora, ritmo: s.playbackRate };
  if (s.isPlaying && s.current && saltouNaBarra(ultimaLeitura, leitura)) publishSession();
  ultimaLeitura = s.isPlaying ? leitura : null;
  if (agora - ultimaEscrita < SESSION_HEARTBEAT_MS) return;
  if (!s.isPlaying) return;
  escrever();
}

/** Escrita imediata, sem agrupamento: para ir para segundo plano ou fechar a
 * janela, onde não há tempo para esperar pelo debounce.
 *
 * Ao contrário do `clearPresence` (que APAGA o "a ouvir agora" para os
 * amigos), aqui a sessão é GUARDADA — é precisamente com a app fechada que o
 * outro dispositivo precisa de a encontrar. */
export function publishSessionNow(): void {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  escrever();
}

/** Fechar o player / terminar sessão: já não há nada para continuar.
 *
 * Devolve a promessa porque o `signOut` TEM de a esperar: a política de RLS
 * exige o JWT, e se o signOut chegar primeiro o delete é rejeitado em
 * silêncio e fica uma sessão órfã a oferecer handoff no outro dispositivo. */
export function endSession(): Promise<void> {
  clearTimers();
  return deleteOwnSession();
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Assume a reprodução de outro dispositivo, a partir da posição projetada. */
export async function takeOverSession(session: RemoteSession): Promise<void> {
  const positionMs = extrapolatedPositionMs(session);
  usePlayer.getState().adoptSession({
    track: session.track,
    queue: session.queue.length > 0 ? session.queue : [session.track],
    queueIndex: session.queueIndex,
    positionMs,
  });
  // Silenciar o dispositivo de origem: não conseguimos pausá-lo à distância
  // (o iOS suspende o JS em segundo plano), mas não queremos que o banner
  // volte a insistir por causa da sessão que acabámos de assumir.
  dismissDevice(session.deviceId);
  // E anunciar já que a reprodução passou para cá.
  publishSessionNow();
}

/**
 * A sessão de outro dispositivo que vale a pena oferecer, ou null.
 *
 * **Ao vivo, pelo Realtime.** Era só polling de minuto a minuto, e isso fazia
 * do banner uma fotografia: mudar de faixa, pausar ou saltar na barra no
 * telemóvel levava até um minuto a chegar ao PC. Agora cada escrita do outro
 * aparelho chega como um aviso e relê-se logo. O aviso não traz a idade da
 * amostra medida pelo servidor, por isso não se usa o que ele traz: serve só
 * de "relê agora". O polling fica como rede, para quando o Realtime cai ou a
 * migração ainda não foi corrida -- e continua a recarregar quando a janela
 * volta a ficar ativa.
 */
export function useHandoffSession(): {
  session: RemoteSession | null;
  positionMs: number;
  dismiss: () => void;
  adopt: () => Promise<void>;
} {
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const currentTrack = usePlayer((s) => s.current);
  const aTocarAqui = usePlayer((s) => s.isPlaying && !!s.current);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getDeviceId().then((id) => { if (mounted.current) setMyDeviceId(id); });
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const rows = await fetchOtherSessions();
    if (mounted.current) setSessions(rows);
  }, []);

  useEffect(() => {
    if(appEstaVisivel())void refresh();
    const id = setInterval(() => {
      // Em segundo plano não vale a pena gastar rede: ao voltar a "active"
      // o listener abaixo recarrega de imediato.
      if (appEstaVisivel()) void refresh();
    }, POLL_MS);
    const acordar=()=>{if(appEstaVisivel())void refresh();};
    const sub = AppState.addEventListener('change', acordar);
    if(Platform.OS==='web')document.addEventListener('visibilitychange',acordar);
    return () => { clearInterval(id); sub.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',acordar); };
  }, [refresh]);

  // O Realtime: cada escrita de um aparelho desta conta é um "relê agora".
  // Filtrado pelo utilizador no servidor, e a própria linha deste aparelho
  // também chega -- relê-la custa um pedido pequeno e poupa um filtro que o
  // Realtime não sabe fazer (`neq`). Várias escritas seguidas dão uma leitura.
  useEffect(() => {
    let parado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => { espera = null; if (appEstaVisivel()) void refresh(); }, 400);
    };
    void supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (parado || !uid) return;
      canal = supabase.channel(`player-sessions:${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'player_sessions', filter: `user_id=eq.${uid}` }, agendar)
        .subscribe();
    });
    return () => {
      parado = true;
      if (espera) clearTimeout(espera);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [refresh]);

  const picked = myDeviceId ? pickHandoffSession(sessions, myDeviceId) : null;
  const visible = picked && !isDismissed(picked.deviceId) && shouldOfferHandoff(picked, currentTrack, aTocarAqui)
    ? picked
    : null;

  // Enquanto há banner, um tique por segundo move a barra de progresso (a
  // posição é projetada, não recebida) e faz a sessão desaparecer sozinha
  // quando deixa de ser fresca.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {if(appEstaVisivel())setTick((t) => t + 1);}, 1000);
    return () => clearInterval(id);
  }, [!!visible]);

  const dismiss = useCallback(() => {
    if (picked) {
      dismissDevice(picked.deviceId);
      setTick((t) => t + 1);
    }
  }, [picked?.deviceId]);

  const adopt = useCallback(async () => {
    if (visible) await takeOverSession(visible);
  }, [visible?.deviceId, visible?.track?.sourceId]);

  return {
    session: visible,
    positionMs: visible ? extrapolatedPositionMs(visible) : 0,
    dismiss,
    adopt,
  };
}

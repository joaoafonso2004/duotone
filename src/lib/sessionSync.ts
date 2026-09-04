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
  shouldOfferHandoff,
  SESSION_DEBOUNCE_MS,
  SESSION_HEARTBEAT_MS,
  type RemoteSession,
} from './handoff';
import { usePlayer } from '../state/player';
import { appEstaVisivel } from './appVisibility';

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
    isPlaying: s.isPlaying,
  };
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;

function clearTimers() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
}

/**
 * Agrupa as escritas (saltar cinco faixas dá um pedido, não cinco) e mantém
 * um batimento enquanto toca, para a sessão não expirar a meio de um tema.
 *
 * O batimento relê a store em vez de guardar o que lhe passaram: assim a
 * posição que viaja é a de agora, sem precisar de uma escrita por segundo.
 */
export function publishSession(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const snap = snapshot();
    if (snap) void writeSession(snap);
  }, SESSION_DEBOUNCE_MS);

  if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
  const snap = snapshot();
  if (snap?.isPlaying) {
    beatTimer = setInterval(() => {
      const s = snapshot();
      if (s) void writeSession(s);
    }, SESSION_HEARTBEAT_MS);
  }
}

/** Escrita imediata, sem agrupamento: para ir para segundo plano ou fechar a
 * janela, onde não há tempo para esperar pelo debounce.
 *
 * Ao contrário do `clearPresence` (que APAGA o "a ouvir agora" para os
 * amigos), aqui a sessão é GUARDADA — é precisamente com a app fechada que o
 * outro dispositivo precisa de a encontrar. */
export function publishSessionNow(): void {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  const snap = snapshot();
  if (snap) void writeSession(snap);
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
 * Faz polling em vez de Realtime: é uma peça a menos para partir, e como
 * também recarrega quando a app/janela volta a ficar ativa, o banner aparece
 * assim que abres o PC — que é o único momento em que isto interessa.
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

  const picked = myDeviceId ? pickHandoffSession(sessions, myDeviceId) : null;
  const visible = picked && !isDismissed(picked.deviceId) && shouldOfferHandoff(picked, currentTrack)
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

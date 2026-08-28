import type { Track } from '../types';

/**
 * Regras do "continuar noutro dispositivo" (handoff), partilhadas pelo
 * telemóvel e pelo desktop.
 *
 * Porque é que isto NÃO reutiliza o `profiles.currently_playing`:
 *
 * 1. O `currently_playing` é lido para TODOS os amigos de uma vez
 *    (getFriendships). Meter lá a fila fazia descarregar a fila de toda a
 *    gente só para desenhar a lista de amigos.
 * 2. O `currently_playing` é APAGADO quando a app vai para segundo plano —
 *    de propósito, para os amigos não te verem "a ouvir" com a app fechada.
 *    Mas é exatamente aí que o handoff é preciso: ouves com o ecrã apagado,
 *    abres o PC, e queres encontrar lá o tema. Se partilhassem a mesma
 *    coluna, uma das duas features tinha de ceder.
 *
 * Daí uma tabela própria (`player_sessions`), uma linha por dispositivo.
 */

/** Uma sessão só conta como viva se for recente — mesma defesa que o
 * `livePresence`: nada de estado preso a sobreviver a um processo morto. */
export const SESSION_TTL_MS = 3 * 60 * 1000;

/** Espaçamento entre escritas — impede uma rajada ao saltar faixas. */
export const SESSION_DEBOUNCE_MS = 2500;

/** Batimento enquanto toca: mantém a sessão fresca e a posição recente sem
 * escrever a cada segundo. Tem de ser confortavelmente inferior ao TTL. */
export const SESSION_HEARTBEAT_MS = 45 * 1000;

/** Quantas faixas da fila viajam. A fila inteira podia ter milhares (import
 * de playlist) e isto vai numa coluna jsonb — o que interessa para continuar
 * é o que vem a seguir, mais um bocado de história para o botão "anterior". */
export const QUEUE_SYNC_AHEAD = 80;
export const QUEUE_SYNC_BEHIND = 15;

export type DeviceKind = 'ios' | 'android' | 'desktop' | 'web' | 'unknown';

export interface RemoteSession {
  deviceId: string;
  deviceName: string;
  deviceKind: DeviceKind;
  track: Track;
  queue: Track[];
  queueIndex: number;
  positionMs: number;
  isPlaying: boolean;
  /** ISO. Escrito pelo cliente (como no presence) — ver nota em
   * `extrapolatedPositionMs` sobre desvio de relógios. */
  updatedAt: string;
}

function freshnessMs(session: RemoteSession, now: number): number {
  const at = Date.parse(session.updatedAt ?? '');
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  // Negativo = relógio deste dispositivo atrasado face ao que escreveu;
  // contar como fresco é melhor do que esconder sem motivo.
  return Math.max(0, now - at);
}

export function isSessionFresh(session: RemoteSession, now: number = Date.now()): boolean {
  return freshnessMs(session, now) <= SESSION_TTL_MS;
}

/**
 * Qual das sessões dos outros dispositivos oferecer para handoff.
 *
 * Ignora o próprio dispositivo (senão o PC oferecia-se para continuar aquilo
 * que ele próprio está a tocar), exige frescura, e prefere quem está mesmo a
 * tocar. Entre duas iguais ganha a mais recente.
 */
export function pickHandoffSession(
  sessions: RemoteSession[],
  myDeviceId: string,
  now: number = Date.now()
): RemoteSession | null {
  const candidates = sessions.filter(
    (s) => s.deviceId !== myDeviceId && !!s.track && isSessionFresh(s, now)
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, s) => {
    if (s.isPlaying !== best.isPlaying) return s.isPlaying ? s : best;
    return freshnessMs(s, now) < freshnessMs(best, now) ? s : best;
  });
}

/**
 * Onde a faixa vai neste momento no outro dispositivo.
 *
 * O batimento é de 45s, por isso a posição gravada está sempre atrasada. Em
 * vez de escrever mais vezes, avança-se a posição pelo tempo decorrido desde
 * a escrita — a barra de progresso anda sozinha e as escritas continuam raras.
 *
 * O `updatedAt` vem do relógio de quem escreveu, não do servidor: dois
 * dispositivos da mesma pessoa andam a segundos um do outro e o erro que
 * sobra é de segundos numa música — corrigível com um seek. Trocar isto por
 * tempo de servidor obrigava a um round-trip extra só para saber as horas.
 */
export function extrapolatedPositionMs(
  session: RemoteSession,
  now: number = Date.now()
): number {
  const base = Math.max(0, session.positionMs || 0);
  const durationMs = (session.track?.durationSeconds ?? 0) * 1000;

  // Em pausa a posição está parada: não há nada para extrapolar.
  const elapsed = session.isPlaying
    ? Math.min(freshnessMs(session, now), SESSION_TTL_MS)
    : 0;

  const projected = base + elapsed;
  // O teto do TTL já limita o disparate; o clamp à duração evita pedir um
  // seek para lá do fim quando a sessão morreu no início de um tema curto.
  return durationMs > 0 ? Math.min(projected, durationMs) : projected;
}

/**
 * Recorta a fila para uma janela à volta da faixa atual e devolve o índice
 * corrigido, para o outro dispositivo continuar na faixa certa.
 */
export function trimQueueForSync(
  queue: Track[],
  queueIndex: number,
  ahead: number = QUEUE_SYNC_AHEAD,
  behind: number = QUEUE_SYNC_BEHIND
): { queue: Track[]; queueIndex: number } {
  if (queue.length === 0) return { queue: [], queueIndex: 0 };
  const i = Math.max(0, Math.min(queueIndex, queue.length - 1));
  const start = Math.max(0, i - behind);
  const end = Math.min(queue.length, i + ahead + 1);
  return { queue: queue.slice(start, end), queueIndex: i - start };
}


/**
 * Se vale a pena mostrar o banner de handoff.
 *
 * A regra que mata o incómodo principal: se este dispositivo já está a tocar
 * a MESMA faixa, não há nada para continuar — foi o handoff que acabou de
 * acontecer, ou os dois estão em sincronia. Sem isto o PC ficava a insistir
 * "a tocar no iPhone" durante os minutos em que a sessão do telemóvel ainda
 * está fresca, logo a seguir a assumires a reprodução.
 */
export function shouldOfferHandoff(
  session: RemoteSession | null,
  localTrack: { source: string; sourceId: string } | null | undefined
): boolean {
  if (!session?.track) return false;
  if (
    localTrack &&
    localTrack.source === session.track.source &&
    localTrack.sourceId === session.track.sourceId
  ) {
    return false;
  }
  return true;
}

/** Etiqueta curta para o banner: "iPhone", "PC", ou o nome guardado. */
export function deviceLabel(session: RemoteSession): string {
  const name = (session.deviceName || '').trim();
  if (name) return name;
  return session.deviceKind === 'desktop' ? 'PC' : 'outro dispositivo';
}

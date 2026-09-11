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
 * escrever a cada segundo. Tem de ser confortavelmente inferior ao TTL.
 *
 * Quem o dá é o RELÓGIO DO PLAYER (o evento de progresso), e não um
 * `setInterval`: no iOS com o ecrã bloqueado os temporizadores de JS são
 * suspensos, e era precisamente aí que o batimento fazia falta. Mesma lição
 * que o crossfade aprendeu em src/lib/crossfade.ts. */
export const SESSION_HEARTBEAT_MS = 90 * 1000;

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
  /**
   * ISO, e o instante a que a `positionMs` se refere -- NÃO o instante da
   * escrita. Escrito pelo cliente (como no presence) — ver nota em
   * `extrapolatedPositionMs` sobre desvio de relógios.
   */
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
 * O batimento é de 90s, por isso a posição gravada está sempre atrasada. Em
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
  // A conta só fecha se o `updatedAt` for o instante a que a `positionMs` se
  // refere. Ver `instanteDaAmostra`: era aqui que o bug entrava.
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
 * O carimbo de tempo a publicar com uma posição.
 *
 * **Este é o bug que o handoff tinha, e vale a pena perceber porquê.** O que
 * se escrevia era `new Date()` — o instante da ESCRITA. Mas a posição vinha
 * da store, e a store é atualizada pelo relógio do player. Enquanto os dois
 * andam a par não se nota. Quando não andam, a diferença é o erro:
 *
 *  - no PC com a janela escondida, o Chromium estrangula os temporizadores
 *    (uma vez por minuto depois de cinco minutos escondida) e a posição na
 *    store fica até um minuto atrasada -- mas era escrita com a hora certa,
 *    e o telemóvel mostrava-a como se fosse de agora;
 *  - no iPhone com o ecrã bloqueado é pior: os temporizadores de JS param, e
 *    a última posição publicada podia ser de outra faixa.
 *
 * Publicando o instante da AMOSTRA, a extrapolação volta a fechar sozinha:
 * quem lê soma o tempo que passou desde que aquela posição era verdade, e o
 * atraso do escritor deixa de ter importância nenhuma. De caminho, a
 * frescura passa a querer dizer o que diz -- uma sessão cuja posição não
 * anda há três minutos não é uma sessão fresca.
 */
export function instanteDaAmostra(
  positionAt: number | null | undefined,
  agora: number = Date.now(),
): number {
  if (typeof positionAt !== 'number' || !Number.isFinite(positionAt)) return agora;
  // Nunca no futuro: um carimbo à frente do relógio de quem lê faria a
  // posição recuar (o `freshnessMs` corta os negativos a zero).
  return Math.min(positionAt, agora);
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

/** Etiqueta curta para o banner: o nome guardado, "PC", ou "phone". Em inglês, como a interface. */
export function deviceLabel(session: RemoteSession): string {
  const name = (session.deviceName || '').trim();
  if (name) return name;
  return session.deviceKind === 'desktop' ? 'PC' : 'phone';
}

/**
 * O que vem a seguir na sessão do outro aparelho: a próxima faixa e quantas
 * ficam depois dela.
 *
 * É o que o banner mostra antes de se carregar em "Continue here". Adotar traz
 * a fila inteira, e sem isto só se sabia qual era a faixa atual -- o resto
 * entrava às cegas por cima da fila deste aparelho. Conta a fila tal como
 * viaja (recortada no `trimQueueForSync`), que é exatamente a que se adota.
 */
export function resumoDaFila(
  session: Pick<RemoteSession, 'queue' | 'queueIndex'>,
): { proxima: Track | null; depois: number } {
  const i = Math.max(-1, Math.min(session.queueIndex, session.queue.length - 1));
  const seguintes = session.queue.slice(i + 1);
  return { proxima: seguintes[0] ?? null, depois: Math.max(0, seguintes.length - 1) };
}

import type { Friendship } from '../api/social';

/**
 * Regras de "a ouvir agora", partilhadas pelo telemóvel e pelo desktop.
 *
 * O `currently_playing` é uma coluna no perfil: fica escrito no servidor até
 * alguém o apagar. Se a app fechar sem limpar — processo morto, janela
 * fechada, bateria acabada — o último tema fica lá para sempre, e os amigos
 * viam "Listening to" de alguém que já nem tem a app aberta.
 *
 * A defesa está na LEITURA, não na escrita: um registo só conta como vivo se
 * for recente. Assim nenhum estado preso sobrevive, mesmo os que já estão na
 * base de dados agora, e sem precisar de migração.
 */

/** Mesma janela que o `isOnline` do SocialScreen já usava. */
export const PRESENCE_TTL_MS = 3 * 60 * 1000;

/** Espaçamento entre escritas — impede uma rajada ao saltar faixas. */
export const PRESENCE_DEBOUNCE_MS = 2000;

/**
 * Batimento enquanto se ouve. Sem isto, um tema de 5 minutos passava a
 * "offline" a meio, porque o `updatedAt` era do início da reprodução.
 * Tem de ser confortavelmente inferior ao TTL.
 */
export const PRESENCE_HEARTBEAT_MS = 90 * 1000;

export type NowPlaying = NonNullable<Friendship['currentlyPlaying']>;

/**
 * O que mostrar por baixo do nome de um amigo, ou null para não mostrar nada.
 * Exige as três condições: existe registo, está mesmo a tocar (pausa não é
 * "a ouvir"), e é recente.
 */
export function livePresence(
  currentlyPlaying: NowPlaying | null | undefined,
  now: number = Date.now()
): NowPlaying | null {
  if (!currentlyPlaying?.isPlaying) return null;

  const at = Date.parse(currentlyPlaying.updatedAt ?? '');
  if (!Number.isFinite(at)) return null;
  // `now - at` negativo significa relógio do cliente atrasado face ao
  // servidor; contar como fresco é melhor do que esconder sem motivo.
  if (now - at > PRESENCE_TTL_MS) return null;

  return currentlyPlaying;
}

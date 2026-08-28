import { getDeviceId, getDeviceName, deviceKind } from '../lib/deviceIdentity';
import { trimQueueForSync, type RemoteSession } from '../lib/handoff';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

/**
 * Leitura/escrita da tabela `player_sessions` (ver supabase/player-sessions.sql).
 *
 * Este módulo é só transporte: o agrupamento das escritas e o batimento
 * vivem em `lib/sessionSync.ts`, e as regras de frescura/extrapolação em
 * `lib/handoff.ts`.
 */

export interface SessionSnapshot {
  track: Track;
  queue: Track[];
  queueIndex: number;
  positionMs: number;
  isPlaying: boolean;
}

function rowToSession(row: any): RemoteSession {
  return {
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceKind: row.device_kind,
    track: row.track,
    queue: Array.isArray(row.queue) ? row.queue : [],
    queueIndex: row.queue_index ?? 0,
    positionMs: row.position_ms ?? 0,
    isPlaying: !!row.is_playing,
    updatedAt: row.updated_at,
  };
}

/** Escreve a sessão deste dispositivo. Falha em silêncio: perder um
 * batimento não pode partir a reprodução. */
export async function writeSession(snapshot: SessionSnapshot): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [deviceId, deviceName] = await Promise.all([getDeviceId(), getDeviceName()]);
    const trimmed = trimQueueForSync(snapshot.queue, snapshot.queueIndex);

    await supabase.from('player_sessions').upsert(
      {
        user_id: user.id,
        device_id: deviceId,
        device_name: deviceName,
        device_kind: deviceKind(),
        track: snapshot.track,
        queue: trimmed.queue,
        queue_index: trimmed.queueIndex,
        position_ms: Math.max(0, Math.round(snapshot.positionMs)),
        is_playing: snapshot.isPlaying,
        // Relógio do cliente de propósito — quem lê extrapola com o seu.
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    );
  } catch {
    // silently fail
  }
}

/** Apaga a sessão deste dispositivo (terminar sessão / limpar o player). */
export async function deleteOwnSession(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const deviceId = await getDeviceId();
    await supabase
      .from('player_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId);
  } catch {
    // silently fail
  }
}

/**
 * As sessões dos OUTROS dispositivos, já sem a deste.
 *
 * O filtro do próprio dispositivo é feito aqui e repetido no
 * `pickHandoffSession` — a linha do próprio dispositivo não tem nada que
 * atravessar a rede, e o segundo filtro protege quem chame a lógica pura
 * com dados de outra origem.
 */
export async function fetchOtherSessions(): Promise<RemoteSession[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const deviceId = await getDeviceId();
    const { data, error } = await supabase
      .from('player_sessions')
      .select('device_id, device_name, device_kind, track, queue, queue_index, position_ms, is_playing, updated_at')
      .eq('user_id', user.id)
      .neq('device_id', deviceId)
      .order('updated_at', { ascending: false })
      .limit(8);

    if (error || !data) return [];
    return data.map(rowToSession);
  } catch {
    return [];
  }
}

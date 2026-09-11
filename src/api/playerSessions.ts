import { getDeviceId, getDeviceName, deviceKind } from '../lib/deviceIdentity';
import { idadeDaAmostra, instanteDaAmostra, trimQueueForSync, type RemoteSession } from '../lib/handoff';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

/**
 * Leitura/escrita da tabela `player_sessions` (ver supabase/player-sessions.sql
 * e supabase/handoff-ao-vivo.sql).
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
  /** O instante a que a `positionMs` se refere. Ver `instanteDaAmostra`. */
  positionAt: number;
  isPlaying: boolean;
  /** A velocidade a que a posição anda. Quem lê extrapola com ela. */
  ritmo: number;
}

/**
 * O que a base de dados já sabe fazer. `null` = ainda não se perguntou.
 *
 * Sem a migração `handoff-ao-vivo.sql` não há as colunas novas nem a função
 * de leitura, e o handoff tem de continuar a funcionar como funcionava: um
 * pedido com uma coluna que não existe é recusado INTEIRO, e partir o "continuar
 * aqui" por falta de um ficheiro SQL era pior do que o 0:00.
 */
let colunasNovas: boolean | null = null;
let leituraPeloServidor: boolean | null = null;

/** Os códigos de "isso não existe": coluna (PGRST204) e função (PGRST202, 42883). */
function naoExiste(error: { code?: string } | null | undefined): boolean {
  return !!error && ['PGRST204', 'PGRST202', '42883', '42703'].includes(error.code ?? '');
}

function rowToSession(row: any, lidaEm: number): RemoteSession {
  const idade = Number(row.idade_ms);
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
    idadeMs: row.idade_ms != null && Number.isFinite(idade) ? idade : null,
    lidaEm,
    ritmo: Number(row.ritmo) || 1,
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
    const agora = Date.now();

    const linha = {
      user_id: user.id,
      device_id: deviceId,
      device_name: deviceName,
      device_kind: deviceKind(),
      track: snapshot.track,
      queue: trimmed.queue,
      queue_index: trimmed.queueIndex,
      position_ms: Math.max(0, Math.round(snapshot.positionMs)),
      is_playing: snapshot.isPlaying,
      // O instante da AMOSTRA, não o da escrita, no relógio deste aparelho.
      // Com a migração o servidor substitui-o pelo dele, a partir da idade
      // abaixo; sem ela é o que se usa. Ver instanteDaAmostra em lib/handoff.
      updated_at: new Date(instanteDaAmostra(snapshot.positionAt, agora)).toISOString(),
    };
    const novas = {
      idade_da_amostra_ms: idadeDaAmostra(snapshot.positionAt, agora),
      ritmo: snapshot.ritmo,
    };

    if (colunasNovas !== false) {
      const { error } = await supabase.from('player_sessions')
        .upsert({ ...linha, ...novas }, { onConflict: 'user_id,device_id' });
      if (!error) { colunasNovas = true; return; }
      if (!naoExiste(error)) return;
      colunasNovas = false;
    }
    await supabase.from('player_sessions').upsert(linha, { onConflict: 'user_id,device_id' });
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
 * Pela função `sessoes_dos_outros_dispositivos`, que devolve a idade de cada
 * uma medida pelo relógio do servidor -- ver `idadeMs` em lib/handoff.ts. Sem
 * a migração, pela tabela, como antes.
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

    if (leituraPeloServidor !== false) {
      const { data, error } = await supabase.rpc('sessoes_dos_outros_dispositivos', { p_device_id: deviceId });
      // A idade vale para o instante da resposta: é esse o `lidaEm`.
      const lidaEm = Date.now();
      if (!error && Array.isArray(data)) {
        leituraPeloServidor = true;
        return data.map((row) => rowToSession(row, lidaEm));
      }
      if (naoExiste(error)) leituraPeloServidor = false;
    }

    const { data, error } = await supabase
      .from('player_sessions')
      .select('device_id, device_name, device_kind, track, queue, queue_index, position_ms, is_playing, updated_at')
      .eq('user_id', user.id)
      .neq('device_id', deviceId)
      .order('updated_at', { ascending: false })
      .limit(8);
    const lidaEm = Date.now();

    if (error || !data) return [];
    return data.map((row) => rowToSession(row, lidaEm));
  } catch {
    return [];
  }
}

import { supabase } from '../lib/supabase';
import {
  melhorEstimativa, precisaDeMedir, AMOSTRAS_POR_RONDA,
  type Amostra, type Estimativa,
} from '../lib/relogioPartilhado';
import type { Track } from '../types';

/**
 * O lado do servidor do ouvir-juntos. Só chamadas -- nenhuma decisão.
 *
 * As decisões todas vivem em `lib/`: as contas do relógio no
 * `relogioPartilhado.ts`, as da sincronia no `sincronizacao.ts`, e as regras de
 * quem pode o quê no próprio Postgres (`supabase/ouvir-juntos.sql`). Aqui só se
 * fala.
 */

export type SessaoDeEscuta = {
  id: string;
  hostId: string;
  track: Track | null;
  /** Instante em que a faixa começou, no relógio do servidor. */
  comecouEmServidor: number | null;
  aTocar: boolean;
  pausadaEmMs: number;
  convidadosControlam: boolean;
  acabouEm: number | null;
};

export type MembroDaSessao = {
  userId: string;
  pronta: boolean;
  percentagem: number;
  vistoEm: number;
};

const instante = (v: string | null | undefined): number | null =>
  v ? Date.parse(v) : null;

export function sessaoDaLinha(r: any): SessaoDeEscuta {
  return {
    id: r.id,
    hostId: r.host_id,
    track: (r.track as Track) ?? null,
    comecouEmServidor: instante(r.started_at),
    aTocar: !!r.is_playing,
    pausadaEmMs: Number(r.paused_position_ms) || 0,
    convidadosControlam: !!r.guests_can_control,
    acabouEm: instante(r.ended_at),
  };
}

export function membroDaLinha(r: any): MembroDaSessao {
  return {
    userId: r.user_id,
    pronta: !!r.ready,
    percentagem: Number(r.download_pct) || 0,
    vistoEm: instante(r.last_seen) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// O relógio
// ---------------------------------------------------------------------------

/**
 * Uma ronda de medições contra o relógio do servidor.
 *
 * Em série e não em paralelo, de propósito: cinco pedidos ao mesmo tempo fazem
 * fila uns atrás dos outros no mesmo socket, e o que se mediria era a fila que
 * nós próprios criámos. Um de cada vez dá cinco medições independentes.
 *
 * `melhorEstimativa` fica com a de menor ida e volta -- ver a explicação lá.
 */
export async function medirRelogio(
  amostras = AMOSTRAS_POR_RONDA
): Promise<Estimativa | null> {
  const medidas: Amostra[] = [];
  for (let i = 0; i < amostras; i++) {
    const enviadoEm = Date.now();
    const { data, error } = await supabase.rpc('hora_do_servidor');
    const recebidoEm = Date.now();
    if (error || !data) continue;
    const servidorEm = Date.parse(data as string);
    if (Number.isFinite(servidorEm)) medidas.push({ enviadoEm, servidorEm, recebidoEm });
  }
  return melhorEstimativa(medidas);
}

/** Mede outra vez só quando a estimativa que há já não serve. */
export async function relogioActualizado(
  actual: Estimativa | null
): Promise<Estimativa | null> {
  if (!precisaDeMedir(actual, Date.now())) return actual;
  return (await medirRelogio()) ?? actual;
}

// ---------------------------------------------------------------------------
// A sessão
// ---------------------------------------------------------------------------

export async function criarSessao(track: Track | null): Promise<string> {
  const { data, error } = await supabase.rpc('criar_sessao_de_escuta', {
    p_track: track ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function convidar(
  sessao: string, amigos: readonly string[], mensagem?: string
): Promise<void> {
  if (!amigos.length) return;
  const { error } = await supabase.rpc('convidar_para_sessao', {
    p_session: sessao,
    p_amigos: [...amigos],
    p_mensagem: mensagem?.trim() || null,
  });
  if (error) throw error;
}

export async function entrar(sessao: string): Promise<void> {
  const { error } = await supabase.rpc('entrar_na_sessao', { p_session: sessao });
  if (error) throw error;
}

export async function sair(sessao: string): Promise<void> {
  const { error } = await supabase.rpc('sair_da_sessao', { p_session: sessao });
  if (error) throw error;
}

export async function definirFaixa(sessao: string, track: Track): Promise<void> {
  const { error } = await supabase.rpc('definir_faixa_da_sessao', {
    p_session: sessao, p_track: track,
  });
  if (error) throw error;
}

export async function pausar(sessao: string, posicaoMs: number): Promise<void> {
  const { error } = await supabase.rpc('pausar_sessao', {
    p_session: sessao, p_posicao_ms: Math.max(0, Math.round(posicaoMs)),
  });
  if (error) throw error;
}

export async function retomar(sessao: string): Promise<void> {
  const { error } = await supabase.rpc('retomar_sessao', { p_session: sessao });
  if (error) throw error;
}

export async function permitirControlo(sessao: string, pode: boolean): Promise<void> {
  const { error } = await supabase.rpc('permitir_controlo_aos_convidados', {
    p_session: sessao, p_pode: pode,
  });
  if (error) throw error;
}

/**
 * "Já tenho a faixa" -- ou "vou em 40%".
 *
 * Nunca lança: isto é informação de conforto para a linha de estado, e uma
 * falha de rede a dizer que estamos prontos não pode partir a reprodução.
 */
export async function marcarPronto(
  sessao: string, pronta: boolean, percentagem = 0
): Promise<void> {
  try {
    await supabase.rpc('marcar_pronto', {
      p_session: sessao,
      p_pronta: pronta,
      p_percentagem: Math.max(0, Math.min(100, Math.round(percentagem))),
    });
  } catch {
    // Idem.
  }
}

/** Batimento. Também não lança, pela mesma razão. */
export async function continuoNaSessao(sessao: string): Promise<void> {
  try {
    await supabase.rpc('continuo_na_sessao', { p_session: sessao });
  } catch {
    // Idem.
  }
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export async function lerSessao(sessao: string): Promise<SessaoDeEscuta | null> {
  const { data, error } = await supabase
    .from('listening_sessions').select('*').eq('id', sessao).maybeSingle();
  if (error || !data) return null;
  return sessaoDaLinha(data);
}

export async function lerMembros(sessao: string): Promise<MembroDaSessao[]> {
  const { data, error } = await supabase
    .from('listening_members').select('*').eq('session_id', sessao);
  if (error || !data) return [];
  return data.map(membroDaLinha);
}

/**
 * A sessão em que este utilizador está, se estiver em alguma.
 *
 * Serve o arranque da app: fechar e reabrir não é sair de uma sessão, e
 * encontrar-se outra vez lá dentro é o comportamento certo.
 */
export async function minhaSessaoAberta(userId: string): Promise<SessaoDeEscuta | null> {
  const { data } = await supabase
    .from('listening_members').select('session_id').eq('user_id', userId);
  for (const linha of data ?? []) {
    const s = await lerSessao((linha as any).session_id);
    if (s && !s.acabouEm) return s;
  }
  return null;
}

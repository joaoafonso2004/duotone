import { supabase } from '../lib/supabase';
import type { Track } from '../types';

/**
 * Uma música por dia: a tua e as dos teus amigos.
 *
 * O limite de uma não vive aqui -- é a chave primária da tabela. Não há
 * contagem para correr nem estado para manter, e a segunda escolha do dia
 * substitui a primeira: mudar de ideias antes da meia-noite é diferente de
 * publicar duas. Ver `supabase/uma-musica-por-dia.sql`.
 */

export type EscolhaDoDia = {
  userId: string;
  nome: string | null;
  username: string | null;
  avatar: string | null;
  track: Track;
  nota: string | null;
  souEu: boolean;
  quando: number;
};

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function faixa(v: any): Track | null {
  if (!v || typeof v !== 'object') return null;
  const source = v.source === 'spotify' ? 'spotify' : v.source === 'youtube' ? 'youtube' : null;
  if (!source || typeof v.sourceId !== 'string' || !v.sourceId) return null;
  return {
    source, sourceId: v.sourceId,
    title: typeof v.title === 'string' ? v.title : '',
    artist: texto(v.artist), album: texto(v.album),
    artworkUrl: texto(v.artworkUrl),
    durationSeconds: typeof v.durationSeconds === 'number' ? v.durationSeconds : null,
  };
}

/** Lista vazia sem a migração, sem rede, ou num dia em que ninguém escolheu. */
export async function lerEscolhasDoDia(): Promise<EscolhaDoDia[]> {
  try {
    const { data, error } = await supabase.rpc('escolhas_do_dia');
    if (error || !Array.isArray(data)) return [];
    const saida: EscolhaDoDia[] = [];
    for (const r of data as any[]) {
      const t = faixa(r?.track);
      if (!t || typeof r.user_id !== 'string') continue;
      saida.push({
        userId: r.user_id,
        nome: texto(r.nome), username: texto(r.username), avatar: texto(r.avatar),
        track: t, nota: texto(r.nota), souEu: r.sou_eu === true,
        quando: Date.parse(r.quando) || 0,
      });
    }
    return saida;
  } catch {
    return [];
  }
}

/** Publica a minha de hoje. Substitui a anterior, se houver. */
export async function escolherDoDia(track: Track, nota?: string): Promise<void> {
  const { error } = await supabase.rpc('escolher_do_dia', {
    p_track: track, p_nota: nota?.slice(0, 140) ?? null,
  });
  if (error) throw error;
}

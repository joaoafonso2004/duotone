import { supabase } from '../lib/supabase';

/**
 * "A semana em cinco números": o cartaz de sexta-feira.
 *
 * Uma ida à base e um jsonb. A conta vive no `supabase/a-semana.sql` — cruzar
 * o histórico de todo o círculo do lado do cliente obrigava a trazer o
 * histórico de todo o círculo para o telemóvel.
 */

export type Pessoa = {
  id: string;
  nome: string | null;
  username: string | null;
  avatar: string | null;
  quantas: number;
  souEu: boolean;
};

export type ArtistaDaSemana = { nome: string; capa: string | null; escutas: number; pessoas: number };
export type EmUnissono = { titulo: string; artista: string | null; capa: string | null; pessoas: number };

export type ASemana = {
  pessoas: number;
  descobridor: Pessoa | null;
  asTuas: number;
  artista: ArtistaDaSemana | null;
  emUnissono: EmUnissono | null;
  partilhou: Pessoa | null;
};

const numero = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

const pessoa = (v: any): Pessoa | null =>
  v && typeof v.id === 'string'
    ? {
        id: v.id,
        nome: texto(v.nome),
        username: texto(v.username),
        avatar: texto(v.avatar),
        quantas: numero(v.quantas),
        souEu: v.sou_eu === true,
      }
    : null;

/** `null` sem a migração, sem rede, ou sem sessão. Quem chama não mostra nada. */
export async function lerASemana(): Promise<ASemana | null> {
  try {
    const { data, error } = await supabase.rpc('a_semana', { p_dias: 7 });
    if (error || !data || typeof data !== 'object') return null;
    const d = data as any;
    const a = d.artista;
    const u = d.em_uniso;
    return {
      pessoas: numero(d.pessoas),
      descobridor: pessoa(d.descobridor),
      asTuas: numero(d.as_tuas),
      artista: a && texto(a.nome)
        ? { nome: a.nome, capa: texto(a.capa), escutas: numero(a.escutas), pessoas: numero(a.pessoas) }
        : null,
      emUnissono: u && texto(u.titulo)
        ? { titulo: u.titulo, artista: texto(u.artista), capa: texto(u.capa), pessoas: numero(u.pessoas) }
        : null,
      partilhou: pessoa(d.partilhou),
    };
  } catch {
    return null;
  }
}

/**
 * Há aqui alguma coisa que valha um cartaz?
 *
 * Numa semana parada tudo vem a zero, e um cartaz a dizer "nada aconteceu" é
 * pior do que nenhum cartaz — aparece por si, sem ninguém pedir, e a primeira
 * coisa que faz é desiludir. Exige-se pelo menos DOIS dos cinco: um número
 * sozinho não é um cartaz, é uma linha.
 */
export function valeUmCartaz(d: ASemana | null): boolean {
  if (!d) return false;
  const tem = [
    !!d.descobridor && d.descobridor.quantas > 0,
    d.asTuas > 0,
    !!d.artista,
    !!d.emUnissono,
    !!d.partilhou && d.partilhou.quantas > 0,
  ].filter(Boolean).length;
  return tem >= 2;
}

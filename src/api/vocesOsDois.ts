import { supabase } from '../lib/supabase';

/**
 * "Vocês os dois": os números sobre ti e um amigo.
 *
 * Uma ida à base e um jsonb — a conta toda vive no `supabase/voces-os-dois.sql`
 * e não aqui, porque comparar dois históricos inteiros do lado do cliente
 * obrigava a trazer os dois históricos inteiros para o telemóvel. O que vem é
 * agregado: contagens por artista, nunca o que o outro ouviu e quando.
 */

export type Artista = { nome: string; capa: string | null };
export type Obsessao = Artista & { meu: number; teu: number };
export type Trazido = Artista & { vezes: number };
export type Divide = {
  titulo: string;
  artista: string | null;
  capa: string | null;
  /** De quem é o vício: `eu` ou `tu`. */
  deQuem: 'eu' | 'tu';
  vezes: number;
};

export type VocesOsDois = {
  /** 0..100. Jaccard pesado sobre a raiz das escutas -- ver o SQL. */
  compatibilidade: number;
  artistasEmComum: number;
  obsessao: Obsessao | null;
  eleTraria: Trazido | null;
  tuTrarias: Trazido | null;
  cheguei: number;
  chegaste: number;
  divide: Divide | null;
};

const numero = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

const artista = (v: any): Trazido | null =>
  v && typeof v.nome === 'string' && v.nome
    ? { nome: v.nome, capa: typeof v.capa === 'string' ? v.capa : null, vezes: numero(v.vezes) }
    : null;

/**
 * Devolve `null` quando a função ainda não existe na base, quando não são
 * amigos, ou quando a rede falha. Quem chama mostra o vazio -- é a mesma
 * decisão de todas as outras leituras sociais desta app.
 */
export async function lerVocesOsDois(amigoId: string): Promise<VocesOsDois | null> {
  try {
    const { data, error } = await supabase.rpc('voces_os_dois', { p_amigo: amigoId });
    if (error || !data || typeof data !== 'object') return null;
    const d = data as any;
    const o = d.obsessao;
    const v = d.divide;
    return {
      compatibilidade: Math.max(0, Math.min(100, numero(d.compatibilidade))),
      artistasEmComum: numero(d.artistas_em_comum),
      obsessao: o && typeof o.nome === 'string' && o.nome
        ? { nome: o.nome, capa: typeof o.capa === 'string' ? o.capa : null, meu: numero(o.meu), teu: numero(o.teu) }
        : null,
      eleTraria: artista(d.ele_traria),
      tuTrarias: artista(d.tu_trarias),
      cheguei: numero(d.cheguei_primeiro),
      chegaste: numero(d.chegaste_primeiro),
      divide: v && typeof v.titulo === 'string' && v.titulo
        ? {
            titulo: v.titulo,
            artista: typeof v.artista === 'string' ? v.artista : null,
            capa: typeof v.capa === 'string' ? v.capa : null,
            deQuem: v.de_quem === 'tu' ? 'tu' : 'eu',
            vezes: numero(v.vezes),
          }
        : null,
    };
  } catch {
    return null;
  }
}

/** Há aqui alguma coisa para mostrar? */
export function valeAPena(d: VocesOsDois | null): boolean {
  return !!d && (d.artistasEmComum > 0 || !!d.eleTraria || !!d.tuTrarias || !!d.divide);
}

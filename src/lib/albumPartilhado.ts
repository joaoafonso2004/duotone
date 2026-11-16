/**
 * Um álbum mandado a um amigo (16/11, supabase/partilhar-albuns.sql): o tipo
 * 'album' da `shared_items`, com o que se mostra no `track_data`.
 *
 * As chaves `title`, `artist` e `artworkUrl` são as que a lista das conversas
 * já lê de uma música (conversation_summaries), por isso a última mensagem de
 * uma conversa diz o nome do álbum sem mudar o servidor. As músicas não vão:
 * abrem-se do YouTube Music do lado de quem recebe.
 *
 * Os limites são os do `shared_album_valid`: o que passa aqui, passa lá.
 *
 * Sem imports: `scripts/test-partilhar-albuns.ts`.
 */

export type AlbumPartilhado = {
  /** O id do álbum no YouTube Music (a playlist OLAK5uy_…). */
  id: string;
  titulo: string;
  artista: string | null;
  capa: string | null;
  /** "Album", "EP", "Single", "Playlist"... */
  tipo: string | null;
  ano: string | null;
};

const ID_VALIDO = /^[A-Za-z0-9_-]{10,120}$/;

function limpo(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** O `track_data` que vai para a tabela; null se não há como mandar (sem id ou sem título). */
export function paraPartilhar(a: {
  id: string; titulo: string; artista?: string | null; capa?: string | null; tipo?: string | null; ano?: string | null;
}): Record<string, string | null> | null {
  const titulo = limpo(a.titulo, 300);
  if (!ID_VALIDO.test(a.id) || !titulo) return null;
  const capa = limpo(a.capa, 1000);
  return {
    albumId: a.id,
    title: titulo,
    artist: limpo(a.artista, 300),
    // Uma capa que não cabe não se corta (um link cortado não abre): fica sem.
    artworkUrl: capa && capa.length < 1000 ? capa : null,
    kind: limpo(a.tipo, 40),
    year: limpo(a.ano, 12),
  };
}

/** De volta, do que chega da tabela. */
export function albumPartilhado(v: unknown): AlbumPartilhado | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const id = typeof r.albumId === 'string' && ID_VALIDO.test(r.albumId) ? r.albumId : null;
  const titulo = limpo(r.title, 300);
  if (!id || !titulo) return null;
  return {
    id, titulo, artista: limpo(r.artist, 300), capa: limpo(r.artworkUrl, 1000), tipo: limpo(r.kind, 40), ano: limpo(r.year, 12),
  };
}

/** "Album", "EP", "Playlist": o que está por cima do título nos cartões. */
export function tipoDoAlbumPartilhado(a: Pick<AlbumPartilhado, 'tipo'>): string {
  return a.tipo?.trim() || 'Album';
}

/** "Kendrick Lamar · 2024", ou o tipo, quando não há mais nada. */
export function legendaDoAlbumPartilhado(a: Pick<AlbumPartilhado, 'artista' | 'ano' | 'tipo'>): string {
  return [a.artista, a.ano].filter(Boolean).join(' · ') || tipoDoAlbumPartilhado(a);
}

/**
 * Os álbuns guardados na biblioteca (15/11, pedido no Reddit: "guardar um álbum
 * põe as músicas numa playlist"). Um álbum guarda-se COMO ÁLBUM, e vive numa
 * "pasta" à cabeça das Playlists, com as capas a flutuar em camadas
 * (docs/albuns-maquete.html, variante B, escolhida pelo João).
 *
 * Aqui o que é puro: a forma de um álbum guardado, de onde ele vem (um disco da
 * página do artista, um resultado da pesquisa, um álbum aberto), as frases, e
 * as capas da pasta. A tabela é a `saved_albums` (supabase/albuns-guardados.sql).
 *
 * Sem imports: `scripts/test-albuns-guardados.ts`.
 */

export type AlbumGuardado = {
  /** O id do álbum no YouTube Music (a playlist OLAK5uy_…). */
  id: string;
  titulo: string;
  artista: string | null;
  ano: string | null;
  /** "Album", "EP", "Single"... */
  tipo: string | null;
  capa: string | null;
  /** ms */
  guardadoEm: number;
};

/** Um disco como chega das listas: o formato das playlists do YouTube, com o tipo e o ano quando os há. */
export type DiscoParaGuardar = {
  id: string;
  title: string;
  artworkUrl: string | null;
  tipo?: string | null;
  ano?: string | null;
};

/** Os ids de álbum do YouTube Music começam assim: é o que distingue um álbum de uma playlist qualquer. */
export function eAlbumDoYouTubeMusic(id: string | null | undefined): boolean {
  return !!id && /^OLAK5uy_/.test(id);
}

export function paraGuardar(d: DiscoParaGuardar, artista: string | null, agora = Date.now()): AlbumGuardado {
  const limpo = (s: string | null | undefined, max: number) => {
    const t = (s ?? '').trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    id: d.id,
    titulo: limpo(d.title, 300) ?? 'Album',
    artista: limpo(artista, 300),
    ano: limpo(d.ano, 12),
    tipo: limpo(d.tipo, 40),
    capa: limpo(d.artworkUrl, 1000),
    guardadoEm: agora,
  };
}

/** A linha da tabela, e de volta. */
export function paraALinha(a: AlbumGuardado): Record<string, unknown> {
  return {
    album_id: a.id, title: a.titulo, artist: a.artista, year: a.ano, kind: a.tipo,
    artwork_url: a.capa, saved_at: new Date(a.guardadoEm).toISOString(),
  };
}

export function daLinha(r: Record<string, unknown>): AlbumGuardado | null {
  const id = typeof r.album_id === 'string' ? r.album_id : '';
  const titulo = typeof r.title === 'string' ? r.title : '';
  if (!id || !titulo) return null;
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const em = Date.parse(String(r.saved_at ?? ''));
  return {
    id, titulo, artista: texto(r.artist), ano: texto(r.year), tipo: texto(r.kind), capa: texto(r.artwork_url),
    guardadoEm: Number.isFinite(em) ? em : 0,
  };
}

/** Os mais recentes primeiro, e cada álbum uma vez. */
export function ordenarAlbuns(albuns: readonly AlbumGuardado[]): AlbumGuardado[] {
  const vistos = new Set<string>();
  return [...albuns]
    .sort((a, b) => b.guardadoEm - a.guardadoEm)
    .filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)));
}

/**
 * As capas da pasta: as três mais recentes, a de trás primeiro (desenha-se de
 * trás para a frente). São sempre três camadas (16/11): com um álbum só, a capa
 * ficava sozinha na camada da frente, rodada e encostada à direita, e parecia
 * um erro. Os lugares que faltam ficam atrás, como cartões vazios.
 */
export type CamadaDaPasta = { capa: string | null; vazia: boolean };
export function capasDaPasta(albuns: readonly AlbumGuardado[]): CamadaDaPasta[] {
  const daFrente = ordenarAlbuns(albuns).slice(0, 3).reverse().map((a) => ({ capa: a.capa, vazia: false }));
  const vazias: CamadaDaPasta[] = Array.from({ length: 3 - daFrente.length }, () => ({ capa: null, vazia: true }));
  return [...vazias, ...daFrente];
}

/** "Billie Eilish · 2024", ou o que houver. */
export function legendaDoAlbum(a: Pick<AlbumGuardado, 'artista' | 'ano'>): string {
  return [a.artista, a.ano].filter(Boolean).join(' · ') || 'Album';
}

export const FRASES_DOS_ALBUNS = {
  pasta: 'Albums',
  guardados: (n: number) => `${n} saved`,
  guardar: 'Save to library',
  guardado: 'In your library',
  /** O feito depois de guardar e de tirar. */
  feitoGuardar: 'Saved to your library',
  feitoTirar: 'Removed from your library',
  vazio: 'No albums yet',
  vazioDetalhe: 'Tap ♡ on an album to keep it here.',
} as const;

/**
 * Como os ângulos e os lugares das capas da pasta (a maquete): a de trás rodada
 * -6° e mais apagada, a do meio -1°, a da frente +5°, cada uma um pouco mais à
 * direita e mais acima. Em percentagem do lado da pasta.
 */
export const CAMADAS_DA_PASTA = [
  { esquerda: 0, topo: 16, rodar: -6, opacidade: 0.75 },
  { esquerda: 11, topo: 8, rodar: -1, opacidade: 0.9 },
  { esquerda: 22, topo: 0, rodar: 5, opacidade: 1 },
] as const;
/** O lado de cada capa, em percentagem do lado da pasta. */
export const LADO_DA_CAPA_NA_PASTA = 78;
/**
 * A pasta aberta, com o rato em cima no PC (24/11, a maquete "Hover dos Albums e das
 * Playlists", o João escolheu a "Separar"): as capas afastam-se ao longo da diagonal em
 * que já estão (a de trás desce para a esquerda, a da frente sobe para a direita), abrem
 * um pouco o ângulo e ficam todas opacas. Deslocações em percentagem do lado da pasta.
 */
export const CAMADAS_DA_PASTA_ABERTA = [
  { direita: -6, baixo: 4, rodar: -9 },
  { direita: 0, baixo: 0, rodar: -1 },
  { direita: 6, baixo: -4, rodar: 8 },
] as const;

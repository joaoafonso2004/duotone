/**
 * As capas das playlists à escolha (26/11, um pedido no Reddit: "letting us
 * edit our playlist covers to any picture"; supabase/capas-das-playlists.sql).
 *
 * A capa é uma imagem quadrada no balde privado `playlist-covers`, na pasta do
 * dono, e a playlist guarda o caminho em `capa`. Para se ver, assina-se um link
 * (uma semana, como os do perfil). Com capa, `artworks` passa a ser só ela: o
 * mosaico (`ArtworkCollage`) com uma imagem mostra-a inteira, por isso aparece
 * em todo o lado sem mexer em cada ecrã. As das músicas ficam em
 * `capasDasFaixas`, para voltarem quando a capa sai.
 *
 * Aqui só a lógica pura (`scripts/test-capas-das-playlists.ts`); o Storage e o
 * escolher a imagem estão em `api/capasDasPlaylists.ts`.
 */

export const BALDE_DAS_CAPAS = 'playlist-covers';
/** Uma semana, como os links do perfil (`lib/profileMedia.ts`). */
export const LINK_DA_CAPA_VALE_S = 7 * 24 * 60 * 60;
/**
 * Renova-se com um dia de folga: a lista das playlists fica no disco com o
 * link dentro, e um link quase a caducar deixava a capa vazia no dia seguinte.
 */
export const RENOVAR_A_CAPA_ANTES_MS = 24 * 60 * 60 * 1000;

export type LinkDaCapa = { url: string; ate: number };

/** O mesmo padrão do `playlists_capa_check`: `<dono>/<uuid>.jpg`. */
const CAMINHO = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/;

export function caminhoDaCapa(dono: string, ficheiro: string): string {
  return `${dono}/${ficheiro}.jpg`;
}

export function caminhoValido(caminho: unknown, dono?: string): caminho is string {
  if (typeof caminho !== 'string') return false;
  const m = CAMINHO.exec(caminho);
  return !!m && (dono === undefined || m[1] === dono);
}

/** Os caminhos que precisam de link novo: sem link, ou a caducar. Sem repetidos. */
export function quaisAssinar(caminhos: readonly unknown[], links: ReadonlyMap<string, LinkDaCapa>, agora: number): string[] {
  const fora = new Set<string>();
  for (const c of caminhos) {
    if (!caminhoValido(c)) continue;
    const l = links.get(c);
    if (!l || l.ate - agora < RENOVAR_A_CAPA_ANTES_MS) fora.add(c);
  }
  return [...fora];
}

type ComCapas = { artworks: string[]; capa?: string | null; capasDasFaixas?: string[] };

/** A playlist com a capa à vista (`url`), ou com o mosaico das músicas se o link não veio. */
export function comCapa<T extends ComCapas>(p: T, url: string | null | undefined): T {
  const dasFaixas = p.capasDasFaixas ?? p.artworks;
  if (!p.capa || !url) return { ...p, artworks: dasFaixas, capasDasFaixas: undefined };
  return { ...p, artworks: [url], capasDasFaixas: dasFaixas };
}

/** Sem capa: volta o mosaico das músicas. */
export function semCapa<T extends ComCapas>(p: T): T {
  return { ...p, capa: null, artworks: p.capasDasFaixas ?? p.artworks, capasDasFaixas: undefined };
}

/** A capa escolhida, já com link, para as páginas que montam o mosaico pelas músicas. */
export function capaEscolhida(p: ComCapas | null | undefined): string | null {
  return p?.capa && p.capasDasFaixas ? p.artworks[0] ?? null : null;
}

/** A coluna `capa` ainda não existe nesta base (falta correr o SQL). */
export function faltaACapa(e: unknown): boolean {
  const erro = e as { code?: unknown; message?: unknown } | null;
  const m = String(erro?.message ?? '');
  return /playlists\.capa(?![a-z_])/.test(m) || /'capa' column/.test(m)
    || (erro?.code === '42703' && /\bcapa\b/.test(m));
}

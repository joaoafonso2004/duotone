import type { LinhaDaPlaylist } from './linkDePlaylist';

/**
 * Importar do Spotify PELA CONTA (7/10, iPhone): as Liked Songs e as playlists
 * da pessoa, inteiras -- o link só dava as primeiras 100 de uma playlist
 * pública (o embed), e as Liked Songs não têm link.
 *
 * A leitura é a API do Spotify com o login PKCE de sempre (api/spotifyConta.ts):
 * em modo de desenvolvimento só entram as contas que estão no painel da app,
 * e as outras levam o `nao-registado`. As linhas que daqui saem passam pelo
 * MESMO comparador do link e do CSV (`importSpotifyCsv`): só entram as de
 * confiança.
 *
 * Sem imports de runtime: `scripts/test-biblioteca-do-spotify.ts`.
 */

/** Cada lista importa no máximo isto: cada linha é uma pesquisa, e mil já são minutos. */
export const MAXIMO_DA_CONTA = 1000;
/** Quantas playlists se mostram para escolher. */
export const MAXIMO_DE_PLAYLISTS = 200;

export type ListaDoSpotify = {
  /** `'gostadas'` para as Liked Songs. */
  id: string;
  nome: string;
  capa: string | null;
  total: number;
  /** A playlist é de outra pessoa (ou do Spotify) e só se segue. */
  doutraPessoa: boolean;
};

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Uma faixa da API (`track` de um item) numa linha do comparador. `null` para episódios, locais e lixo. */
export function linhaDaFaixa(t: unknown): LinhaDaPlaylist | null {
  const f = t as {
    type?: unknown; is_local?: unknown; name?: unknown; uri?: unknown; duration_ms?: unknown;
    album?: { name?: unknown } | null; artists?: { name?: unknown }[] | null;
  } | null | undefined;
  if (!f || f.is_local === true || (f.type !== undefined && f.type !== 'track')) return null;
  const titulo = texto(f.name);
  const artistas = (Array.isArray(f.artists) ? f.artists : []).map((a) => texto(a?.name)).filter(Boolean);
  if (!titulo || !artistas.length) return null;
  const duracao = typeof f.duration_ms === 'number' && f.duration_ms > 0 ? f.duration_ms : null;
  return { title: titulo, artist: artistas.join(', '), album: texto(f.album?.name) || null, durationMs: duracao, uri: texto(f.uri) || null };
}

/** As linhas de uma página de itens (playlist ou Liked Songs), pela ordem. */
export function linhasDosItens(itens: unknown): LinhaDaPlaylist[] {
  if (!Array.isArray(itens)) return [];
  const linhas: LinhaDaPlaylist[] = [];
  for (const i of itens) {
    const l = linhaDaFaixa((i as { track?: unknown } | null)?.track);
    if (l) linhas.push(l);
  }
  return linhas;
}

/** As playlists de uma página do `/me/playlists`. */
export function playlistsDosItens(itens: unknown, eu: string | null): ListaDoSpotify[] {
  if (!Array.isArray(itens)) return [];
  const listas: ListaDoSpotify[] = [];
  for (const i of itens) {
    const p = i as { id?: unknown; name?: unknown; images?: { url?: unknown }[] | null; tracks?: { total?: unknown } | null; items?: { total?: unknown } | null; owner?: { id?: unknown } | null } | null;
    const id = texto(p?.id), nome = texto(p?.name);
    if (!id || !nome) continue;
    const total = Number(p?.tracks?.total ?? p?.items?.total) || 0;
    const capa = Array.isArray(p?.images) ? texto(p!.images![0]?.url) || null : null;
    listas.push({ id, nome, capa, total, doutraPessoa: !!eu && texto(p?.owner?.id) !== eu });
  }
  return listas;
}

/** As listas a mostrar: as Liked Songs primeiro, depois as playlists com músicas, as da pessoa antes das que segue. */
export function listasParaEscolher(gostadas: number, playlists: readonly ListaDoSpotify[]): ListaDoSpotify[] {
  const comMusicas = playlists.filter((p) => p.total > 0);
  const ordenadas = [...comMusicas.filter((p) => !p.doutraPessoa), ...comMusicas.filter((p) => p.doutraPessoa)];
  return [
    ...(gostadas > 0 ? [{ id: 'gostadas', nome: 'Liked Songs', capa: null, total: gostadas, doutraPessoa: false }] : []),
    ...ordenadas.slice(0, MAXIMO_DE_PLAYLISTS),
  ];
}

/** Até onde se lê uma lista, e se fica cortada. */
export function quantasLer(total: number): { ler: number; cortada: boolean } {
  return { ler: Math.min(total, MAXIMO_DA_CONTA), cortada: total > MAXIMO_DA_CONTA };
}

/**
 * Uma playlist trazida por LINK, do Spotify ou do YouTube (26/9).
 *
 * ## Porque não é a API do Spotify
 *
 * A API em modo de desenvolvimento só aceita 5 contas acrescentadas à mão
 * (ver "O gosto do Spotify" no CLAUDE.md) -- os amigos do João ficavam de fora.
 * O CSV do Exportify funciona, mas no iPhone é um passeio por três apps. A
 * página de EMBED de uma playlist pública (`open.spotify.com/embed/playlist/…`)
 * traz no `__NEXT_DATA__` o nome, a capa e as faixas com título, artistas e
 * duração, sem conta nem chave. Medido a 26/9 com seis playlists:
 *
 *  - traz até 100 faixas (uma de ~150 veio com 100);
 *  - só serve para playlists PÚBLICAS: as Liked Songs do Spotify são privadas,
 *    e a saída é pô-las primeiro numa playlist;
 *  - não é uma API: se o Spotify mudar a página, isto deixa de ler e diz-se.
 *
 * As faixas saem no mesmo formato das linhas do CSV (`SpotifyCsvRow`), para
 * passarem pelo mesmo `importSpotifyCsv` -- o comparador é um só.
 *
 * Sem imports de runtime: `scripts/test-link-de-playlist.ts` corre em Node puro.
 */

/** Igual ao `SpotifyCsvRow` (lib/spotifyCsv.ts), repetido para não importar nada. */
export interface LinhaDaPlaylist {
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  uri: string | null;
}

export type LinkDePlaylist = { tipo: 'spotify'; id: string } | { tipo: 'youtube'; id: string };

/** O que um link é, ou `null` se não é uma playlist que se saiba ler. */
export function lerLink(texto: string): LinkDePlaylist | null {
  const t = String(texto || '').trim();
  if (!t) return null;
  // spotify:playlist:ID (copiado da app de computador) e os links da web,
  // incluindo o /intl-pt/ e o ?si= que a app do telemóvel acrescenta.
  const spotify = /spotify(?:\.com)?[:/](?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:intl-[a-z-]+\/)?(?:embed\/)?playlist[:/]([A-Za-z0-9]{22})/i.exec(t);
  if (spotify) return { tipo: 'spotify', id: spotify[1] };
  const youtube = /[?&]list=([A-Za-z0-9_-]{10,})/.exec(t);
  if (youtube && /youtu(?:\.be|be\.com)/i.test(t)) return { tipo: 'youtube', id: youtube[1] };
  return null;
}

export const urlDoEmbed = (id: string) => `https://open.spotify.com/embed/playlist/${id}`;

export interface PlaylistDoSpotify {
  nome: string;
  capa: string | null;
  faixas: LinhaDaPlaylist[];
}

/**
 * Lê a página de embed. `null` quando ela não traz o que se espera -- a página
 * mudou, ou a playlist é privada/não existe (vem sem `trackList`).
 */
export function lerEmbedDoSpotify(html: string): PlaylistDoSpotify | null {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(String(html || ''));
  if (!m) return null;
  let entidade: any;
  try {
    entidade = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  } catch {
    return null;
  }
  const lista = entidade?.trackList;
  if (!entidade || !Array.isArray(lista)) return null;
  const faixas: LinhaDaPlaylist[] = [];
  for (const f of lista) {
    const title = typeof f?.title === 'string' ? f.title.trim() : '';
    // O `subtitle` são os artistas, separados por vírgula (e às vezes por um
    // espaço fino antes da vírgula).
    const artist = typeof f?.subtitle === 'string' ? f.subtitle.replace(/\s*,\s*/g, ', ').trim() : '';
    if (!title || !artist) continue;
    if (f?.entityType && f.entityType !== 'track') continue;
    faixas.push({
      title,
      artist,
      album: null,
      durationMs: Number.isFinite(f?.duration) && f.duration > 0 ? f.duration : null,
      uri: typeof f?.uri === 'string' ? f.uri : null,
    });
  }
  const capa = Array.isArray(entidade?.coverArt?.sources)
    ? [...entidade.coverArt.sources].sort((a: any, b: any) => (b?.width ?? 0) - (a?.width ?? 0))[0]?.url ?? null
    : null;
  return { nome: String(entidade.name || entidade.title || 'Spotify playlist').trim(), capa, faixas };
}

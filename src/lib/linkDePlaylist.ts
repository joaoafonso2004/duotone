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

export type LinkDePlaylist =
  | { tipo: 'spotify'; id: string }
  | { tipo: 'youtube'; id: string }
  /** Deezer (5/11): a API pública, sem chave. O `link.deezer.com/s/…` da partilha resolve-se primeiro. */
  | { tipo: 'deezer'; id: string }
  | { tipo: 'deezer-curto'; url: string }
  /** Apple Music (5/11): a página pública da playlist, que traz as primeiras 50. */
  | { tipo: 'apple'; url: string };

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
  // A app do Deezer partilha "…on Deezer! https://link.deezer.com/s/…": o link
  // pode vir no meio de uma frase, e o da web traz a língua (/pt/, /en/).
  const deezer = /deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?playlist\/(\d{1,20})(?!\d)/i.exec(t);
  if (deezer) return { tipo: 'deezer', id: deezer[1] };
  const curto = /https:\/\/(?:link\.deezer\.com\/s\/[A-Za-z0-9]{4,40}|deezer\.page\.link\/[A-Za-z0-9]{4,40})/i.exec(t);
  if (curto) return { tipo: 'deezer-curto', url: curto[0] };
  // O link da partilha do Apple Music, sem o ?ls= nem o ?i= do fim.
  const apple = /https:\/\/music\.apple\.com\/[a-z]{2}\/playlist\/[^\s/?#]{1,200}\/pl\.[A-Za-z0-9.-]{5,80}/i.exec(t);
  if (apple) return { tipo: 'apple', url: apple[0] };
  return null;
}

/**
 * Um link de um serviço que se conhece mas não se sabe ler sem conta (5/11,
 * medido): o Tidal só mostra o nome, o Amazon Music não serve nada sem um
 * browser, e no SoundCloud o set fica por medir. Por lista ou ficheiro, então.
 */
export function servicoSemLeitura(texto: string): string | null {
  const t = String(texto || '');
  if (/(?:^|\/\/|\.)tidal\.com\//i.test(t)) return 'Tidal';
  if (/music\.amazon\.[a-z.]+\//i.test(t)) return 'Amazon Music';
  if (/(?:^|\/\/|\.)soundcloud\.com\/|on\.soundcloud\.com\//i.test(t)) return 'SoundCloud';
  return null;
}

export const urlDoEmbed = (id: string) => `https://open.spotify.com/embed/playlist/${id}`;

/** Uma playlist lida de fora (Spotify, Deezer, Apple Music): nome, capa e as linhas. */
export interface PlaylistLida {
  nome: string;
  capa: string | null;
  faixas: LinhaDaPlaylist[];
  /** Quantas o serviço diz que tem, quando o diz (pode ser mais do que as lidas). */
  total?: number;
}
export type PlaylistDoSpotify = PlaylistLida;

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

// ---------------------------------------------------------------- Deezer --
// A API pública (api.deezer.com), sem chave nem conta. Medido a 5/11 com o
// "Top Worldwide": `/playlist/ID` traz o nome, a capa, `nb_tracks` e as faixas;
// `/playlist/ID/tracks?index=N&limit=100` dá as seguintes, com `total`.
// Recortes reais em scripts/fixtures/deezer-*.json.

function linhaDoDeezer(f: any): LinhaDaPlaylist | null {
  const title = typeof f?.title === 'string' ? f.title.trim() : '';
  const artist = typeof f?.artist?.name === 'string' ? f.artist.name.trim() : '';
  if (!title || !artist) return null;
  if (f?.type && f.type !== 'track') return null;
  return {
    title,
    artist,
    album: typeof f?.album?.title === 'string' && f.album.title.trim() ? f.album.title.trim() : null,
    durationMs: Number.isFinite(f?.duration) && f.duration > 0 ? f.duration * 1000 : null,
    uri: f?.id != null ? `deezer:track:${f.id}` : null,
  };
}

/** A resposta de `/playlist/ID`, ou `null` se é um erro ou não é uma playlist. */
export function lerPlaylistDoDeezer(json: any): PlaylistLida | null {
  if (!json || json.error || !json.title || !Array.isArray(json?.tracks?.data)) return null;
  const faixas = json.tracks.data.map(linhaDoDeezer).filter(Boolean) as LinhaDaPlaylist[];
  const capa = [json.picture_xl, json.picture_big, json.picture_medium].find((c) => typeof c === 'string' && c) ?? null;
  return { nome: String(json.title).trim(), capa, faixas, total: Number.isFinite(json.nb_tracks) ? json.nb_tracks : faixas.length };
}

/** Uma página de `/playlist/ID/tracks`: as linhas e o total que a API diz. */
export function lerFaixasDoDeezer(json: any): { faixas: LinhaDaPlaylist[]; total: number | null } | null {
  if (!json || json.error || !Array.isArray(json.data)) return null;
  return { faixas: json.data.map(linhaDoDeezer).filter(Boolean) as LinhaDaPlaylist[], total: Number.isFinite(json.total) ? json.total : null };
}

// ----------------------------------------------------------- Apple Music --
// A página pública da playlist traz, no `serialized-server-data`, as secções
// da página: o cabeçalho (o nome) e a lista (`trackLockup`) com as primeiras 50
// faixas, com título, artistas e duração em ms. Não é uma API: se a página
// mudar, deixa de ler e diz-se. Recorte real em scripts/fixtures.

/** A página de uma playlist do Apple Music, ou `null` se não traz o que se espera. */
export function lerPaginaDaApple(html: string): PlaylistLida | null {
  const m = /<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/.exec(String(html || ''));
  if (!m) return null;
  let dados: any;
  try { dados = JSON.parse(m[1]); } catch { return null; }
  const raiz = Array.isArray(dados) ? dados[0] : dados;
  const seccoes: any[] = (Array.isArray(raiz?.data) ? raiz.data[0]?.data?.sections : raiz?.data?.sections) ?? [];
  if (!Array.isArray(seccoes)) return null;
  const lista = seccoes.find((s) => s?.itemKind === 'trackLockup');
  if (!lista || !Array.isArray(lista.items)) return null;
  const faixas: LinhaDaPlaylist[] = [];
  for (const f of lista.items) {
    const title = typeof f?.title === 'string' ? f.title.trim() : '';
    const nomes = Array.isArray(f?.subtitleLinks) ? f.subtitleLinks.map((l: any) => l?.title).filter((x: any) => typeof x === 'string' && x.trim()) : [];
    const artist = (nomes.length ? nomes.join(', ') : typeof f?.artistName === 'string' ? f.artistName : '').trim();
    if (!title || !artist) continue;
    const album = Array.isArray(f?.tertiaryLinks) && typeof f.tertiaryLinks[0]?.title === 'string' ? f.tertiaryLinks[0].title.trim() || null : null;
    faixas.push({ title, artist, album, durationMs: Number.isFinite(f?.duration) && f.duration > 0 ? f.duration : null, uri: null });
  }
  const cabecalho = seccoes.find((s) => /header/i.test(String(s?.itemKind ?? '')) || /header/i.test(String(s?.id ?? '')));
  const og = /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/.exec(html)?.[1];
  const nome = (typeof cabecalho?.items?.[0]?.title === 'string' && cabecalho.items[0].title.trim())
    || (og ? og.replace(/\s+on Apple Music$/i, '').trim() : '')
    || 'Apple Music playlist';
  return { nome: decodificarEntidades(nome), capa: null, faixas };
}

const decodificarEntidades = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

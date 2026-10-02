import { cacheGet, cacheSet } from './cache';
import { ENV } from '../lib/env';
import { extractArtist } from '../lib/artistName';
import { searchAttempts } from '../lib/searchQuery';
import type { Track, YtPlaylistItem } from '../types';
import { eMix } from '../lib/mixDoYouTube';
import { lerMixDoYouTube } from './youtubeMix';
import { lerPlaylistPeloYtMusic } from './ytMusic';

const BASE = 'https://www.googleapis.com/youtube/v3';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL = 7 * DAY_MS; // pesquisa: cache 7 dias
const PLAYLIST_TTL = 1 * DAY_MS; // playlists: cache 1 dia
/**
 * Quantas páginas de 50 se leem de uma playlist: 100 = 5000 vídeos, o máximo que
 * o YouTube deixa ter numa playlist (28/9). Eram 4 (200 vídeos) e o resto ficava
 * de fora sem aviso -- a lista de gostos de um amigo do João tinha milhares.
 * Cada página custa 1 das 10 000 unidades diárias da chave (partilhada): uma
 * playlist de 5000 são 100. A chave da cache passou a v2 para uma playlist já
 * lida com o teto antigo não continuar cortada durante o dia da cache.
 */
const PAGINAS_DE_PLAYLIST = 100;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** 'PT1H4M13S' -> segundos */
export function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

async function yfetch(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: ENV.YOUTUBE_API_KEY });
  const res = await fetch(`${BASE}${path}?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ------------------------------------------------------------
// Pesquisa (apenas metadados — a reprodução é sempre no player
// oficial do YouTube dentro de um WKWebView)
// ------------------------------------------------------------

export async function searchYouTube(query: string): Promise<Track[]> {
  const key = `search:v2:${query.trim().toLowerCase()}`;
  const cached = await cacheGet<Track[]>(key, SEARCH_TTL, { memoria: true });
  if (cached) return cached;

  // A Data API suprime algumas queries curtas e devolve zero resultados sem
  // erro. Tentar por ordem até haver resposta — ver `searchAttempts`.
  let search: any = { items: [] };
  let ids: string[] = [];
  for (const attempt of searchAttempts(query)) {
    search = await yfetch('/search', {
      part: 'snippet',
      type: 'video',
      maxResults: '25',
      q: attempt,
    });
    ids = (search.items ?? []).map((it: any) => it?.id?.videoId).filter(Boolean);
    if (ids.length > 0) break;
  }
  if (ids.length === 0) return [];

  // Durações (videos.list custa 1 unidade)
  const details = await yfetch('/videos', {
    part: 'contentDetails',
    id: ids.join(','),
  });
  const durations = new Map<string, number>(
    (details.items ?? []).map((v: any) => [
      v.id as string,
      parseIsoDuration(v?.contentDetails?.duration ?? ''),
    ])
  );

  const tracks: Track[] = (search.items ?? []).map((it: any) => ({
    source: 'youtube' as const,
    sourceId: it.id.videoId as string,
    title: decodeEntities(it.snippet?.title ?? ''),
    // Artista real extraído do título/canal (canal cru fragmentava a página
    // de Artistas — um "artista" por canal que postou a música)
    artist: extractArtist(
      decodeEntities(it.snippet?.title ?? ''),
      decodeEntities(it.snippet?.channelTitle ?? '') || null
    ),
    album: null,
    artworkUrl:
      it.snippet?.thumbnails?.high?.url ??
      it.snippet?.thumbnails?.medium?.url ??
      null,
    durationSeconds: durations.get(it.id.videoId) ?? null,
  }));

  await cacheSet(key, tracks);
  return tracks;
}

// ------------------------------------------------------------
// Músicas Em Alta (Trending) — usa o endpoint oficial
// videos.list?chart=mostPopular&videoCategoryId=10 (Música)
// ------------------------------------------------------------

const TRENDING_TTL = 4 * 60 * 60 * 1000; // 4 horas

export async function getTrendingMusic(
  limit = 25,
  regionCode = 'PT'
): Promise<Track[]> {
  const key = `trending_music:v2:${regionCode}:${limit}`;
  const cached = await cacheGet<Track[]>(key, TRENDING_TTL, { memoria: true });
  if (cached) return cached;

  try {
    const res = await yfetch('/videos', {
      part: 'snippet,contentDetails',
      chart: 'mostPopular',
      videoCategoryId: '10', // Música
      regionCode,
      maxResults: String(limit),
    });

    const tracks: Track[] = (res.items ?? []).map((v: any) => ({
      source: 'youtube' as const,
      sourceId: v.id as string,
      title: decodeEntities(v.snippet?.title ?? ''),
      artist: extractArtist(
        decodeEntities(v.snippet?.title ?? ''),
        decodeEntities(v.snippet?.channelTitle ?? '') || null
      ),
      album: null,
      artworkUrl:
        v.snippet?.thumbnails?.high?.url ??
        v.snippet?.thumbnails?.medium?.url ??
        null,
      durationSeconds: parseIsoDuration(v?.contentDetails?.duration ?? ''),
    }));

    await cacheSet(key, tracks);
    return tracks;
  } catch (error) {
    console.error('Error fetching trending music:', error);
    return [];
  }
}

// ------------------------------------------------------------
// Importação de playlists (apenas metadados)
// ------------------------------------------------------------

export function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export interface YtPlaylistImport {
  id: string;
  title: string;
  items: YtPlaylistItem[];
}

export async function fetchYouTubePlaylist(
  url: string
): Promise<YtPlaylistImport> {
  const id = extractPlaylistId(url.trim());
  if (!id) throw new Error('Invalid playlist link. It must contain "list=".');

  // O mesmo caminho do id: a mesma cache, os Mix e as listas editoriais.
  return fetchYouTubePlaylistById(id);
}

export interface YtRecommendedPlaylist {
  id: string;
  title: string;
  artworkUrl: string | null;
  channelTitle?: string;
}

export async function searchYouTubePlaylists(
  query: string,
  limit = 5
): Promise<YtRecommendedPlaylist[]> {
  const key = `playlists_search:v2:${query.trim().toLowerCase()}`;
  const cached = await cacheGet<YtRecommendedPlaylist[]>(key, SEARCH_TTL, { memoria: true });
  if (cached) return cached;

  try {
    const search = await yfetch('/search', {
      part: 'snippet',
      type: 'playlist',
      maxResults: String(limit),
      q: query,
    });

    const results: YtRecommendedPlaylist[] = [];
    for (const item of search.items ?? []) {
      if (item?.id?.playlistId) {
        results.push({
          id: item.id.playlistId,
          title: decodeEntities(item.snippet.title),
          artworkUrl:
            item.snippet.thumbnails?.high?.url ??
            item.snippet.thumbnails?.medium?.url ??
            null,
          channelTitle: item.snippet.channelTitle,
        });
      }
    }
    await cacheSet(key, results);
    return results;
  } catch (error) {
    console.error('Error searching YouTube playlists:', error);
    return [];
  }
}

export async function fetchYouTubePlaylistById(id: string): Promise<YtPlaylistImport> {
  const editorial = id.startsWith('RDCLAK5uy_');
  const key = `playlist:ytm:v1:${id}`;
  const cached = await cacheGet<YtPlaylistImport>(key, PLAYLIST_TTL, { memoria: true })
    // A leitura antiga (Data API) continua a servir enquanto não caduca; a das
    // editoriais não, porque vinha repetida e às voltas (ver abaixo).
    ?? (editorial ? null : await cacheGet<YtPlaylistImport>(`playlist:v2:${id}`, PLAYLIST_TTL, { memoria: true }));
  if (cached) return cached;

  // Pelo YouTube Music primeiro (30/9): grátis, e sem gastar a chave da Data
  // API, que é UMA para toda a gente. A Data API fica para quando ele falha, ou
  // não chega ao fim de uma lista de pessoas. Nas editoriais ("Presenting
  // Drake") vale sempre o que ele trouxer: a Data API devolve-as em páginas sem
  // fim com as mesmas músicas (29/9: 400 itens, 55 distintos em 8 páginas), e o
  // diálogo ficava em "Loading...".
  const lida = await lerPlaylistPeloYtMusic(id);
  if (lida?.itens.length && (lida.completa || editorial)) {
    // Os álbuns (`OLAK5uy_`) não trazem o nome na página: vai-se buscar só esse
    // (1 unidade), e sem ele fica "Playlist" -- quem abriu já o sabe.
    const titulo = lida.titulo ?? await yfetch('/playlists', { part: 'snippet', id })
      .then((m) => decodeEntities(m.items?.[0]?.snippet?.title ?? '') || null).catch(() => null);
    const daLista: YtPlaylistImport = { id, title: titulo ?? 'Playlist', items: lida.itens };
    await cacheSet(key, daLista);
    return daLista;
  }

  // Um Mix (`RD...`) não é uma playlist para a API, que responde 404: lê-se
  // pelo InnerTube (28/9, lib/mixDoYouTube.ts). A primeira volta, ~25 músicas.
  if (eMix(id)) {
    const mix = await lerMixDoYouTube(id);
    const doMix: YtPlaylistImport = { id, title: mix.titulo, items: mix.itens };
    await cacheSet(key, doMix);
    return doMix;
  }

  // Nome da playlist
  const meta = await yfetch('/playlists', { part: 'snippet', id });
  const title = decodeEntities(
    meta.items?.[0]?.snippet?.title ?? 'YouTube playlist'
  );

  // Itens (paginado, até `PAGINAS_DE_PLAYLIST` x 50 vídeos). Uma página que não
  // traga nenhum vídeo novo acaba a leitura: há listas que a API devolve às
  // voltas, sempre com um `nextPageToken`.
  const items: YtPlaylistItem[] = [];
  const vistos = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < PAGINAS_DE_PLAYLIST; page++) {
    const res = await yfetch('/playlistItems', {
      part: 'snippet',
      playlistId: id,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    let novos = 0;
    for (const it of res.items ?? []) {
      const sn = it.snippet;
      const videoId = sn?.resourceId?.videoId;
      const t = sn?.title ?? '';
      if (!videoId || vistos.has(videoId)) continue;
      vistos.add(videoId);
      novos++;
      if (t === 'Private video' || t === 'Deleted video') continue;
      items.push({
        videoId,
        title: decodeEntities(t),
        channel: decodeEntities(
          sn?.videoOwnerChannelTitle ?? sn?.channelTitle ?? ''
        ),
        thumbnail:
          sn?.thumbnails?.high?.url ?? sn?.thumbnails?.medium?.url ?? null,
      });
    }
    pageToken = res.nextPageToken;
    if (!pageToken || !novos) break;
  }

  const result: YtPlaylistImport = { id, title, items };
  await cacheSet(key, result);
  return result;
}

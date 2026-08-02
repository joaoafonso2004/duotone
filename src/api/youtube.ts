import { supabase } from '../lib/supabase';
import { ENV } from '../lib/env';
import { extractArtist } from '../lib/artistName';
import { searchAttempts } from '../lib/searchQuery';
import type { Track, YtPlaylistItem } from '../types';

const BASE = 'https://www.googleapis.com/youtube/v3';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL = 7 * DAY_MS; // pesquisa: cache 7 dias
const PLAYLIST_TTL = 1 * DAY_MS; // playlists: cache 1 dia

// ------------------------------------------------------------
// Cache no Supabase (a search da Data API custa 100 unidades de
// quota por chamada — o tier grátis são 10.000/dia)
// ------------------------------------------------------------

async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | null> {
  try {
    const { data } = await supabase
      .from('yt_cache')
      .select('payload, fetched_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const age = Date.now() - new Date(data.fetched_at as string).getTime();
    if (age > maxAgeMs) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, payload: unknown): Promise<void> {
  try {
    await supabase.from('yt_cache').upsert({
      cache_key: key,
      payload,
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // cache é best-effort
  }
}

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
  const cached = await cacheGet<Track[]>(key, SEARCH_TTL);
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
  const cached = await cacheGet<Track[]>(key, TRENDING_TTL);
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

  const key = `playlist:v1:${id}`;
  const cached = await cacheGet<YtPlaylistImport>(key, PLAYLIST_TTL);
  if (cached) return cached;

  // Nome da playlist
  const meta = await yfetch('/playlists', { part: 'snippet', id });
  const title = decodeEntities(
    meta.items?.[0]?.snippet?.title ?? 'YouTube playlist'
  );

  // Itens (paginado, máx. ~200 vídeos)
  const items: YtPlaylistItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page++) {
    const res = await yfetch('/playlistItems', {
      part: 'snippet',
      playlistId: id,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of res.items ?? []) {
      const sn = it.snippet;
      const videoId = sn?.resourceId?.videoId;
      const t = sn?.title ?? '';
      if (!videoId || t === 'Private video' || t === 'Deleted video') continue;
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
    if (!pageToken) break;
  }

  const result: YtPlaylistImport = { id, title, items };
  await cacheSet(key, result);
  return result;
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
  const cached = await cacheGet<YtRecommendedPlaylist[]>(key, SEARCH_TTL);
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
  const key = `playlist:v1:${id}`;
  const cached = await cacheGet<YtPlaylistImport>(key, PLAYLIST_TTL);
  if (cached) return cached;

  // Nome da playlist
  const meta = await yfetch('/playlists', { part: 'snippet', id });
  const title = decodeEntities(
    meta.items?.[0]?.snippet?.title ?? 'YouTube playlist'
  );

  // Itens (paginado, máx. ~200 vídeos)
  const items: YtPlaylistItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page++) {
    const res = await yfetch('/playlistItems', {
      part: 'snippet',
      playlistId: id,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of res.items ?? []) {
      const sn = it.snippet;
      const videoId = sn?.resourceId?.videoId;
      const t = sn?.title ?? '';
      if (!videoId || t === 'Private video' || t === 'Deleted video') continue;
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
    if (!pageToken) break;
  }

  const result: YtPlaylistImport = { id, title, items };
  await cacheSet(key, result);
  return result;
}

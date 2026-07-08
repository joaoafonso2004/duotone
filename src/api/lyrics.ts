import { parseLrc, LyricLine } from '../lib/lyricsParser';

export interface LyricsData {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
  parsedLines: LyricLine[];
}

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  durationSeconds?: number
): Promise<LyricsData | null> {
  try {
    const url = new URL('https://lrclib.net/api/get');
    url.searchParams.append('track_name', trackName);
    url.searchParams.append('artist_name', artistName);
    if (durationSeconds) {
      url.searchParams.append('duration', Math.round(durationSeconds).toString());
    }

    const response = await fetch(url.toString());
    
    if (response.status === 404) {
      // Fallback: try search endpoint with full query
      const searchUrl = new URL('https://lrclib.net/api/search');
      searchUrl.searchParams.append('q', `${trackName} ${artistName}`);
      const searchRes = await fetch(searchUrl.toString());
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (results && results.length > 0) {
          const best = results[0];
          return {
            id: best.id,
            trackName: best.trackName,
            artistName: best.artistName,
            albumName: best.albumName,
            duration: best.duration,
            instrumental: best.instrumental,
            plainLyrics: best.plainLyrics,
            syncedLyrics: best.syncedLyrics,
            parsedLines: parseLrc(best.syncedLyrics || ''),
          };
        }
      }
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch lyrics: ${response.status}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      trackName: data.trackName,
      artistName: data.artistName,
      albumName: data.albumName,
      duration: data.duration,
      instrumental: data.instrumental,
      plainLyrics: data.plainLyrics,
      syncedLyrics: data.syncedLyrics,
      parsedLines: parseLrc(data.syncedLyrics || ''),
    };
  } catch (error) {
    console.error('Error fetching lyrics from lrclib:', error);
    return null;
  }
}

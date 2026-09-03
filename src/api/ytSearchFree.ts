import type { Track } from '../types';

/**
 * Pesquisa no YouTube sem gastar quota da Data API.
 *
 * A `searchYouTube` oficial custa 100 unidades por chamada, de um tecto
 * diário de 10.000 — cem pesquisas por dia. Importar uma playlist de mil
 * faixas precisaria de dez vezes a quota de um dia inteiro, e esgotaria a
 * pesquisa normal da app pelo caminho.
 *
 * Esta usa o InnerTube, a API interna do próprio YouTube — a mesma que o
 * `ytstream.ts` já usa para resolver os fluxos de áudio. Não leva chave e
 * não tem quota.
 *
 * O compromisso é o mesmo que a app já aceita para reproduzir: é uma API
 * privada, e quando o YouTube muda a `clientVersion` é preciso atualizá-la
 * aqui. A pesquisa normal usa-a primeiro e recorre à Data API se falhar.
 */

const ENDPOINT = 'https://www.youtube.com/youtubei/v1/search';

/** Igual ao que o ytstream.ts usa; atualizar os dois ao mesmo tempo. */
const CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20260114.08.00',
  hl: 'en',
  gl: 'US',
};

/** Filtro "apenas vídeos" — evita canais e playlists nos resultados. */
const VIDEO_ONLY = 'EgIQAQ%3D%3D';

/** Resultados por pesquisa. Mais do que isto não melhora a correspondência. */
const MAX_RESULTS = 20;

/** Um resultado, com o canal que o `Track` não guarda. */
export interface FreeSearchResult {
  track: Track;
  /** Nome do canal — o sinal mais forte para distinguir o upload oficial. */
  channel: string;
}

/** "3:45" ou "1:02:03" para segundos. */
function parseDuration(text: string | null | undefined): number | null {
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}

/**
 * A resposta do InnerTube é uma árvore de "renderers" cuja forma muda entre
 * versões. Percorrê-la à procura de `videoRenderer`, em vez de navegar por
 * um caminho fixo, sobrevive a essas mudanças.
 */
function collectVideos(node: unknown, out: any[], depth = 0): void {
  // A árvore é funda mas não infinita; o limite protege de ciclos.
  if (depth > 30 || !node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, depth + 1);
    return;
  }

  const record = node as Record<string, any>;
  if (record.videoRenderer) {
    out.push(record.videoRenderer);
    return;
  }
  for (const key of Object.keys(record)) collectVideos(record[key], out, depth + 1);
}

/** Pesquisa com o canal de cada resultado. É esta que faz o trabalho. */
export async function searchYouTubeFreeWithChannel(query: string, signal?: AbortSignal): Promise<FreeSearchResult[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.youtube.com',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': CLIENT.clientVersion,
    },
    body: JSON.stringify({ context: { client: CLIENT }, query, params: VIDEO_ONLY }),
  });

  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);

  const renderers: any[] = [];
  const corpo = await res.json();
  if (!corpo?.contents) throw new Error('Unexpected search response.');
  collectVideos(corpo, renderers);

  const out: FreeSearchResult[] = [];
  for (const v of renderers) {
    const sourceId: string | undefined = v?.videoId;
    const title: string = v?.title?.runs?.[0]?.text ?? '';
    if (!sourceId || !title) continue;

    const channel: string =
      v?.ownerText?.runs?.[0]?.text ?? v?.longBylineText?.runs?.[0]?.text ?? '';

    out.push({
      channel,
      track: {
        source: 'youtube',
        sourceId,
        title,
        // O canal "- Topic" é gerado pela editora e traz o artista limpo.
        artist: channel,
        album: null,
        artworkUrl: `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`,
        durationSeconds: parseDuration(v?.lengthText?.simpleText),
      },
    });

    if (out.length >= MAX_RESULTS) break;
  }

  return out;
}

/** Só as faixas, para quem não precisa do canal. */
export async function searchYouTubeFree(query: string, signal?: AbortSignal): Promise<Track[]> {
  return (await searchYouTubeFreeWithChannel(query, signal)).map((r) => r.track);
}

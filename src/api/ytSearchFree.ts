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

/** Resultados por página. É o que o InnerTube devolve de uma vez. */
const MAX_RESULTS = 40;

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
function procurarContinuacao(node: unknown, depth = 0): string | null {
  if (depth > 30 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const t = procurarContinuacao(child, depth + 1);
      if (t) return t;
    }
    return null;
  }
  const record = node as Record<string, any>;
  const token = record.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  if (typeof token === 'string' && token) return token;
  for (const key of Object.keys(record)) {
    const t = procurarContinuacao(record[key], depth + 1);
    if (t) return t;
  }
  return null;
}

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

/**
 * O pedido em si, pelo caminho que a plataforma deixa.
 *
 * No iOS o `fetch` fala directamente com o YouTube. No Windows não pode: a
 * app corre dentro de um renderer do Electron, e daí isto é um pedido
 * cross-origin -- os cabeçalhos `X-YouTube-*` obrigam a um preflight, e o
 * YouTube responde-lhe 403 sem cabeçalho de CORS nenhum. O pedido morria
 * antes de haver resposta, e como quem chama lê uma falha como "não
 * encontrei nada", uma importação inteira do Spotify dava zero faixas sem
 * um único erro aparecer. Por isso no Electron isto passa pelo processo
 * principal, que não tem CORS.
 */
async function pedirAoYouTube(
  alvo: { query?: string; continuation?: string },
  signal?: AbortSignal,
): Promise<any> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.pesquisarNoYouTube : undefined;

  if (ponte) {
    const pedido = ponte(
      alvo.continuation
        ? { clientVersion: CLIENT.clientVersion, continuation: alvo.continuation }
        : { query: alvo.query, clientVersion: CLIENT.clientVersion, params: VIDEO_ONLY },
    );
    if (!signal) return pedido;
    // O IPC não leva o AbortSignal. Quem cancelou deixa de esperar aqui; o
    // pedido que ficou a caminho resolve-se sozinho e ninguém o lê.
    return Promise.race([
      pedido,
      new Promise((_resolver, rejeitar) => {
        if (signal.aborted) return rejeitar(new Error('Aborted'));
        signal.addEventListener('abort', () => rejeitar(new Error('Aborted')), { once: true });
      }),
    ]);
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.youtube.com',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': CLIENT.clientVersion,
    },
    body: JSON.stringify(
      alvo.continuation
        ? { context: { client: CLIENT }, continuation: alvo.continuation }
        : { context: { client: CLIENT }, query: alvo.query, params: VIDEO_ONLY },
    ),
  });
  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  return res.json();
}

/** Uma página, com o token para pedir a seguinte quando existe. */
export interface PaginaDePesquisa {
  resultados: FreeSearchResult[];
  /** `null` quando o YouTube não ofereceu mais nada. */
  continuacao: string | null;
}

async function pedirPagina(
  alvo: { query?: string; continuation?: string },
  signal?: AbortSignal,
): Promise<PaginaDePesquisa> {
  const renderers: any[] = [];
  const corpo = await pedirAoYouTube(alvo, signal);
  // A primeira página vem em `contents`; as seguintes em
  // `onResponseReceivedCommands`. Exigir `contents` rejeitava toda a página 2.
  if (!corpo?.contents && !corpo?.onResponseReceivedCommands) {
    throw new Error('Unexpected search response.');
  }
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

  return { resultados: out, continuacao: procurarContinuacao(corpo) };
}

/**
 * A primeira página, com o canal de cada resultado.
 *
 * Assinatura inalterada de propósito: quem a usa para EMPARELHAR uma faixa
 * conhecida (a importação do Spotify, a descoberta) quer o primeiro resultado
 * de uma pesquisa exacta, não uma lista mais longa.
 */
export async function searchYouTubeFreeWithChannel(query: string, signal?: AbortSignal): Promise<FreeSearchResult[]> {
  return (await pedirPagina({ query }, signal)).resultados;
}

/** A primeira página, com o token para continuar. Para a caixa de pesquisa. */
export function pesquisarPaginaFree(query: string, signal?: AbortSignal): Promise<PaginaDePesquisa> {
  return pedirPagina({ query }, signal);
}

/**
 * A página seguinte.
 *
 * Sem isto a app via só os primeiros ~20 resultados e não havia "ver mais":
 * uma faixa que caísse em 21.º ao procurar pelo nome do artista era
 * inalcançável, mesmo estando no YouTube.
 */
export function continuarPesquisaFree(continuacao: string, signal?: AbortSignal): Promise<PaginaDePesquisa> {
  return pedirPagina({ continuation: continuacao }, signal);
}

/** Só as faixas da primeira página. */
export async function searchYouTubeFree(query: string, signal?: AbortSignal): Promise<Track[]> {
  return (await searchYouTubeFreeWithChannel(query, signal)).map((r) => r.track);
}

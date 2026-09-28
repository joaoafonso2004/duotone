import { lerMixDaResposta } from '../lib/mixDoYouTube';
import type { YtPlaylistItem } from '../types';
import { CLIENT } from './ytSearchFree';

const ENDPOINT = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false';
const PRAZO_MS = 15_000;

/**
 * As músicas de um Mix do YouTube (28/9). Ver `lib/mixDoYouTube.ts` para o porquê.
 *
 * No PC vai pelo processo principal (`yt:mix`): a janela não pode pedir a outro
 * site. No iPhone o `fetch` é nativo e não tem CORS. Falhar diz que não se leu,
 * em inglês e sem jargão -- a mensagem chega ao ecrã de importação.
 */
export async function lerMixDoYouTube(idDaLista: string): Promise<{ titulo: string; itens: YtPlaylistItem[] }> {
  let resposta: unknown;
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerMixDoYouTube : undefined;
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), PRAZO_MS);
  try {
    if (ponte) {
      resposta = await ponte({ playlistId: idDaLista, clientVersion: CLIENT.clientVersion });
    } else {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controlo.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': CLIENT.clientVersion,
        },
        body: JSON.stringify({ context: { client: CLIENT }, playlistId: idDaLista }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resposta = await res.json();
    }
  } catch {
    throw new Error('Could not read this mix. Check your connection and try again.');
  } finally {
    clearTimeout(prazo);
  }
  const mix = lerMixDaResposta(resposta);
  if (!mix) throw new Error('This mix has no songs we can read.');
  return mix;
}

import { lerMixDaResposta, MIX_ATE, novasDaVolta } from '../lib/mixDoYouTube';
import type { YtPlaylistItem } from '../types';
import { CLIENT } from './ytSearchFree';

const ENDPOINT = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false';
const PRAZO_MS = 15_000;

/** Um pedido ao `next`: a primeira volta só com o Mix, as seguintes a partir de uma música. */
async function pedirVolta(idDaLista: string, videoId?: string): Promise<unknown> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerMixDoYouTube : undefined;
  if (ponte) return ponte({ playlistId: idDaLista, clientVersion: CLIENT.clientVersion, ...(videoId ? { videoId } : {}) });
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), PRAZO_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controlo.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': CLIENT.clientVersion,
      },
      body: JSON.stringify({ context: { client: CLIENT }, playlistId: idDaLista, ...(videoId ? { videoId } : {}) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * As músicas de um Mix do YouTube (28/9). Ver `lib/mixDoYouTube.ts` para o porquê.
 *
 * No PC vai pelo processo principal (`yt:mix`): a janela não pode pedir a outro
 * site. No iPhone o `fetch` é nativo e não tem CORS. Falhar diz que não se leu,
 * em inglês e sem jargão -- a mensagem chega ao ecrã de importação.
 *
 * Desde 29/9 não fica na primeira volta (~25): pede as seguintes a partir da
 * última música, até `MIX_ATE`. Uma volta seguinte que falhe não estraga nada:
 * fica o que já se leu.
 */
export async function lerMixDoYouTube(idDaLista: string): Promise<{ titulo: string; itens: YtPlaylistItem[] }> {
  let primeira: unknown;
  try {
    primeira = await pedirVolta(idDaLista);
  } catch {
    throw new Error('Could not read this mix. Check your connection and try again.');
  }
  const mix = lerMixDaResposta(primeira);
  if (!mix) throw new Error('This mix has no songs we can read.');

  const itens = [...mix.itens];
  for (let pedidos = 1; pedidos < MIX_ATE.pedidos && itens.length < MIX_ATE.musicas; pedidos++) {
    let novas: YtPlaylistItem[];
    try {
      novas = novasDaVolta(itens, await pedirVolta(idDaLista, itens[itens.length - 1]!.videoId));
    } catch {
      break;
    }
    if (!novas.length) break;
    itens.push(...novas.slice(0, MIX_ATE.musicas - itens.length));
  }
  return { titulo: mix.titulo, itens };
}

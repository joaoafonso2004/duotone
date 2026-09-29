import type { YtPlaylistItem } from '../types';

/**
 * Um Mix do YouTube (28/9): uma lista que começa por `RD` -- o Mix de um vídeo
 * (`RD<videoId>`), o "My Mix" (`RDMM`) ou as listas do YouTube Music
 * (`RDCLAK…`). Não são playlists para a Data API, que responde 404, e por isso
 * a importação por link falhava a um amigo do João que tinha um guardado.
 *
 * Lêem-se pelo `next` do InnerTube (o que o site pede ao abrir o Mix), que traz
 * a primeira volta: ~25 músicas. Um Mix é "infinito" -- o YouTube vai gerando
 * mais --, e a primeira volta é a que se vê. Só o que se lê da resposta; quem
 * pede é o `api/youtubeMix.ts`. Sem imports de runtime: testável em Node.
 */

/**
 * Até onde se lê um Mix (29/9). A primeira volta são ~25; pedir outra a partir
 * da última música traz a janela seguinte (umas 10 a 15 novas de cada vez). Um
 * Mix não acaba, por isso há teto de músicas e de pedidos, e pára-se quando uma
 * volta já não traz nada novo.
 */
export const MIX_ATE = { musicas: 100, pedidos: 8 } as const;

/** As músicas de uma volta seguinte que ainda não estão na lista. */
export function novasDaVolta(jaLidas: readonly YtPlaylistItem[], resposta: unknown): YtPlaylistItem[] {
  const vistas = new Set(jaLidas.map((i) => i.videoId));
  return (lerMixDaResposta(resposta)?.itens ?? []).filter((i) => !vistas.has(i.videoId));
}

/** A forma de um id de Mix. Validada também no processo principal do PC. */
export const FORMA_DO_MIX = /^RD[\w-]{2,80}$/;

export function eMix(idDaLista: string | null | undefined): boolean {
  return !!idDaLista && FORMA_DO_MIX.test(idDaLista);
}

// O título do Mix vem como string simples; o das músicas em `simpleText` ou `runs`.
const texto = (t: any): string =>
  typeof t === 'string' ? t
    : typeof t?.simpleText === 'string' ? t.simpleText
    : Array.isArray(t?.runs) ? t.runs.map((r: any) => (typeof r?.text === 'string' ? r.text : '')).join('')
      : '';

/** O título e as músicas de uma resposta do `next`, ou `null` se não trouxer Mix. */
export function lerMixDaResposta(resposta: unknown): { titulo: string; itens: YtPlaylistItem[] } | null {
  const lista = (resposta as any)?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
  if (!lista || !Array.isArray(lista.contents)) return null;
  const vistos = new Set<string>();
  const itens: YtPlaylistItem[] = [];
  for (const entrada of lista.contents) {
    const v = entrada?.playlistPanelVideoRenderer;
    const videoId = typeof v?.videoId === 'string' ? v.videoId : '';
    if (!/^[\w-]{11}$/.test(videoId) || vistos.has(videoId)) continue;
    const titulo = texto(v.title).trim();
    if (!titulo) continue; // "vídeo indisponível" vem sem título
    vistos.add(videoId);
    itens.push({
      videoId,
      title: titulo,
      channel: texto(v.shortBylineText).trim() || texto(v.longBylineText).trim(),
      // A miniatura pelo id, sem os parâmetros assinados que a resposta traz.
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }
  if (itens.length === 0) return null;
  return { titulo: texto(lista.title).trim() || 'YouTube mix', itens };
}

import { criarRenovacao, resolveYouTubeStream, type YtStream } from '../api/ytstream';
import { evitarOpusPara } from './codecDeAudio';
import { OPUS_INVALIDO } from './converterOpus';
import { DOWNLOAD_ABORTED, downloadProgressiveAudio, type DownloadOptions } from './youtubeCache';

/**
 * Resolver e descarregar uma faixa, com o recuo do Opus -- o bocado que o
 * Smart Cache, os downloads pedidos e a Daily mix partilham. O motor (a faixa
 * que toca) tem o seu, dentro do YouTubePlayerView, por causa dos prazos e do
 * HLS.
 *
 * Se o resolvedor escolheu Opus e o WebM que chegou não se sabe converter
 * (`OPUS_INVALIDO`), essa faixa passa a ser AAC até a app fechar e o download
 * repete-se UMA vez, já em AAC. A renovação de URL vai sempre no formato do
 * stream que se está a descarregar (`criarRenovacao(..., stream.formato)`).
 *
 * `uri` é `null` quando só há HLS: não há ficheiro para guardar.
 */
export async function resolverEDescarregar(
  videoId: string,
  quality: 'high' | 'saver',
  duracaoDaFaixa: number | null,
  opts: Omit<DownloadOptions, 'renewUrl'>,
  aoResolver?: (stream: YtStream) => void,
): Promise<{ uri: string | null; stream: YtStream }> {
  const descarregar = async (stream: YtStream) => {
    aoResolver?.(stream);
    if (stream.isHls) return null;
    if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
    return downloadProgressiveAudio(
      videoId,
      stream.url,
      stream.contentLength,
      duracaoDaFaixa || stream.durationSeconds || null,
      { ...opts, renewUrl: criarRenovacao(videoId, quality, stream.formato ?? 'aac') },
    );
  };

  const stream = await comPrazoDeResolucao(resolveYouTubeStream(videoId, quality));
  try {
    return { uri: await descarregar(stream), stream };
  } catch (erro) {
    if (!eConversaoDoOpus(erro) || opts.shouldAbort?.()) throw erro;
    evitarOpusPara(videoId);
    const aac = await comPrazoDeResolucao(resolveYouTubeStream(videoId, quality, false, 'aac'));
    return { uri: await descarregar(aac), stream: aac };
  }
}

/**
 * Quanto uma resolução pode demorar aqui (27/9, revisão do Codex). O leitor
 * já prendia a SUA resolução a 40 s, mas esta função serve também os
 * adiantamentos do Smart Cache e os caminhos de recuperação, e aí esperava sem
 * limite: um adiantamento pendurado segurava a preparação das seguintes.
 */
export const PRAZO_DA_RESOLUCAO_MS = 30_000;
export const RESOLUCAO_SEM_RESPOSTA = 'resolucao sem resposta';
function comPrazoDeResolucao<T>(p: Promise<T>): Promise<T> {
  let prazo: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, rejeitar) => {
      prazo = setTimeout(() => rejeitar(new Error(RESOLUCAO_SEM_RESPOSTA)), PRAZO_DA_RESOLUCAO_MS);
    }),
  ]).finally(() => clearTimeout(prazo));
}

/** O WebM do Opus não se converteu (e não foi a rede nem um cancelamento). */
export function eConversaoDoOpus(erro: unknown): boolean {
  return erro instanceof Error && erro.message.startsWith(OPUS_INVALIDO);
}

/**
 * Resolve um URL de stream tocável para um vídeo do YouTube, para que o áudio
 * possa tocar num player NATIVO (background + lock screen), como fazem o Demus
 * e o Musi.
 *
 * IMPORTANTE (regra do projeto): isto usa a API interna (InnerTube) do YouTube
 * e contorna o player oficial. Viola os Termos do YouTube — é aceitável APENAS
 * porque esta app é de uso pessoal e não vai à App Store. Se a extração falhar
 * (ex.: vídeo com idade/região, ou live), o player cai automaticamente no
 * WebView oficial (ver YouTubePlayerView).
 *
 * LIMITAÇÃO CONHECIDA E CONFIRMADA (jul/2026): um pedido próprio ao InnerTube
 * (feito aqui, sem PO Token — o "Proof of Origin" que a Google exige nos
 * servidores de vídeo para desbloquear o stream completo) só dá acesso a
 * ~1.000.000 bytes CUMULATIVOS por vídeo/IP — depois disso, TODO pedido
 * seguinte falha com 403, seja qual for o tamanho do pedaço, o espaçamento
 * entre pedidos, ou mesmo um URL assinado completamente novo. Confirmado por
 * teste direto: não é contornável por código. 1MB ronda os 20-30s de áudio —
 * insuficiente para uma música inteira.
 *
 * Por isso o YouTubePlayerView tenta PRIMEIRO o `YtStreamHarvester` (WebView
 * invisível que deixa a página real do YouTube pedir os dados dela própria,
 * com o token de origem genuíno que ela sabe gerar) e só usa o
 * `resolveYouTubeStream` daqui como recurso secundário. Ver
 * YtStreamHarvester.tsx para o porquê e o mecanismo.
 *
 * Estratégia deste ficheiro (quando usado como fallback):
 *  - Cliente IOS (versão da app real) devolve streams SEM cifra.
 *  - Se houver `hlsManifestUrl` (m3u8), usa-se — não sofre do limite de 1MB
 *    (confirmado), mas raro em vídeos normais (mais comum em diretos).
 *  - Senão, o áudio mp4 (AAC) só dá para os primeiros ~20-30s antes de
 *    começar a falhar — não usar como fonte fiável de faixa inteira.
 *
 * NOTA sobre o header User-Agent: o iOS trata "User-Agent" como header
 * reservado pela URL Loading System e pode ignorá-lo/substituí-lo em pedidos
 * feitos por fetch() — confirmado que a API do InnerTube não precisa dele
 * (valida o cliente pelo corpo JSON + X-YouTube-Client-*), por isso não o
 * definimos aqui (seria ineficaz e só gerava confusão).
 *
 * NOTA: a versão do cliente iOS envelhece. Se um dia parar de resolver (HTTP
 * 400 "Precondition check failed"), atualizar IOS_CLIENT.clientVersion para a
 * versão atual da app do YouTube para iOS.
 */

// Chave InnerTube pública/conhecida (vai embutida na app iOS; não é segredo).
const INNERTUBE_KEY = 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc';
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`;

const IOS_CLIENT = {
  clientName: 'IOS',
  clientNumber: '5',
  clientVersion: '20.10.4',
  deviceMake: 'Apple',
  deviceModel: 'iPhone16,2',
  osName: 'iPhone',
  osVersion: '18.1.0.22B83',
};

export interface YtStream {
  /** URL tocável no AVPlayer (m3u8 HLS) ou a descarregar aos pedaços (mp4). */
  url: string;
  isHls: boolean;
  /** epoch ms em que o URL expira (HLS renova sozinho; mp4 ~6h). */
  expiresAt: number;
  /** Tamanho total em bytes do mp4 (null para HLS — não se aplica). */
  contentLength: number | null;
}

// Cache em memória (por sessão) — os URLs expiram, não vale a pena persistir.
const memo = new Map<string, YtStream>();

/** Limpa o cache de URLs resolvidos (usado pelo "Clear cache" das Definições). */
export function clearStreamMemo(): void {
  memo.clear();
}

/** Melhor áudio mp4/AAC com URL direto (o AVPlayer não toca webm/opus).
 * `preferLowBitrate` poupa dados (modo "Data saver" das Definições). */
function pickMp4Audio(
  streamingData: any,
  preferLowBitrate: boolean
): { url: string; contentLength: number | null } | null {
  const formats: any[] = [
    ...(streamingData?.adaptiveFormats ?? []),
    ...(streamingData?.formats ?? []),
  ];
  const aac = formats
    .filter((f) => f.url && String(f.mimeType ?? '').startsWith('audio/mp4'))
    .sort((a, b) =>
      preferLowBitrate ? (a.bitrate ?? 0) - (b.bitrate ?? 0) : (b.bitrate ?? 0) - (a.bitrate ?? 0)
    );
  if (aac[0]?.url) {
    return { url: aac[0].url, contentLength: Number(aac[0].contentLength) || null };
  }

  // último recurso: progressivo muxed mp4 com URL direto
  const muxedMp4 = (streamingData?.formats ?? []).find(
    (f: any) => f.url && String(f.mimeType ?? '').includes('mp4')
  );
  if (!muxedMp4) return null;
  return {
    url: muxedMp4.url,
    contentLength: Number(muxedMp4.contentLength) || null,
  };
}

/** Constrói um YtStream a partir de uma resposta /youtubei/v1/player já obtida
 * — reutilizado tanto pelo pedido próprio (abaixo) como pelo YtStreamHarvester
 * (que captura a resposta GENUÍNA que a própria página do YouTube pede,
 * assinada com o token de origem dela — ver YtStreamHarvester.tsx). */
export function streamFromPlayerResponse(
  data: any,
  quality: 'high' | 'saver' = 'high'
): YtStream {
  const status = data?.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(data?.playabilityStatus?.reason || `Not playable (${status})`);
  }

  const sd = data?.streamingData;
  if (!sd) throw new Error('No streamingData');

  if (sd.hlsManifestUrl) {
    return {
      url: sd.hlsManifestUrl,
      isHls: true,
      expiresAt: Date.now() + 5 * 60 * 60 * 1000,
      contentLength: null,
    };
  }

  const picked = pickMp4Audio(sd, quality === 'saver');
  if (!picked) throw new Error('No AVPlayer-compatible stream found');

  const expireSec = Number(sd.expiresInSeconds ?? 18000);
  return {
    url: picked.url,
    isHls: false,
    expiresAt: Date.now() + expireSec * 1000,
    contentLength: picked.contentLength,
  };
}

export async function resolveYouTubeStream(
  videoId: string,
  quality: 'high' | 'saver' = 'high'
): Promise<YtStream> {
  const cacheKey = `${videoId}:${quality}`;
  const cached = memo.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const res = await fetch(PLAYER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': IOS_CLIENT.clientNumber,
      'X-YouTube-Client-Version': IOS_CLIENT.clientVersion,
    },
    body: JSON.stringify({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: IOS_CLIENT.clientName,
          clientVersion: IOS_CLIENT.clientVersion,
          deviceMake: IOS_CLIENT.deviceMake,
          deviceModel: IOS_CLIENT.deviceModel,
          osName: IOS_CLIENT.osName,
          osVersion: IOS_CLIENT.osVersion,
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  const data = await res.json();

  const stream = streamFromPlayerResponse(data, quality);
  memo.set(cacheKey, stream);
  return stream;
}

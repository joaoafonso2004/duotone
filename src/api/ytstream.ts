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
 * Estratégia (validada contra o YouTube em jul/2026):
 *  - Cliente IOS (versão da app real) devolve streams SEM cifra nem PoToken.
 *  - Se houver `hlsManifestUrl` (m3u8), usa-se — adaptativo, ideal no AVPlayer.
 *  - Senão, escolhe-se o melhor áudio `audio/mp4` (AAC) dos adaptiveFormats.
 *    IMPORTANTE: estes URLs `googlevideo.com` respondem 403 a um GET simples
 *    E a um Range que cubra a maior parte do ficheiro (proteção anti-download
 *    do CDN) — só aceitam Range pequenos (testado: ~1MB OK, ~2.2MB de um
 *    ficheiro de 4.4MB já dá 403). Por isso expomos `contentLength`, para o
 *    YouTubePlayerView poder descarregar aos pedaços (ver downloadProgressive
 *    Audio nesse ficheiro) em vez de entregar o URL direto ao AVPlayer.
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

  const status = data?.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(data?.playabilityStatus?.reason || `Not playable (${status})`);
  }

  const sd = data?.streamingData;
  if (!sd) throw new Error('No streamingData');

  // 1) HLS quando disponível (adaptativo).
  if (sd.hlsManifestUrl) {
    const stream: YtStream = {
      url: sd.hlsManifestUrl,
      isHls: true,
      expiresAt: Date.now() + 5 * 60 * 60 * 1000,
      contentLength: null,
    };
    memo.set(cacheKey, stream);
    return stream;
  }

  // 2) Áudio mp4 direto (caso típico dos music videos / Vevo).
  const picked = pickMp4Audio(sd, quality === 'saver');
  if (!picked) throw new Error('No AVPlayer-compatible stream found');

  const expireSec = Number(sd.expiresInSeconds ?? 18000);
  const stream: YtStream = {
    url: picked.url,
    isHls: false,
    expiresAt: Date.now() + expireSec * 1000,
    contentLength: picked.contentLength,
  };
  memo.set(cacheKey, stream);
  return stream;
}

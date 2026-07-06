/**
 * Resolve um URL de stream tocável para um vídeo do YouTube, para que o áudio
 * possa tocar num player NATIVO (background + lock screen), como fazem o Demus
 * e o Musi.
 *
 * IMPORTANTE (regra do projeto): isto usa a API interna (InnerTube) do YouTube
 * e contorna o player oficial. Viola os Termos do YouTube — é aceitável APENAS
 * porque esta app é de uso pessoal e não vai à App Store. Se a extração falhar,
 * o player cai automaticamente no WebView oficial (ver YouTubePlayerView).
 */

const INNERTUBE_URL =
  'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

// Cliente iOS do YouTube: costuma devolver hlsManifestUrl sem cifra nem PoToken.
const IOS = {
  clientName: 'IOS',
  clientVersion: '19.45.4',
  deviceModel: 'iPhone16,2',
  osVersion: '18.1.0.22B83',
  userAgent:
    'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)',
};

export interface YtStream {
  /** URL tocável no player nativo (HLS .m3u8 ou progressivo). */
  url: string;
  /** true = manifesto HLS adaptativo; false = ficheiro progressivo único. */
  isHls: boolean;
  /** quando o URL progressivo expira (epoch ms); HLS não expira desta forma. */
  expiresAt: number;
}

// Cache em memória (por sessão) — os URLs do YouTube expiram (~6h), por isso
// não vale a pena persistir. Evita re-resolver ao voltar à mesma faixa.
const memo = new Map<string, YtStream>();

function pickAudioUrl(streamingData: any): string | null {
  const formats: any[] = [
    ...(streamingData?.adaptiveFormats ?? []),
    ...(streamingData?.formats ?? []),
  ];
  // Melhor faixa só-de-áudio com URL direto (sem signatureCipher).
  const audioOnly = formats
    .filter((f) => f.url && String(f.mimeType ?? '').startsWith('audio/'))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  if (audioOnly[0]?.url) return audioOnly[0].url;

  // Fallback: qualquer formato progressivo muxed com URL direto.
  const muxed = (streamingData?.formats ?? []).find((f: any) => f.url);
  return muxed?.url ?? null;
}

export async function resolveYouTubeStream(videoId: string): Promise<YtStream> {
  const cached = memo.get(videoId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const res = await fetch(INNERTUBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': IOS.userAgent,
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': IOS.clientVersion,
    },
    body: JSON.stringify({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: IOS.clientName,
          clientVersion: IOS.clientVersion,
          deviceModel: IOS.deviceModel,
          osName: 'iOS',
          osVersion: IOS.osVersion,
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`InnerTube ${res.status}`);
  const data = await res.json();

  const status = data?.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(
      data?.playabilityStatus?.reason || `Video not playable (${status})`
    );
  }

  const sd = data?.streamingData;
  if (!sd) throw new Error('No streamingData in response');

  // HLS é o ideal: adaptativo, sem cifra, ótimo no AVPlayer.
  if (sd.hlsManifestUrl) {
    const stream: YtStream = {
      url: sd.hlsManifestUrl,
      isHls: true,
      expiresAt: Date.now() + 5 * 60 * 60 * 1000,
    };
    memo.set(videoId, stream);
    return stream;
  }

  const url = pickAudioUrl(sd);
  if (!url) throw new Error('No direct stream URL (may require PoToken)');

  const expireSec = Number(sd.expiresInSeconds ?? 18000);
  const stream: YtStream = {
    url,
    isHls: false,
    expiresAt: Date.now() + expireSec * 1000,
  };
  memo.set(videoId, stream);
  return stream;
}

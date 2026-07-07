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
 *  - Senão, escolhe-se o melhor áudio `audio/mp4` (AAC) dos adaptiveFormats. O
 *    URL responde 206 a GET+Range (que é como o AVPlayer pede), logo toca. O
 *    HEAD dá 403, mas isso é irrelevante para a reprodução.
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
  /** URL tocável no AVPlayer (m3u8 HLS ou mp4 progressivo). */
  url: string;
  isHls: boolean;
  /** epoch ms em que o URL expira (HLS renova sozinho; mp4 ~6h). */
  expiresAt: number;
}

// Cache em memória (por sessão) — os URLs expiram, não vale a pena persistir.
const memo = new Map<string, YtStream>();

/** Melhor áudio mp4/AAC com URL direto (o AVPlayer não toca webm/opus). */
function pickMp4Audio(streamingData: any): string | null {
  const formats: any[] = [
    ...(streamingData?.adaptiveFormats ?? []),
    ...(streamingData?.formats ?? []),
  ];
  const aac = formats
    .filter((f) => f.url && String(f.mimeType ?? '').startsWith('audio/mp4'))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  if (aac[0]?.url) return aac[0].url;

  // último recurso: progressivo muxed mp4 com URL direto
  const muxedMp4 = (streamingData?.formats ?? []).find(
    (f: any) => f.url && String(f.mimeType ?? '').includes('mp4')
  );
  return muxedMp4?.url ?? null;
}

export async function resolveYouTubeStream(videoId: string): Promise<YtStream> {
  const cached = memo.get(videoId);
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
    };
    memo.set(videoId, stream);
    return stream;
  }

  // 2) Áudio mp4 direto (caso típico dos music videos / Vevo).
  const url = pickMp4Audio(sd);
  if (!url) throw new Error('No AVPlayer-compatible stream found');

  const expireSec = Number(sd.expiresInSeconds ?? 18000);
  const stream: YtStream = {
    url,
    isHls: false,
    expiresAt: Date.now() + expireSec * 1000,
  };
  memo.set(videoId, stream);
  return stream;
}

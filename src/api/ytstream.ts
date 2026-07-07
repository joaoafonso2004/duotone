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
 * PO TOKEN (potProvider.ts): se houver um servidor bgutil-ytdlp-pot-provider
 * configurado nas Definições, pedimos-lhe um PO Token GVS ligado ao
 * `visitorData` desta resposta e anexamo-lo ao URL mp4 como `?pot=...` —
 * é isto que remove o limite de ~1MB (ver GUIA-POT-TOKEN.md). Sem servidor
 * configurado, `fetchGvsPoToken` devolve `null` e o comportamento é
 * exatamente o de antes.
 *
 * NOTA sobre o header User-Agent: o iOS trata "User-Agent" como header
 * reservado pela URL Loading System e pode ignorá-lo/substituí-lo em pedidos
 * feitos por fetch() — confirmado que a API do InnerTube não precisa dele
 * (valida o cliente pelo corpo JSON + X-YouTube-Client-*), por isso não o
 * definimos aqui (seria ineficaz e só gerava confusão).
 *
 * ESTRATÉGIA DE CLIENTES (jul/2026): o cliente `IOS` EXIGE PO Token e por
 * isso limita o mp4 a ~1MB. A solução que o yt-dlp e o NewPipe usam não é
 * lutar contra o BotGuard, mas sim pedir os dados com um cliente que a Google
 * NÃO obriga a PO Token. Tentamos em cascata (o "clientName" é só uma etiqueta
 * no corpo do pedido — a app continua nativa iOS; ver conversa com o
 * utilizador):
 *   1. ANDROID_VR — o cliente da app de YouTube dos óculos Oculus Quest. NÃO
 *      exige PO Token, devolve áudio mp4/m4a direto sem o limite de 1MB.
 *      Limitação: vídeos "para crianças"/com restrição de idade indisponíveis.
 *   2. WEB (Safari) — devolve HLS (m3u8) que também não exige PO Token e não
 *      sofre do limite; bom para os casos que o ANDROID_VR recusa.
 *   3. IOS + PO Token — só se os anteriores falharem, tenta o caminho antigo
 *      (com PoToken on-device do BotGuardMinter, se disponível).
 * Se tudo falhar, o YouTubePlayerView cai no embed visível como sempre.
 *
 * NOTA: as versões dos clientes envelhecem. Se um parar de resolver (HTTP 400
 * "Precondition check failed"), atualizar o clientVersion respetivo.
 */

import { fetchGvsPoToken } from './potProvider';

// Chave InnerTube pública/conhecida (não é segredo; vai embutida nas apps).
const INNERTUBE_KEY = 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc';
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`;

// Cliente principal: não exige PO Token (ver acima). Valores do yt-dlp.
const ANDROID_VR_CLIENT = {
  clientName: 'ANDROID_VR',
  clientNumber: '28',
  clientVersion: '1.65.10',
  deviceMake: 'Oculus',
  deviceModel: 'Quest 3',
  osName: 'Android',
  osVersion: '12L',
  androidSdkVersion: 32,
  userAgent:
    'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
};

// Cliente secundário: dá HLS (m3u8), também sem PO Token.
const WEB_SAFARI_CLIENT = {
  clientName: 'WEB',
  clientNumber: '1',
  clientVersion: '2.20260114.08.00',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)',
};

// Último recurso (caminho antigo): exige PO Token para o mp4 completo.
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
  /** Diagnóstico: `?pot=...` foi mesmo anexado ao URL (ver potProvider.ts). */
  hasPoToken?: boolean;
  /** Diagnóstico: que cliente InnerTube produziu este stream (ANDROID_VR/WEB/IOS). */
  client?: string;
  /** Diagnóstico: se caiu para o IOS, porque falharam os clientes sem PO Token. */
  resolverNote?: string;
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

type InnerTubeClient = {
  clientName: string;
  clientNumber: string;
  clientVersion: string;
  deviceMake?: string;
  deviceModel?: string;
  osName?: string;
  osVersion?: string;
  androidSdkVersion?: number;
  userAgent?: string;
};

// visitorData: identificador de sessão que reduz a deteção de bots ("Sign in
// to confirm you're not a bot") — mitigação documentada pelo NewPipe/yt-dlp
// para o 403/LOGIN_REQUIRED dos clientes sem PO Token. Obtido uma vez por
// sessão e reutilizado.
let visitorDataCache: string | null = null;
async function getVisitorData(): Promise<string | null> {
  if (visitorDataCache) return visitorDataCache;
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/visitor_id?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: { clientName: 'WEB', clientVersion: WEB_SAFARI_CLIENT.clientVersion, hl: 'en', gl: 'US' },
          },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    visitorDataCache = data?.responseContext?.visitorData ?? null;
    return visitorDataCache;
  } catch {
    return null;
  }
}

/** Faz um pedido /player com um cliente específico e devolve a resposta JSON
 * (ou lança em erro HTTP). Isolado para a cascata em resolveYouTubeStream. */
async function requestPlayer(
  videoId: string,
  client: InnerTubeClient,
  visitorData?: string | null
): Promise<any> {
  const clientContext: Record<string, any> = {
    clientName: client.clientName,
    clientVersion: client.clientVersion,
    hl: 'en',
    gl: 'US',
  };
  if (client.deviceMake) clientContext.deviceMake = client.deviceMake;
  if (client.deviceModel) clientContext.deviceModel = client.deviceModel;
  if (client.osName) clientContext.osName = client.osName;
  if (client.osVersion) clientContext.osVersion = client.osVersion;
  if (client.androidSdkVersion) clientContext.androidSdkVersion = client.androidSdkVersion;
  if (visitorData) clientContext.visitorData = visitorData;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-YouTube-Client-Name': client.clientNumber,
    'X-YouTube-Client-Version': client.clientVersion,
  };
  if (client.userAgent) headers['User-Agent'] = client.userAgent;
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  const res = await fetch(PLAYER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: { client: clientContext },
    }),
  });

  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status} (${client.clientName})`);
  return res.json();
}

export async function resolveYouTubeStream(
  videoId: string,
  quality: 'high' | 'saver' = 'high'
): Promise<YtStream> {
  const cacheKey = `${videoId}:${quality}`;
  const cached = memo.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const errors: string[] = [];

  // visitorData reduz o "Sign in to confirm you're not a bot" que o ANDROID_VR
  // apanha em IPs marcados (ex.: 4G partilhado). Obtido uma vez por sessão.
  const visitorData = await getVisitorData();

  // ANDROID_VR — não exige PO Token e dá áudio mp4 direto sem o limite de 1MB.
  // (O cliente WEB via /player devolve sempre "Video unavailable" sem o
  // contexto completo da página, por isso não vale a pena tentá-lo aqui.)
  try {
    const data = await requestPlayer(videoId, ANDROID_VR_CLIENT, visitorData);
    const stream = streamFromPlayerResponse(data, quality);
    stream.client = ANDROID_VR_CLIENT.clientName + (visitorData ? '+vd' : '');
    memo.set(cacheKey, stream);
    return stream;
  } catch (e: any) {
    errors.push(`${ANDROID_VR_CLIENT.clientName}: ${e?.message ?? String(e)}`);
  }

  // Último recurso: IOS + PO Token (on-device, se disponível). Só chega aqui
  // se o ANDROID_VR falhar (ex.: bloqueio de bot no IP, ou restrição de idade).
  const data = await requestPlayer(videoId, IOS_CLIENT, visitorData).catch((e: any) => {
    throw new Error(`todos os clientes falharam: ${errors.join(' | ')} | IOS: ${e?.message ?? e}`);
  });
  const stream = streamFromPlayerResponse(data, quality);
  stream.client = 'IOS';
  stream.resolverNote = errors.join(' | ');

  if (!stream.isHls) {
    const visitorData = data?.responseContext?.visitorData;
    if (visitorData) {
      const poToken = await fetchGvsPoToken(visitorData);
      if (poToken) {
        const sep = stream.url.includes('?') ? '&' : '?';
        stream.url = `${stream.url}${sep}pot=${encodeURIComponent(poToken)}`;
        stream.hasPoToken = true;
      }
    }
  }

  memo.set(cacheKey, stream);
  return stream;
}

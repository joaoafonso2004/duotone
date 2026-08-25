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
 *      exige PO Token, devolve áudio mp4/m4a direto (URL SEM cifra) sem o
 *      limite de 1MB. Limitação: vídeos "para crianças" indisponíveis.
 *   2. ANDROID (+playerParams "CgIQBg==") — outra via sem cifra; o playerParams
 *      é o workaround anti-403 do NewPipe. Alternativa se o VR recusar.
 *   3. IOS + PO Token — só se os anteriores falharem, tenta o caminho antigo
 *      (com PoToken on-device do BotGuardMinter, se disponível).
 * Se tudo falhar, o YouTubePlayerView cai no embed visível como sempre.
 *
 * NOTA: valores dos clientes e detalhes do pedido (headers Origin/
 * accept-language, key vazia no android_vr, playerParams) copiados do
 * YouTubeKit (alexeichhorn/YouTubeKit), biblioteca iOS mantida em 2026 —
 * ordem de clientes deles: [androidVR, webSafari, web]. Não usamos WEB porque
 * devolve URLs CIFRADAS que exigiriam decifração de assinatura (que não
 * temos); os clientes android dão URLs diretas.
 *
 * NOTA: as versões dos clientes envelhecem. Se um parar de resolver (HTTP 400
 * "Precondition check failed"), atualizar o clientVersion respetivo.
 */

import { fetchGvsPoToken } from './potProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player';
const VISITOR_ENDPOINT = 'https://www.youtube.com/youtubei/v1/visitor_id';
// Chave só para o cliente WEB (usada em getVisitorData). Android/iOS não a usam.
const WEB_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

// CLIENTE PRINCIPAL (ago 2026): VISIONOS, o cliente do Apple Vision Pro.
//
// A 2 de agosto de 2026 a Google passou a exigir GVS PO Token ao ANDROID_VR
// (yt-dlp issue #17348) — era o último cliente sem essa exigência, e esta app
// estava toda assente nele. O yt-dlp 2026.08.19 mudou para VISIONOS, e é esse
// o caminho que se sabe funcionar hoje. Parâmetros copiados da definição do
// yt-dlp (`visionos` em extractor/youtube/_base.py), que marca
// REQUIRE_JS_PLAYER: False — ou seja URL direto, sem assinatura a decifrar.
//
// Verificado aqui em 25/ago/2026, 6 músicas em 6: playabilityStatus OK, dois
// formatos audio/mp4 com URL direto, e ficheiro COMPLETO descarregado
// (4-5,5MB) sem um único 403 — com e sem o header User-Agent, o que importa
// porque o iOS o ignora nos pedidos feitos por fetch().
const VISIONOS_CLIENT = {
  clientName: 'VISIONOS',
  clientNumber: '101',
  clientVersion: '1.02',
  apiKey: '',
  deviceMake: 'Apple',
  deviceModel: 'RealityDevice17,1',
  osName: 'visionOS',
  osVersion: '26.5.23O471',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

// Cliente antigo (ficou preso ao PO Token em 2/ago/2026, mantido como recurso
// caso a imposição seja revertida ou não se aplique a algum IP).
// Valores do
// YouTubeKit (key vazia — os clientes android não a precisam no URL).
const ANDROID_VR_CLIENT = {
  clientName: 'ANDROID_VR',
  clientNumber: '28',
  clientVersion: '1.65.10',
  apiKey: '',
  deviceMake: 'Oculus',
  deviceModel: 'Quest 3',
  osName: 'Android',
  osVersion: '12L',
  androidSdkVersion: 32,
  userAgent:
    'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
};

// Cliente secundário: ANDROID normal com o playerParams anti-403 do NewPipe.
const ANDROID_CLIENT = {
  clientName: 'ANDROID',
  clientNumber: '3',
  clientVersion: '20.10.38',
  apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
  osName: 'Android',
  osVersion: '11',
  androidSdkVersion: 30,
  playerParams: 'CgIQBg==',
  userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
};

// Último recurso (caminho antigo): exige PO Token para o mp4 completo.
const IOS_CLIENT = {
  clientName: 'IOS',
  clientNumber: '5',
  clientVersion: '20.10.4',
  apiKey: '',
  deviceMake: 'Apple',
  deviceModel: 'iPhone16,2',
  osName: 'iPhone',
  osVersion: '18.1.0.22B83',
  userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
};

export interface YtStream {
  /** URL tocável no AVPlayer (m3u8 HLS) ou a descarregar aos pedaços (mp4). */
  url: string;
  isHls: boolean;
  expiresAt: number;
  contentLength: number | null;
  hasPoToken?: boolean;
  client?: string;
  resolverNote?: string;
  durationSeconds?: number | null;
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
    .sort((a, b) => {
      const bitA = a.bitrate ?? a.averageBitrate ?? 0;
      const bitB = b.bitrate ?? b.averageBitrate ?? 0;
      return preferLowBitrate ? bitA - bitB : bitB - bitA;
    });
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

  const durationSeconds = Number(data?.videoDetails?.lengthSeconds) || null;

  if (sd.hlsManifestUrl) {
    return {
      url: sd.hlsManifestUrl,
      isHls: true,
      expiresAt: Date.now() + 5 * 60 * 60 * 1000,
      contentLength: null,
      durationSeconds,
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
    durationSeconds,
  };
}

type InnerTubeClient = {
  clientName: string;
  clientNumber: string;
  clientVersion: string;
  apiKey?: string;
  deviceMake?: string;
  deviceModel?: string;
  osName?: string;
  osVersion?: string;
  androidSdkVersion?: number;
  playerParams?: string;
  userAgent?: string;
};

// visitorData: identificador de sessão que reduz a deteção de bots ("Sign in
// to confirm you're not a bot") — mitigação documentada pelo NewPipe/yt-dlp
// para o 403/LOGIN_REQUIRED dos clientes sem PO Token. Obtido uma vez por
// sessão e reutilizado. Persistido em AsyncStorage com TTL de 24h para evitar
// o pedido de rede extra em cada arranque da app (crítico em redes lentas).
const VD_KEY = 'yt_visitor_data';
const VD_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
let visitorDataCache: string | null = null;
async function getVisitorData(): Promise<string | null> {
  if (visitorDataCache) return visitorDataCache;
  // Tentar AsyncStorage primeiro (evita pedido de rede no primeiro arranque)
  try {
    const raw = await AsyncStorage.getItem(VD_KEY);
    if (raw) {
      const { value, expiresAt } = JSON.parse(raw);
      if (typeof value === 'string' && Date.now() < expiresAt) {
        visitorDataCache = value;
        return visitorDataCache;
      }
    }
  } catch {
    // Se o AsyncStorage falhar, continua para o pedido de rede
  }
  try {
    const res = await fetch(`${VISITOR_ENDPOINT}?key=${WEB_KEY}&prettyPrint=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://www.youtube.com' },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20260114.08.00', hl: 'en', gl: 'US' },
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    visitorDataCache = data?.responseContext?.visitorData ?? null;
    if (visitorDataCache) {
      AsyncStorage.setItem(
        VD_KEY,
        JSON.stringify({ value: visitorDataCache, expiresAt: Date.now() + VD_TTL_MS })
      ).catch(() => {});
    }
    return visitorDataCache;
  } catch {
    return null;
  }
}

/** Faz um pedido /player com um cliente específico e devolve a resposta JSON
 * (ou lança em erro HTTP). Detalhes do pedido (headers, key vazia, params)
 * copiados do YouTubeKit. Isolado para a cascata em resolveYouTubeStream. */
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
    Origin: 'https://www.youtube.com',
    'accept-language': 'en-US,en',
  };
  if (client.userAgent) headers['User-Agent'] = client.userAgent;
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  const body: Record<string, any> = {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    context: { client: clientContext },
  };
  if (client.playerParams) body.params = client.playerParams;

  // key vazia (android/ios) → não a metemos no URL (o cliente autentica-se
  // pelo contexto). Só o WEB é que precisa dela.
  const url = client.apiKey
    ? `${PLAYER_ENDPOINT}?key=${client.apiKey}&prettyPrint=false`
    : `${PLAYER_ENDPOINT}?prettyPrint=false`;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status} (${client.clientName})`);
  return res.json();
}

/**
 * Do manifesto HLS mestre, extrai a playlist SÓ DE ÁUDIO (#EXT-X-MEDIA com
 * TYPE=AUDIO). Sem isto o AVPlayer escolheria uma variante #EXT-X-STREAM-INF,
 * e TODAS elas trazem vídeo — gastava dados a descarregar imagem que a app
 * nunca mostra. Verificado: a rendition de áudio do itag 234 (AAC ~128kbps)
 * descarrega inteira, 38 segmentos, 3,31MB, sem um único 403.
 *
 * Devolve `null` se não houver rendition de áudio — nesse caso fica-se pelo
 * manifesto mestre, que toca na mesma (só gasta mais dados).
 */
async function pickAudioOnlyHls(masterUrl: string, preferLowBitrate: boolean): Promise<string | null> {
  try {
    const res = await fetch(masterUrl);
    if (!res.ok) return null;
    const text = await res.text();
    const medias = text
      .split('\n')
      .filter((l) => l.startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=AUDIO'))
      .map((l) => {
        const uri = /URI="([^"]+)"/.exec(l)?.[1] ?? null;
        const itag = uri ? (/\/itag\/(\d+)\//.exec(uri)?.[1] ?? null) : null;
        return { uri, itag };
      })
      .filter((x): x is { uri: string; itag: string | null } => !!x.uri);
    if (!medias.length) return null;
    // itag 234 = AAC ~128kbps; 233 é a de menor bitrate (modo poupança).
    const wanted = preferLowBitrate ? '233' : '234';
    return (medias.find((m) => m.itag === wanted) ?? medias[0]).uri;
  } catch {
    return null;
  }
}

/** Confirma que o CDN (googlevideo) aceita mesmo o URL, antes de o darmos
 * como bom. Devolve o status HTTP (0 se a rede falhou). Pede só 2 bytes. */
async function probeMediaUrl(url: string): Promise<number> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1' } });
    return res.status;
  } catch {
    return 0;
  }
}

/** Esquece o visitorData (memória + AsyncStorage). Se a Google marcar o
 * visitorData, o TTL de 24h mantinha-o preso e a app ficava partida até lá. */
export async function clearVisitorData(): Promise<void> {
  visitorDataCache = null;
  try {
    await AsyncStorage.removeItem(VD_KEY);
  } catch {
    // sem problema — o TTL trata do resto
  }
}

export async function resolveYouTubeStream(
  videoId: string,
  quality: 'high' | 'saver' = 'high',
  /** Ignora o memo e resolve de novo. Usado quando o CDN rejeita o URL que
   * está em cache (403): o memo guarda-o até 5h e sem isto a faixa ficava
   * presa a um URL morto durante todo esse tempo. */
  forceRefresh = false
): Promise<YtStream> {
  const cacheKey = `${videoId}:${quality}`;
  if (forceRefresh) memo.delete(cacheKey);
  const cached = forceRefresh ? undefined : memo.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const errors: string[] = [];

  // visitorData reduz o "Sign in to confirm you're not a bot" que o ANDROID_VR
  // apanha em IPs marcados (ex.: 4G partilhado). Obtido uma vez por sessão.
  const visitorData = await getVisitorData();

  // ORDEM (ago 2026): o IOS vem PRIMEIRO porque é o único que devolve
  // `hlsManifestUrl`, e o HLS NÃO sofre do teto de ~1MB cumulativos que mata o
  // mp4 progressivo. Verificado ponta a ponta: 342MB puxados por HLS sem um
  // único 403, e a rendition só de áudio dá a música inteira em 3,31MB. O
  // ANDROID_VR ficava a ganhar a cascata e prendia-nos ao caminho progressivo,
  // que é exatamente o que a Google está a cortar. Os android ficam como
  // recurso para quando não houver HLS.
  // O WEB continua fora: dá URLs cifradas (exigiriam decifrar assinatura) e,
  // testado, responde UNPLAYABLE fora de uma sessão de browser real.
  for (const client of [VISIONOS_CLIENT, IOS_CLIENT, ANDROID_VR_CLIENT, ANDROID_CLIENT]) {
    try {
      const data = await requestPlayer(videoId, client, visitorData);
      const stream = streamFromPlayerResponse(data, quality);
      if (stream.isHls) {
        const audioOnly = await pickAudioOnlyHls(stream.url, quality === 'saver');
        if (audioOnly) stream.url = audioOnly;
      }
      // O /player pode responder OK e o CDN rejeitar o URL na mesma com 403
      // (acontece em IPs marcados pela Google, ex.: 4G partilhado). Sem esta
      // sonda o cliente "ganhava" a cascata na mesma e o 403 só rebentava
      // mais tarde, no download — já fora deste try, ou seja, os clientes
      // seguintes nunca chegavam a ser tentados. Custa 2 bytes.
      if (!stream.isHls) {
        // PO Token on-device (BotGuardMinter). Medido no 4G do João: sem ele o
        // CDN corta em ~1MB CUMULATIVOS por vídeo/IP (parou aos 1 131 072
        // bytes, mesmo com os pedidos a encolher até 128KB) — nenhum ajuste de
        // chunks dá a volta a isso, só o token levanta o teto. Por isso tem de
        // ser aplicado também aqui, aos clientes android, e não só no ramo IOS
        // lá em baixo, como estava.
        const binding = data?.responseContext?.visitorData ?? visitorData;
        if (binding) {
          const poToken = await fetchGvsPoToken(binding);
          if (poToken) {
            const sep = stream.url.includes('?') ? '&' : '?';
            stream.url = `${stream.url}${sep}pot=${encodeURIComponent(poToken)}`;
            stream.hasPoToken = true;
          }
        }
        const status = await probeMediaUrl(stream.url);
        if (status !== 200 && status !== 206) {
          throw new Error(`CDN rejected the URL (HTTP ${status})`);
        }
      }
      stream.client = client.clientName + (visitorData ? '+vd' : '');
      if (errors.length) stream.resolverNote = errors.join(' | ');
      memo.set(cacheKey, stream);
      return stream;
    } catch (e: any) {
      errors.push(`${client.clientName}: ${e?.message ?? String(e)}`);
    }
  }

  // Último recurso: IOS + PO Token (on-device, se disponível). Só chega aqui
  // se os clientes android falharem (ex.: bloqueio de bot no IP).
  // Os clientes android falharam todos. Se o visitorData ficou marcado, o TTL
  // de 24h mantinha-o preso — deitá-lo fora faz com que a próxima tentativa
  // comece com identidade nova em vez de repetir exatamente o mesmo 403.
  await clearVisitorData();

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

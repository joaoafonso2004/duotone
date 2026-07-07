import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { resolveYouTubeStream, streamFromPlayerResponse, type YtStream } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
import { getAudioQuality } from '../lib/prefs';
import { cachedAudioFile } from '../lib/youtubeCache';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { type HarvestResult } from './YtStreamHarvester';

/**
 * Player do YouTube com TRÊS fases, em cascata:
 *
 * 1. HARVEST (YtStreamHarvester) — WebView invisível que deixa a página real
 *    do YouTube pedir os dados dela própria (com o token de origem genuíno
 *    que ela sabe gerar), e intercetamos a resposta. EXPERIMENTAL: só
 *    testável num dispositivo real; se não intercetar nada, avança para (2).
 *
 * 2. RESOLVER PRÓPRIO (ytstream.ts) — pedido nosso ao InnerTube. Sem PO
 *    Token, confirmado por teste: só dá acesso a ~1MB cumulativo de áudio por
 *    vídeo/IP (~20-30s) antes do CDN começar a rejeitar tudo com 403. Se
 *    houver um servidor bgutil-ytdlp-pot-provider configurado nas
 *    Definições (ver potProvider.ts / GUIA-POT-TOKEN.md), ytstream.ts anexa
 *    um PO Token real ao URL e esse limite desaparece — a faixa completa
 *    descarrega-se aos pedaços normalmente. Sem servidor configurado,
 *    continua a servir de rede de segurança limitada a ~20-30s, e ainda
 *    resolve HLS (que não sofre deste limite) quando disponível.
 *
 * 3. WEBVIEW (fallback final) — o embed oficial do YouTube, visível. Sempre
 *    toca, mas a música pára com o ecrã bloqueado (limitação do WKWebView).
 *
 * Em qualquer dos casos em que o áudio é mp4 progressivo (não HLS), descarrega-
 * se aos pedaços (dentro do limite conhecido) para um ficheiro LOCAL antes de
 * entregar ao AVPlayer — evita que o próprio AVPlayer falhe com "failed to
 * load player item" ao fazer um pedido sem Range (confirmado por teste).
 */

// Confirmado por teste direto: o CDN só autoriza ~1.000.000 bytes CUMULATIVOS
// por vídeo/IP sem PO Token (ver nota no topo) — acima de 900_000 já falha de
// forma consistente. Isto só chega para os primeiros ~20-30s de uma faixa; a
// única forma de ir além é o stream vir do YtStreamHarvester (token genuíno).
const CHUNK_BYTES = 900_000;
// Espaço entre pedidos consecutivos — imita o ritmo natural de um player real
// em vez de rajadas instantâneas.
const CHUNK_PACING_MS = 400;
const MAX_ATTEMPTS_PER_CHUNK = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Descobre o tamanho total do ficheiro via Content-Range, quando a API não o deu. */
async function discoverContentLength(url: string): Promise<number> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-1' } });
  const range = res.headers.get('content-range'); // "bytes 0-1/4406875"
  const total = range ? Number(range.split('/')[1]) : NaN;
  if (!Number.isFinite(total)) throw new Error('Could not determine stream length');
  return total;
}

async function fetchChunkWithRetry(url: string, start: number, end: number): Promise<Uint8Array> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    if (attempt > 0) await sleep(800 * 2 ** (attempt - 1)); // 800ms, 1.6s, 3.2s
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (res.status === 206 || res.status === 200) {
      return new Uint8Array(await res.arrayBuffer());
    }
    lastStatus = res.status;
  }
  throw new Error(`Chunk download failed (HTTP ${lastStatus}) at byte ${start}`);
}

async function downloadProgressiveAudio(
  videoId: string,
  url: string,
  knownLength: number | null
): Promise<string> {
  const dest = cachedAudioFile(videoId);
  if (dest.exists) return dest.uri;

  const total = knownLength ?? (await discoverContentLength(url));
  const parts: Uint8Array[] = [];
  let offset = 0;
  let first = true;
  while (offset < total) {
    if (!first) await sleep(CHUNK_PACING_MS);
    first = false;
    const end = Math.min(offset + CHUNK_BYTES, total) - 1;
    parts.push(await fetchChunkWithRetry(url, offset, end));
    offset = end + 1;
  }

  const combined = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    combined.set(part, pos);
    pos += part.length;
  }

  dest.create({ overwrite: true });
  dest.write(combined);
  return dest.uri;
}

const BRIDGE_JS = `
(function () {
  if (window.__duotoneHooked) { return; }
  window.__duotoneHooked = true;
  function post(m){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); } }
  function hook(){
    var v = document.querySelector('video');
    if (!v) { setTimeout(hook, 400); return; }
    v.addEventListener('play', function(){ post({ type:'state', value:'playing' }); });
    v.addEventListener('pause', function(){ post({ type:'state', value:'paused' }); });
    v.addEventListener('ended', function(){ post({ type:'state', value:'ended' }); });
    setInterval(function(){
      var vv = document.querySelector('video');
      if (vv && vv.duration) { post({ type:'progress', position:(vv.currentTime||0)*1000, duration: vv.duration*1000 }); }
    }, 1000);
    window.__duotone = {
      play:  function(){ var vv=document.querySelector('video'); if(vv) vv.play(); },
      pause: function(){ var vv=document.querySelector('video'); if(vv) vv.pause(); },
      seek:  function(s){ var vv=document.querySelector('video'); if(vv) vv.currentTime=s; }
    };
    post({ type:'ready' });
  }
  hook();
})();
true;
`;

type Backend = 'resolving' | 'native' | 'webview';

export function YouTubePlayerView({ track }: { track: Track }) {
  const registerYtControls = usePlayer((s) => s.registerYtControls);
  const onStateChange = usePlayer((s) => s._onYtStateChange);
  const setProgress = usePlayer((s) => s._setProgress);
  const setError = usePlayer((s) => s.setError);

  const [backend, setBackend] = useState<Backend>('resolving');
  const webRef = useRef<WebView>(null);
  const cancelledRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
    p.loop = false;
  });

  // Guardado num ref para o efeito de arranque poder chamar a versão mais
  // recente sem re-executar a cada render (a função é recriada em cada um).
  const proceedRef = useRef<(h: HarvestResult | null) => void>(() => {});

  useEffect(() => {
    cancelledRef.current = false;
    // Vai DIRETO ao resolver (ytstream.ts → ANDROID_VR, sem PO Token). Já não
    // passamos pela fase de harvesting: com o ANDROID_VR a resolver
    // diretamente, a WebView de captura só acrescentava até 10s de espera.
    setBackend('resolving');
    proceedRef.current(null);
    return () => {
      cancelledRef.current = true;
    };
  }, [track.sourceId]);

  // Chamado pelo YtStreamHarvester (fase 1) com o que conseguiu capturar, ou
  // `null` se não capturou nada dentro do timeout.
  const proceedWithPlayerResponse = async (harvested: HarvestResult | null) => {
    if (cancelledRef.current) return;
    setBackend('resolving');
    // Fora do try para ficar acessível no catch — permite diagnosticar se o
    // stream chegou a ter PO Token antes de a descarga em pedaços falhar.
    let stream: YtStream | undefined;
    try {
      const quality = await getAudioQuality();
      if (cancelledRef.current) return;

      if (harvested?.kind === 'playerResponse') {
        stream = streamFromPlayerResponse(harvested.data, quality);
      } else if (harvested?.kind === 'rawUrl') {
        const isHls = harvested.url.includes('.m3u8');
        stream = {
          url: harvested.url,
          isHls,
          expiresAt: Date.now() + 5 * 60 * 60 * 1000,
          contentLength: null,
        };
      } else {
        stream = await resolveYouTubeStream(track.sourceId, quality);
      }
      if (cancelledRef.current) return;

      // HLS transmite-se bem em direto; o mp4 progressivo tem de ser
      // descarregado primeiro (ver nota no topo sobre o 403 sem Range).
      const playableUri = stream.isHls
        ? stream.url
        : await downloadProgressiveAudio(track.sourceId, stream.url, stream.contentLength);
      if (cancelledRef.current) return;

      await player.replaceAsync({
        uri: playableUri,
        contentType: stream.isHls ? 'hls' : 'progressive',
        metadata: {
          title: track.title,
          artist: track.artist ?? 'YouTube',
          artwork: track.artworkUrl ?? undefined,
        },
      });
      if (cancelledRef.current) return;
      player.play();
      setBackend('native');
    } catch (e: any) {
      if (!cancelledRef.current) {
        // Diagnóstico visível — inclui a ORIGEM exata do stream e o estado do
        // PO Token para sabermos, sem ambiguidade, qual caminho falhou e
        // porquê, em vez de adivinhar (ver botguardBridge.ts).
        // Que cliente InnerTube deu o stream (ANDROID_VR/WEB/IOS) e, se caiu
        // para o IOS, porque falharam os clientes sem PO Token. É isto que
        // nos diz, sem ambiguidade, o que se passou no dispositivo.
        const clientInfo = stream?.client
          ? `client=${stream.client}${stream.resolverNote ? ` (fell back: ${stream.resolverNote})` : ''}`
          : 'client=?';
        setError(
          `[build ${BUILD_ID}] YouTube [${clientInfo}]: ${e?.message ?? 'unknown'}, using embed.`
        );
        setBackend('webview');
      }
    }
  };
  proceedRef.current = proceedWithPlayerResponse;

  // Eventos do player nativo -> store
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (backend === 'native') onStateChange(isPlaying ? 'playing' : 'paused');
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (backend === 'native')
      setProgress(currentTime * 1000, (player.duration || 0) * 1000);
  });
  useEventListener(player, 'playToEnd', () => {
    if (backend === 'native') onStateChange('ended');
  });
  useEventListener(player, 'statusChange', ({ status, error }) => {
    // Se o stream nativo falhar em runtime, tentar o WebView oficial.
    if (backend === 'native' && status === 'error') {
      setError(`[build ${BUILD_ID}] YouTube: playback error (${error?.message ?? 'unknown'}), using embed.`);
      setBackend('webview');
    }
  });

  // Registar os controlos do backend ativo na store (play/pause/seek).
  useEffect(() => {
    if (backend === 'resolving') return;
    if (backend === 'native') {
      registerYtControls({
        play: () => player.play(),
        pause: () => player.pause(),
        seek: (ms) => {
          player.currentTime = ms / 1000;
        },
      });
    } else {
      registerYtControls({
        play: () =>
          webRef.current?.injectJavaScript(
            'window.__duotone&&window.__duotone.play();true;'
          ),
        pause: () =>
          webRef.current?.injectJavaScript(
            'window.__duotone&&window.__duotone.pause();true;'
          ),
        seek: (ms) =>
          webRef.current?.injectJavaScript(
            `window.__duotone&&window.__duotone.seek(${(ms / 1000).toFixed(2)});true;`
          ),
      });
    }
    return () => registerYtControls(null);
  }, [backend, player, registerYtControls]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'state') onStateChange(msg.value);
      else if (msg.type === 'progress' && msg.duration > 0)
        setProgress(msg.position, msg.duration);
    } catch {
      // ignorar
    }
  };

  if (backend === 'webview') {
    // origin=https://www.youtube.com + Referer evitam boa parte dos falsos
    // "erro 153" (config error) que o embed mostra quando não reconhece de
    // onde está a ser carregado.
    const uri =
      `https://www.youtube.com/embed/${track.sourceId}` +
      '?playsinline=1&autoplay=1&rel=0&controls=1&fs=0&origin=https%3A%2F%2Fwww.youtube.com';
    return (
      <WebView
        ref={webRef}
        key={track.sourceId}
        source={{ uri, headers: { Referer: 'https://www.youtube.com/' } }}
        style={styles.fill}
        onMessage={onMessage}
        injectedJavaScript={BRIDGE_JS}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        scrollEnabled={false}
        bounces={false}
      />
    );
  }

  // resolving | native -> vídeo nativo (preto enquanto o stream carrega).
  return (
    <VideoView
      player={player}
      style={styles.fill}
      nativeControls={false}
      contentFit="cover"
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
});

import { useEventListener } from 'expo';
import { File, Paths } from 'expo-file-system';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { resolveYouTubeStream } from '../api/ytstream';
import { usePlayer } from '../state/player';
import type { Track } from '../types';

/**
 * Player do YouTube com DOIS backends:
 *
 * 1. NATIVO (preferido) — extrai o stream via InnerTube e toca-o com expo-video
 *    (AVPlayer). Dá playback com ecrã bloqueado, controlos no lock screen /
 *    Control Center e AirPods — como o Demus. Requer uma build nativa
 *    (dev-client/EAS); não funciona no Expo Go.
 *
 * 2. WEBVIEW (fallback) — o embed oficial do YouTube. Usado automaticamente
 *    quando a extração falha (vídeo protegido, PoToken, região, live). Neste
 *    modo a música pára com o ecrã bloqueado (limitação do WKWebView).
 *
 * IMPORTANTE sobre o áudio progressivo (mp4 direto, sem HLS): confirmado por
 * teste real que os URLs `googlevideo.com` do YouTube rejeitam com 403 um GET
 * simples (sem header Range) — o AVPlayer faz esse pedido inicial sem garantir
 * um Range, e falha com "failed to load player item: unknown error" mesmo com
 * o URL certo. Confirmado também que o CDN aplica alguma proteção
 * anti-rajada: pedidos Range sucessivos MUITO próximos no tempo à mesma faixa
 * podem ser rejeitados (403), de forma nem sempre determinística — não é
 * possível confirmar a regra exata sem um dispositivo real (o IP usado nos
 * testes esgotou a sua margem a meio da investigação). A mitigação aqui é
 * descarregar aos pedaços com espaçamento entre pedidos e nova tentativa com
 * backoff em caso de 403, e entregar um ficheiro LOCAL ao AVPlayer — deixa de
 * haver qualquer pedido de rede feito pelo AVPlayer em runtime. HLS não sofre
 * disto (manifesto e segmentos aceitam GET simples), por isso mantém-se em
 * streaming direto.
 */

// Pedaços maiores => menos pedidos => menor probabilidade de acionar a
// proteção anti-rajada do CDN.
const CHUNK_BYTES = 1_800_000;
// Espaço entre pedidos consecutivos — imita o ritmo natural de um player real
// em vez de rajadas instantâneas.
const CHUNK_PACING_MS = 400;
const MAX_ATTEMPTS_PER_CHUNK = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cache local do áudio (mp4 progressivo) por videoId — evita descarregar
 * outra vez ao voltar a tocar a mesma faixa. */
function cachedAudioFile(videoId: string): File {
  return new File(Paths.cache, `yt-audio-${videoId}.m4a`);
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

  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
    p.loop = false;
  });

  // Resolver o stream e carregar no player nativo; cair no WebView se falhar.
  useEffect(() => {
    let cancelled = false;
    setBackend('resolving');
    (async () => {
      try {
        const { url, isHls, contentLength } = await resolveYouTubeStream(track.sourceId);
        if (cancelled) return;

        // HLS transmite-se bem em direto; o mp4 progressivo tem de ser
        // descarregado primeiro (ver nota acima sobre o 403 sem Range).
        const playableUri = isHls
          ? url
          : await downloadProgressiveAudio(track.sourceId, url, contentLength);
        if (cancelled) return;

        await player.replaceAsync({
          uri: playableUri,
          contentType: isHls ? 'hls' : 'progressive',
          metadata: {
            title: track.title,
            artist: track.artist ?? 'YouTube',
            artwork: track.artworkUrl ?? undefined,
          },
        });
        if (cancelled) return;
        player.play();
        setBackend('native');
      } catch (e: any) {
        if (!cancelled) {
          // Diagnóstico visível — para sabermos exatamente porque caiu no
          // WebView, em vez de adivinhar a partir de um "erro 153" genérico.
          setError(`YouTube: native stream unavailable (${e?.message ?? 'unknown'}), using embed.`);
          setBackend('webview');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track.sourceId, track.title, track.artist, track.artworkUrl, player, setError]);

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
      setError(`YouTube: playback error (${error?.message ?? 'unknown'}), using embed.`);
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

  // resolving | native -> mostra a view de vídeo nativa (preto enquanto resolve).
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

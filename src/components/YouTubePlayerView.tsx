import { useEventListener } from 'expo';
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
 *    quando a extração falha (vídeo protegido, PoToken, região). Neste modo a
 *    música pára com o ecrã bloqueado (limitação do WKWebView), mas o vídeo
 *    toca sempre.
 */

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
        const { url } = await resolveYouTubeStream(track.sourceId);
        if (cancelled) return;
        await player.replaceAsync({
          uri: url,
          metadata: {
            title: track.title,
            artist: track.artist ?? 'YouTube',
            artwork: track.artworkUrl ?? undefined,
          },
        });
        if (cancelled) return;
        player.play();
        setBackend('native');
      } catch {
        if (!cancelled) setBackend('webview');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track.sourceId, track.title, track.artist, track.artworkUrl, player]);

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
  useEventListener(player, 'statusChange', ({ status }) => {
    // Se o stream nativo falhar em runtime, tentar o WebView oficial.
    if (backend === 'native' && status === 'error') setBackend('webview');
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
    const uri =
      `https://www.youtube.com/embed/${track.sourceId}` +
      '?playsinline=1&autoplay=1&rel=0&controls=1&fs=0';
    return (
      <WebView
        ref={webRef}
        key={track.sourceId}
        source={{ uri }}
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

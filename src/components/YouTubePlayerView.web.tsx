import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../state/player';
import type { Track } from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function YouTubePlayerView({ track }: { track: Track }) {
  const hostId = useRef(`duotone-player-${Math.random().toString(36).slice(2)}`);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let player: any;
    let progress: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    let ready = false;
    let started = false;
    const state = usePlayer.getState();

    // Watchdog: a IFrame API não tem timeout nenhum. Se o script não carregar,
    // ou o embed nunca ficar pronto (rede, IP marcado pela Google, embed
    // bloqueado no vídeo), o onReady/onStateChange nunca dispara — e como são
    // os ÚNICOS sítios que limpam o `buffering`, a UI ficava em ampulheta para
    // sempre e sem erro nenhum. Aqui qualquer falha acaba num estado terminal.
    const watchdog = setTimeout(() => {
      if (disposed || started) return;
      state._setBuffering(false);
      state.setError(
        ready
          ? "YouTube didn't start playing (blocked embed or network)"
          : "Couldn't load the YouTube player (network or blocked)"
      );
    }, 15000);

    const mount = () => {
      if (disposed || !window.YT?.Player) return;
      player = new window.YT.Player(hostId.current, {
        height: '1',
        width: '1',
        videoId: track.sourceId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          playsinline: 1,
          ...(window.location.protocol.startsWith('http') ? { origin: window.location.origin } : {}),
        },
        events: {
          onReady: (event: any) => {
            ready = true;
            playerRef.current = event.target;
            try {
              event.target.setVolume(state.volume);
            } catch (err) {
              console.warn('Failed to set initial volume on YT player', err);
            }
            let rate = 1.0;
            const activePreset = usePlayer.getState().soundPreset;
            if (activePreset === 'slowed') rate = 0.85;
            else if (activePreset === 'fast') rate = 1.35;
            try {
              event.target.setPlaybackRate?.(rate);
            } catch {}
            const initialPos = usePlayer.getState().positionMs;
            if (initialPos > 1500) {
              event.target.seekTo(initialPos / 1000, true);
            }
            if (usePlayer.getState().isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
            state.registerYtControls({
              play: () => event.target.playVideo(),
              pause: () => event.target.pauseVideo(),
              seek: (ms) => event.target.seekTo(ms / 1000, true),
              setVolume: (vol) => {
                try {
                  event.target.setVolume(vol);
                } catch (err) {
                  console.warn('Failed to set volume on YT player', err);
                }
              },
            });
            state._setBuffering(false);
            progress = setInterval(() => {
              const duration = Number(event.target.getDuration?.() || 0) * 1000;
              const position = Number(event.target.getCurrentTime?.() || 0) * 1000;
              usePlayer.getState()._setProgress(position, duration);

              try {
                const iframe = document.getElementById(hostId.current) as HTMLIFrameElement | null;
                const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
                const videos = doc?.querySelectorAll('video');
                videos?.forEach((video: any) => {
                  if (video.preservesPitch !== false) {
                    video.preservesPitch = false;
                    video.mozPreservesPitch = false;
                    video.webkitPreservesPitch = false;
                    const currentRate = video.playbackRate;
                    video.playbackRate = 1.0;
                    video.playbackRate = currentRate;
                  }
                });
              } catch {}
            }, 500);
          },
          onStateChange: (event: any) => {
            const s = event.data;
            if (s === 1 || s === 2) started = true;
            if (s === 1) state._onYtStateChange('playing');
            else if (s === 2) state._onYtStateChange('paused');
            else if (s === 0) state._onYtStateChange('ended');
            if (s === 3) state._setBuffering(true);
            if (s === 1 || s === 2) state._setBuffering(false);
          },
          onError: (event: any) => {
            // Códigos da IFrame API: 2 id inválido, 5 erro do player HTML5,
            // 100 vídeo removido/privado, 101/150 embed proibido pelo dono.
            started = true;
            state._setBuffering(false);
            state.setError(`Playback error (YouTube code ${event?.data ?? '?'})`);
          },
        },
      });
      playerRef.current = player;
    };

    if (window.YT?.Player) {
      mount();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); mount(); };
      if (!document.querySelector('script[data-duotone-youtube]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.duotoneYoutube = 'true';
        // Sem isto, um script bloqueado (rede/firewall) ficava em silêncio.
        script.onerror = () => {
          if (disposed) return;
          started = true;
          state._setBuffering(false);
          state.setError("Couldn't reach YouTube (iframe_api failed to load)");
        };
        document.head.appendChild(script);
      }
    }

    return () => {
      disposed = true;
      clearTimeout(watchdog);
      if (progress) clearInterval(progress);
      usePlayer.getState().registerYtControls(null);
      playerRef.current = null;
      try { player?.pauseVideo?.(); } catch {}
      try { player?.mute?.(); } catch {}
      try { player?.destroy?.(); } catch {}
    };
  }, [track.sourceId]);

  const soundPreset = usePlayer((s) => s.soundPreset);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    let rate = 1.0;
    if (soundPreset === 'slowed') rate = 0.85;
    else if (soundPreset === 'fast') rate = 1.35;
    try {
      p.setPlaybackRate?.(rate);
      setTimeout(() => {
        try {
          const iframe = document.getElementById(hostId.current) as HTMLIFrameElement | null;
          const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
          const videos = doc?.querySelectorAll('video');
          videos?.forEach((video: any) => {
            video.preservesPitch = false;
            video.mozPreservesPitch = false;
            video.webkitPreservesPitch = false;
            video.playbackRate = 1.0;
            video.playbackRate = rate;
          });
        } catch {}
      }, 80);
    } catch {}
  }, [soundPreset]);

  return <div id={hostId.current} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />;
}

import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
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

  useEffect(() => {
    let player: any;
    let progress: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const state = usePlayer.getState();

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
            event.target.playVideo();
            state.registerYtControls({
              play: () => event.target.playVideo(),
              pause: () => event.target.pauseVideo(),
              seek: (ms) => event.target.seekTo(ms / 1000, true),
            });
            state._setBuffering(false);
            progress = setInterval(() => {
              const duration = Number(event.target.getDuration?.() || 0) * 1000;
              const position = Number(event.target.getCurrentTime?.() || 0) * 1000;
              usePlayer.getState()._setProgress(position, duration);
            }, 500);
          },
          onStateChange: (event: any) => {
            const s = event.data;
            if (s === 1) state._onYtStateChange('playing');
            else if (s === 2) state._onYtStateChange('paused');
            else if (s === 0) state._onYtStateChange('ended');
            if (s === 3) state._setBuffering(true);
            if (s === 1 || s === 2) state._setBuffering(false);
          },
          onError: () => {
            state._setBuffering(false);
            state.setError('YouTube could not play this track.');
          },
        },
      });
    };

    if (window.YT?.Player) mount();
    else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); mount(); };
      if (!document.querySelector('script[data-duotone-youtube]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.duotoneYoutube = 'true';
        document.head.appendChild(script);
      }
    }

    return () => {
      disposed = true;
      if (progress) clearInterval(progress);
      usePlayer.getState().registerYtControls(null);
      player?.destroy?.();
    };
  }, [track.sourceId]);

  return <View nativeID={hostId.current} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />;
}

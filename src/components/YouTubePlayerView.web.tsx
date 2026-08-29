import React, { useEffect, useRef } from 'react';
import { searchYouTube } from '../api/youtube';
import { pickBest } from '../lib/trackMatch';
import { rememberPlaybackAlternative } from '../lib/playbackAlternatives';
import { usePlayer } from '../state/player';
import type { Track } from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type RecoveryRun = {
  original: Track;
  failedIds: Set<string>;
  replacements: number;
};

// As alternativas pertencentes à mesma tentativa partilham esta informação.
// Assim, se a primeira substituição também estiver bloqueada, não se entra
// num ciclo a alternar eternamente entre dois vídeos indisponíveis.
const recoveryByVideoId = new Map<string, RecoveryRun>();

function playbackNotice(message: string) {
  window.dispatchEvent(new CustomEvent('duotone:playback-notice', { detail: message }));
}

async function recoverUnavailableVideo(track: Track, code: number) {
  const state = usePlayer.getState();
  const run = recoveryByVideoId.get(track.sourceId) ?? {
    original: track,
    failedIds: new Set<string>(),
    replacements: 0,
  };
  run.failedIds.add(track.sourceId);
  recoveryByVideoId.set(track.sourceId, run);

  // Uma substituição automática chega. Se essa cópia também estiver
  // bloqueada, insistir noutras versões aumenta muito o risco de acabar num
  // remix ou numa gravação errada; nesse caso avança-se imediatamente.
  if (run.replacements >= 1) {
    if (state.current?.sourceId === track.sourceId) {
      playbackNotice('That replacement is also unavailable. Skipping this track.');
      await state.skipUnavailableTrack(track.sourceId);
    }
    return;
  }

  state.setError(null);
  playbackNotice('This upload is unavailable. Looking for the same track…');
  state._setBuffering(true);

  try {
    // O título original é a consulta mais restrita possível. A escolha não é
    // simplesmente o primeiro resultado: reutiliza a pontuação do importador,
    // que penaliza live, remix, slowed, karaoke, instrumental, etc.
    const candidates = (await searchYouTube(run.original.title))
      .filter((candidate) => !run.failedIds.has(candidate.sourceId));
    const match = pickBest(
      candidates.map((candidate) => ({
        id: candidate.sourceId,
        title: candidate.title,
        channel: candidate.artist ?? '',
        durationSec: candidate.durationSeconds,
      })),
      {
        title: run.original.title,
        artist: run.original.artist ?? '',
        durationSec: run.original.durationSeconds,
      }
    );
    const alternative = match.best
      ? candidates.find((candidate) => candidate.sourceId === match.best?.id)
      : null;

    if (match.confident && alternative) {
      run.replacements += 1;
      recoveryByVideoId.set(alternative.sourceId, run);
      if (usePlayer.getState().replaceUnavailableTrack(track.sourceId, alternative)) {
        void rememberPlaybackAlternative(track.sourceId, alternative.sourceId);
        playbackNotice('Found a playable copy and saved it for next time.');
        return;
      }
      // A faixa mudou enquanto a pesquisa decorria; não saltar a nova.
      return;
    }
  } catch (error) {
    console.warn('[YouTubePlayer] Automatic replacement search failed', error);
  }

  // Sem cópia segura: avançar é melhor do que deixar a reprodução bloqueada.
  if (usePlayer.getState().current?.sourceId === track.sourceId) {
    playbackNotice('No safe equivalent was found. Skipping this track.');
    await usePlayer.getState().skipUnavailableTrack(track.sourceId);
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
      state.setError('Playback could not start.');
      playbackNotice(
        ready
          ? 'This track did not start. Try again or play the next track.'
          : 'Could not reach YouTube. Check your connection and try again.'
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
            const code = Number(event?.data);
            if (code === 2 || code === 100 || code === 101 || code === 150) {
              void recoverUnavailableVideo(track, code);
            } else {
              state.setError('This track could not be played.');
              playbackNotice('Playback failed. Try another track or check your connection.');
            }
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
          state.setError('Playback could not start.');
          playbackNotice('Could not reach YouTube. Check your connection and try again.');
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

/**
 * Decisões pequenas do ciclo de vida do player, mantidas fora da store para
 * poderem ser testadas sem montar React Native, Electron ou o iframe YouTube.
 */

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  setVolume?: (volume: number) => void;
}

export interface PlaybackSource {
  source: string;
  sourceId: string;
}

export function samePlaybackSource(
  current: PlaybackSource | null | undefined,
  requested: PlaybackSource
): boolean {
  return current?.source === requested.source && current.sourceId === requested.sourceId;
}

/**
 * Reinicia imediatamente um iframe que já está montado para a mesma faixa.
 * Isto é especialmente importante depois do restauro da sessão: como o ID
 * não muda, React não volta a montar o player e não há um novo autoplay.
 */
export function replayMountedSource(
  current: PlaybackSource | null | undefined,
  requested: PlaybackSource,
  controls: PlaybackControls | null
): PlaybackControls | null {
  if (!controls || !samePlaybackSource(current, requested)) return null;
  controls.seek(0);
  controls.play();
  return controls;
}

export function requestPlay(controls: PlaybackControls | null) {
  controls?.play();
  return {
    isPlaying: true,
    buffering: !controls,
    error: null,
    autoplayOnLoad: true,
  };
}

export function requestPause(controls: PlaybackControls | null) {
  controls?.pause();
  return {
    isPlaying: false,
    buffering: false,
  };
}

/** Estado transitório que nunca deve ser herdado de uma sessão persistida. */
export function restoredPlaybackState(positionMs: unknown) {
  return {
    isPlaying: false,
    buffering: false,
    expanded: false,
    error: null,
    activeBackend: 'resolving' as const,
    autoplayOnLoad: false,
    resumePositionMs:
      typeof positionMs === 'number' && positionMs > 1500 ? positionMs : null,
  };
}

import { create } from 'zustand';
import {
  pauseSpotify,
  playSpotifyTrack,
  resumeSpotify,
  seekSpotify,
  SpotifyError,
} from '../api/spotify';
import { incrementPlayCount } from '../lib/playCounts';
import type { Track } from '../types';

/** Controlo do player YouTube (registado pelo YouTubePlayerView). */
export interface YtControls {
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
}

interface PlayerState {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  /** overlay Now Playing expandido vs mini-player */
  expanded: boolean;
  /** repetir a fila do início ao chegar ao fim (preferência das Definições) */
  repeatQueue: boolean;
  /** mostrar o botão de recuar 15s no player expandido (preferência das Definições) */
  showRewindButton: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;

  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  close: () => Promise<void>;
  setExpanded: (v: boolean) => void;
  setRepeatQueue: (v: boolean) => void;
  setShowRewindButton: (v: boolean) => void;
  setError: (e: string | null) => void;

  seekTo: (ms: number) => Promise<void>;

  /** interno — ponte com o WebView do YouTube */
  _yt: YtControls | null;
  registerYtControls: (c: YtControls | null) => void;
  _onYtStateChange: (s: 'playing' | 'paused' | 'ended') => void;
  _setProgress: (positionMs: number, durationMs: number) => void;
  _setIsPlaying: (v: boolean) => void;
}

function errMessage(e: unknown): string {
  if (e instanceof SpotifyError) {
    if (e.status === 401) return 'Connect your Spotify account in Search.';
    if (e.status === 404)
      return 'No active Spotify device. Open the Spotify app.';
    if (e.status === 403)
      return 'Spotify playback requires a Premium account.';
  }
  return "Couldn't play this track.";
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  expanded: false,
  repeatQueue: false,
  showRewindButton: false,
  positionMs: 0,
  durationMs: 0,
  error: null,
  _yt: null,

  playTrack: async (track, queue) => {
    // Conta esta reprodução (local; alimenta "Most played" no Perfil).
    incrementPlayCount(track).catch(() => {});
    const q = queue && queue.length > 0 ? queue : [track];
    const index = Math.max(
      0,
      q.findIndex(
        (t) => t.source === track.source && t.sourceId === track.sourceId
      )
    );
    set({
      current: track,
      queue: q,
      queueIndex: index,
      error: null,
      positionMs: 0,
      durationMs: (track.durationSeconds ?? 0) * 1000,
      // O WebView do YouTube autoplay-a ao montar; estado real chega via bridge.
      isPlaying: true,
    });

    if (track.source === 'spotify') {
      try {
        await playSpotifyTrack(track);
      } catch (e) {
        set({ isPlaying: false, error: errMessage(e) });
      }
    }
  },

  togglePlay: async () => {
    const { current, isPlaying, _yt } = get();
    if (!current) return;

    if (current.source === 'youtube') {
      // O estado real volta via _onYtStateChange
      if (isPlaying) _yt?.pause();
      else _yt?.play();
      return;
    }

    try {
      if (isPlaying) {
        await pauseSpotify();
        set({ isPlaying: false });
      } else {
        await resumeSpotify();
        set({ isPlaying: true });
      }
    } catch (e) {
      set({ error: errMessage(e) });
    }
  },

  next: async () => {
    const { queue, queueIndex, repeatQueue, playTrack } = get();
    if (queueIndex + 1 < queue.length) {
      await playTrack(queue[queueIndex + 1], queue);
    } else if (repeatQueue && queue.length > 0) {
      await playTrack(queue[0], queue);
    } else {
      set({ isPlaying: false });
    }
  },

  prev: async () => {
    const { queue, queueIndex, repeatQueue, playTrack } = get();
    if (queueIndex - 1 >= 0) {
      await playTrack(queue[queueIndex - 1], queue);
    } else if (repeatQueue && queue.length > 0) {
      await playTrack(queue[queue.length - 1], queue);
    }
  },

  close: async () => {
    const { current } = get();
    if (current?.source === 'spotify') {
      try {
        await pauseSpotify();
      } catch {
        // ignorar
      }
    }
    set({
      current: null,
      queue: [],
      queueIndex: 0,
      isPlaying: false,
      expanded: false,
      positionMs: 0,
      durationMs: 0,
      error: null,
    });
  },

  seekTo: async (ms) => {
    const { current, _yt, durationMs } = get();
    if (!current) return;
    const clamped = Math.max(0, Math.min(ms, durationMs));
    set({ positionMs: clamped });
    if (current.source === 'youtube') {
      _yt?.seek(clamped);
    } else {
      try {
        await seekSpotify(clamped);
      } catch (e) {
        set({ error: errMessage(e) });
      }
    }
  },

  setExpanded: (v) => set({ expanded: v }),
  setRepeatQueue: (v) => set({ repeatQueue: v }),
  setShowRewindButton: (v) => set({ showRewindButton: v }),
  setError: (e) => set({ error: e }),

  registerYtControls: (c) => set({ _yt: c }),

  _onYtStateChange: (s) => {
    if (s === 'ended') {
      get().next();
      return;
    }
    set({ isPlaying: s === 'playing' });
  },

  _setProgress: (positionMs, durationMs) => set({ positionMs, durationMs }),

  _setIsPlaying: (v) => set({ isPlaying: v }),
}));

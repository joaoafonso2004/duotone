import { create } from 'zustand';
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
  /** a resolver/descarregar a faixa (ainda não começou a tocar áudio) */
  buffering: boolean;
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
  _setBuffering: (v: boolean) => void;
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
  buffering: false,
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
      // A resolver/carregar até o áudio começar mesmo (pulsa a capa).
      buffering: true,
      // O player nativo autoplay-a ao montar; estado real chega via bridge.
      isPlaying: true,
    });
  },

  togglePlay: async () => {
    const { current, isPlaying, _yt } = get();
    if (!current) return;
    // O estado real volta via _onYtStateChange
    if (isPlaying) _yt?.pause();
    else _yt?.play();
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
    // Parar o áudio ANTES de desmontar o player (com staysActiveInBackground
    // a media podia continuar a tocar mesmo depois de fechar o ecrã).
    get()._yt?.pause();
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
    _yt?.seek(clamped);
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

  _setBuffering: (v) => set({ buffering: v }),
}));

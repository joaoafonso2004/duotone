import { create } from 'zustand';
import { recordPlayInSupabase } from '../api/plays';
import { incrementPlayCount } from '../lib/playCounts';
import type { Track } from '../types';

/** Controlo do player YouTube (registado pelo YouTubePlayerView). */
export interface YtControls {
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
}

/** off = pára no fim · all = repete a fila · one = repete a música atual. */
export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  /** overlay Now Playing expandido vs mini-player */
  expanded: boolean;
  /** modo de repetição (botão no player) */
  repeatMode: RepeatMode;
  /** ordem aleatória ao avançar (botão no player) */
  shuffle: boolean;
  /** mostrar o botão de recuar 15s no player expandido (preferência das Definições) */
  showRewindButton: boolean;
  positionMs: number;
  durationMs: number;
  /** a resolver/descarregar a faixa (ainda não começou a tocar áudio) */
  buffering: boolean;
  error: string | null;
  sleepTimerTimeLeft: number;
  soundPreset: 'normal' | 'slowed' | 'fast';

  playTrack: (track: Track, queue?: Track[], shouldExpand?: boolean) => Promise<void>;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  close: () => Promise<void>;
  setExpanded: (v: boolean) => void;
  setRepeatMode: (m: RepeatMode) => void;
  cycleRepeat: () => void;
  setShuffle: (v: boolean) => void;
  setSleepTimer: (minutes: number) => void;
  tickSleepTimer: () => void;
  setSoundPreset: (preset: 'normal' | 'slowed' | 'fast') => void;
  pausePlayback: () => void;
  toggleShuffle: () => void;
  setShowRewindButton: (v: boolean) => void;
  setError: (e: string | null) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;

  seekTo: (ms: number) => Promise<void>;

  /** interno — ponte com o WebView do YouTube */
  _yt: YtControls | null;
  registerYtControls: (c: YtControls | null) => void;
  _onYtStateChange: (s: 'playing' | 'paused' | 'ended') => void;
  _setProgress: (positionMs: number, durationMs: number) => void;
  _setIsPlaying: (v: boolean) => void;
  _setBuffering: (v: boolean) => void;
  activeBackend: 'resolving' | 'native' | 'webview';
  _setActiveBackend: (backend: 'resolving' | 'native' | 'webview') => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  expanded: false,
  repeatMode: 'off',
  shuffle: false,
  showRewindButton: false,
  positionMs: 0,
  durationMs: 0,
  buffering: false,
  error: null,
  sleepTimerTimeLeft: 0,
  soundPreset: 'normal',
  _yt: null,
  activeBackend: 'resolving',

  playTrack: async (track, queue, shouldExpand) => {
    // Conta esta reprodução (local; alimenta "Most played" no Perfil).
    incrementPlayCount(track).catch(() => {});
    // Conta esta reprodução no Supabase para recomendações.
    recordPlayInSupabase(track).catch(() => {});
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
      activeBackend: 'resolving',
      ...(shouldExpand ? { expanded: true } : {}),
    });
  },

  playNext: (track) => {
    const { queue, queueIndex } = get();
    if (queue.length === 0) {
      set({
        current: track,
        queue: [track],
        queueIndex: 0,
        isPlaying: true,
        buffering: true,
        positionMs: 0,
        durationMs: (track.durationSeconds ?? 0) * 1000,
      });
      return;
    }
    const newQueue = [...queue];
    newQueue.splice(queueIndex + 1, 0, track);
    set({ queue: newQueue });
  },

  addToQueue: (track) => {
    const { queue } = get();
    if (queue.length === 0) {
      set({
        current: track,
        queue: [track],
        queueIndex: 0,
        isPlaying: true,
        buffering: true,
        positionMs: 0,
        durationMs: (track.durationSeconds ?? 0) * 1000,
      });
      return;
    }
    set({ queue: [...queue, track] });
  },

  togglePlay: async () => {
    const { current, isPlaying, _yt } = get();
    if (!current) return;
    // O estado real volta via _onYtStateChange
    if (isPlaying) _yt?.pause();
    else _yt?.play();
  },

  next: async () => {
    const { queue, queueIndex, repeatMode, shuffle, playTrack } = get();
    if (queue.length === 0) return;

    // Shuffle: salta para uma faixa aleatória diferente da atual.
    if (shuffle && queue.length > 1) {
      let r = queueIndex;
      while (r === queueIndex) r = Math.floor(Math.random() * queue.length);
      await playTrack(queue[r], queue);
      return;
    }

    if (queueIndex + 1 < queue.length) {
      await playTrack(queue[queueIndex + 1], queue);
    } else if (repeatMode === 'all') {
      await playTrack(queue[0], queue);
    } else {
      set({ isPlaying: false });
    }
  },

  prev: async () => {
    const { queue, queueIndex, repeatMode, playTrack } = get();
    if (queueIndex - 1 >= 0) {
      await playTrack(queue[queueIndex - 1], queue);
    } else if (repeatMode === 'all' && queue.length > 0) {
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
      activeBackend: 'resolving',
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
  setRepeatMode: (m) => set({ repeatMode: m }),
  cycleRepeat: () =>
    set((s) => ({
      repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
    })),
  setShuffle: (v) => set({ shuffle: v }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  setShowRewindButton: (v) => set({ showRewindButton: v }),
  setError: (e) => set({ error: e }),

  registerYtControls: (c) => set({ _yt: c }),

  _setActiveBackend: (b) => set({ activeBackend: b }),

  _onYtStateChange: (s) => {
    if (s === 'ended') {
      const { repeatMode, _yt } = get();
      if (repeatMode === 'one') {
        _yt?.seek(0);
        _yt?.play();
        return;
      }
      get().next();
      return;
    }
    set({ isPlaying: s === 'playing' });
  },

  _setProgress: (positionMs, durationMs) => set({ positionMs, durationMs }),

  _setIsPlaying: (v) => set({ isPlaying: v }),

  _setBuffering: (v) => set({ buffering: v }),

  setSleepTimer: (minutes) => {
    set({ sleepTimerTimeLeft: minutes * 60 });
  },

  tickSleepTimer: () => {
    const { sleepTimerTimeLeft } = get();
    if (sleepTimerTimeLeft <= 0) return;
    const next = sleepTimerTimeLeft - 1;
    set({ sleepTimerTimeLeft: next });
    if (next === 0) {
      get().pausePlayback();
    }
  },

  setSoundPreset: (preset) => {
    set({ soundPreset: preset });
  },

  moveQueueItem: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;

    const newQueue = [...queue];
    const [movedItem] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, movedItem);

    let newIndex = queueIndex;
    if (fromIndex === queueIndex) {
      newIndex = toIndex;
    } else if (fromIndex < queueIndex && toIndex >= queueIndex) {
      newIndex = queueIndex - 1;
    } else if (fromIndex > queueIndex && toIndex <= queueIndex) {
      newIndex = queueIndex + 1;
    }

    set({ queue: newQueue, queueIndex: newIndex });
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length) return;

    const newQueue = [...queue];
    newQueue.splice(index, 1);

    let newIndex = queueIndex;
    if (index === queueIndex) {
      if (newQueue.length === 0) {
        set({ current: null, queue: [], queueIndex: 0, isPlaying: false });
        return;
      }
      newIndex = Math.min(queueIndex, newQueue.length - 1);
      set({ queue: newQueue, queueIndex: newIndex, current: newQueue[newIndex] });
      return;
    } else if (index < queueIndex) {
      newIndex = queueIndex - 1;
    }

    set({ queue: newQueue, queueIndex: newIndex });
  },

  pausePlayback: () => {
    const { isPlaying, _yt } = get();
    if (isPlaying) {
      _yt?.pause();
      set({ isPlaying: false });
    }
  },
}));

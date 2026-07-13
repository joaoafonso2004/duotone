import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { recordPlayInSupabase } from '../api/plays';
import { incrementPlayCount } from '../lib/playCounts';
import type { Track } from '../types';

/** Controlo do player YouTube (registado pelo YouTubePlayerView). */
export interface YtControls {
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  setVolume?: (vol: number) => void;
}

const getInitialVolume = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem('duotone-volume');
      if (stored !== null) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read volume from localStorage', e);
    }
  }
  return 80;
};

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
  /** Instante absoluto (Date.now) em que o sleep timer expira. É a fonte de
   * verdade: um contador decrementado por setInterval congela em background
   * (o iOS suspende timers JS), mas um deadline absoluto verificado também
   * no timeUpdate do player nativo (que continua a disparar em background)
   * pausa a música à hora certa mesmo com o ecrã bloqueado. */
  sleepTimerEndsAt: number | null;
  soundPreset: 'normal' | 'slowed' | 'fast';
  /** Progresso (0..1) do download da faixa atual, ou null se não está a descarregar. */
  downloadProgress: number | null;
  /** false quando a faixa vem do restauro da sessão anterior — o player
   * prepara o áudio mas não começa a tocar até o utilizador carregar em play. */
  autoplayOnLoad: boolean;
  /** Posição (ms) a retomar após restauro da sessão; consumida uma vez. */
  resumePositionMs: number | null;
  volume: number;
  setVolume: (v: number) => void;

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
  /** Verifica o deadline do sleep timer (chamado no tick de foreground E no
   * timeUpdate do player nativo, para funcionar em background). */
  checkSleepTimer: () => void;
  _setDownloadProgress: (p: number | null) => void;
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

// Escritas no AsyncStorage com debounce: o positionMs muda a cada segundo e
// serializar a fila inteira a esse ritmo seria desperdício — 3s de atraso na
// persistência é irrelevante para "continuar a ouvir".
function debouncedStorage() {
  let pendingValue: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name: string) => AsyncStorage.getItem(name),
    setItem: (name: string, value: string) => {
      pendingValue = value;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          const v = pendingValue;
          pendingValue = null;
          if (v != null) AsyncStorage.setItem(name, v).catch(() => {});
        }, 3000);
      }
    },
    removeItem: (name: string) => AsyncStorage.removeItem(name),
  };
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
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
  sleepTimerEndsAt: null,
  soundPreset: 'normal',
  downloadProgress: null,
  autoplayOnLoad: true,
  resumePositionMs: null,
  volume: getInitialVolume(),
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
      downloadProgress: null,
      autoplayOnLoad: true,
      resumePositionMs: null,
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
    const { queue, queueIndex, repeatMode, playTrack, positionMs, seekTo } = get();
    // Comportamento standard (Spotify/Apple Music): com mais de 3s de
    // reprodução, "anterior" recomeça a faixa atual em vez de recuar na fila.
    if (positionMs > 3000) {
      await seekTo(0);
      return;
    }
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

  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(100, v));
    set({ volume: clamped });
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('duotone-volume', String(clamped));
      } catch (e) {
        console.warn('Failed to save volume to localStorage', e);
      }
    }
    get()._yt?.setVolume?.(clamped);
  },

  registerYtControls: (c) => {
    set({ _yt: c });
    if (c && c.setVolume) {
      c.setVolume(get().volume);
    }
  },

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
    if (minutes <= 0) {
      set({ sleepTimerEndsAt: null, sleepTimerTimeLeft: 0 });
      return;
    }
    set({
      sleepTimerEndsAt: Date.now() + minutes * 60_000,
      sleepTimerTimeLeft: minutes * 60,
    });
  },

  tickSleepTimer: () => get().checkSleepTimer(),

  checkSleepTimer: () => {
    const { sleepTimerEndsAt, sleepTimerTimeLeft } = get();
    if (!sleepTimerEndsAt) return;
    const left = Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 1000));
    if (left !== sleepTimerTimeLeft) set({ sleepTimerTimeLeft: left });
    if (left <= 0) {
      set({ sleepTimerEndsAt: null });
      get().pausePlayback();
    }
  },

  _setDownloadProgress: (p) => set({ downloadProgress: p }),

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
    }),
    {
      name: 'player-session',
      storage: createJSONStorage(debouncedStorage),
      // Persistimos apenas o necessário para "continuar a ouvir" após a app
      // ser morta: faixa atual, fila e posição. Repeat/shuffle já vivem nas
      // prefs; o resto é estado transitório.
      partialize: (s) => ({
        current: s.current,
        queue: s.queue,
        queueIndex: s.queueIndex,
        positionMs: s.positionMs,
        durationMs: s.durationMs,
      }),
      // No restauro, a sessão volta PAUSADA: o player prepara o áudio
      // (autoplayOnLoad=false) e retoma na posição guardada quando o
      // utilizador carregar em play.
      merge: (persisted: any, current) => {
        if (!persisted?.current) return current;
        return {
          ...current,
          ...persisted,
          isPlaying: false,
          buffering: false,
          expanded: false,
          error: null,
          activeBackend: 'resolving' as const,
          autoplayOnLoad: false,
          resumePositionMs:
            typeof persisted.positionMs === 'number' && persisted.positionMs > 1500
              ? persisted.positionMs
              : null,
        };
      },
    }
  )
);

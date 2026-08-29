import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { recordPlayInSupabase } from '../api/plays';
import { incrementPlayCount } from '../lib/playCounts';
import { reconcileOrder, shuffleKeys, stepIndex, trackKey, upcomingIndexes } from '../lib/shuffle';
import { radioSeeds, shouldExtendWithRadio } from '../lib/radio';
import { fetchRadioTracks } from '../api/radio';
import { setShuffle as persistShuffle, setSoundPreset as persistSoundPreset } from '../lib/prefs';
import { applyPlaybackAlternative } from '../lib/playbackAlternatives';
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
  /** Percurso do shuffle, por chave de faixa. Materializado (Fisher-Yates)
   * em vez de sorteado a cada `next()`: só assim cada faixa toca uma vez e o
   * "anterior" volta pelo caminho por onde veio. Ver lib/shuffle.ts.
   * Não é persistido — regenera-se sozinho. */
  shuffleOrder: string[];
  /** Rádio: quando a fila acaba, continuar com música parecida em vez de
   * ficar em silêncio. Preferência do utilizador (Definições). */
  autoplayRadio: boolean;
  /** true enquanto a cauda da fila veio do rádio — só para a UI o dizer. */
  radioActive: boolean;
  /** Normalizar o volume entre faixas (iOS). O YouTube não masteriza nada e
   * o salto de volume entre uploads é o defeito mais audível da fonte.
   * Ver lib/loudness.ts. */
  volumeNormalization: boolean;
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
  /** Troca apenas a fonte da faixa atual depois de um vídeo indisponível.
   * Não conta uma segunda reprodução e mantém a posição da faixa na fila. */
  replaceUnavailableTrack: (failedSourceId: string, replacement: Track) => boolean;
  /** Remove da sessão uma fonte que não toca e avança sem esperar pelo rádio. */
  skipUnavailableTrack: (failedSourceId: string) => Promise<void>;
  /** Assume uma sessão vinda de outro dispositivo (handoff), a partir de uma
   * posição. Deliberadamente NÃO conta a reprodução: já foi contada no
   * dispositivo de origem, e contá-la outra vez inflacionava o "Most played"
   * sempre que se trocasse de dispositivo. */
  adoptSession: (session: {
    track: Track;
    queue: Track[];
    queueIndex: number;
    positionMs: number;
  }) => void;
  /** Toca uma lista inteira em modo aleatório (botões "Shuffle" da
   * biblioteca e das playlists). */
  playShuffled: (tracks: Track[]) => Promise<void>;
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

  /** Que faixa é que o `next()` tocaria a seguir, sem tocar nada.
   * Existe para o pré-carregamento no YouTubePlayerView usar EXATAMENTE a
   * mesma decisão que o `next()` — antes descarregava sempre `queueIndex+1`
   * e com shuffle ligado pré-carregava sempre a faixa errada. */
  peekNextTrack: () => Track | null;

  /** As faixas que vêm a seguir, pela ordem em que vão MESMO tocar, com o
   * índice real na fila (para remover/reordenar). Com shuffle ligado isto
   * não é `queue.slice(queueIndex + 1)` — a lista "Up next" mentia. */
  upcomingQueue: () => { track: Track; index: number }[];

  setAutoplayRadio: (v: boolean) => void;
  setVolumeNormalization: (v: boolean) => void;
  /** Acrescenta faixas do rádio à fila, se fizer sentido agora. Devolve se
   * chegou mesmo a acrescentar. Chamado de dois sítios: em antecipação
   * (useAutoplayRadio, para não haver silêncio) e no `next()` como rede de
   * segurança. */
  extendQueueWithRadio: () => Promise<boolean>;

  /** interno — devolve o percurso do shuffle alinhado com a fila atual,
   * gerando-o se ainda não existir. Sem isto, remover uma faixa da fila
   * deixava o percurso a apontar para uma chave que já lá não está e o
   * `next()` julgava a fila acabada. */
  _ensureShuffleOrder: () => string[];

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

/** Guarda contra duas idas à rede do rádio em simultâneo. */
let radioInFlight = false;
/** Impede que uma resolucao lenta de uma faixa antiga substitua um clique mais recente. */
let playRequestId = 0;

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
  shuffleOrder: [],
  autoplayRadio: true,
  radioActive: false,
  volumeNormalization: true,
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
    const requestId = ++playRequestId;
    // Conta esta reprodução (local; alimenta "Most played" no Perfil).
    incrementPlayCount(track).catch(() => {});
    // Conta esta reprodução no Supabase para recomendações.
    recordPlayInSupabase(track).catch(() => {});
    const originalQueue = queue && queue.length > 0 ? queue : [track];
    const index = Math.max(
      0,
      originalQueue.findIndex(
        (t) => t.source === track.source && t.sourceId === track.sourceId
      )
    );
    // Se esta fonte já falhou antes e foi encontrada uma cópia segura, usar o
    // ID aprendido sem alterar título, capa, histórico ou playlist guardada.
    const playableTrack = await applyPlaybackAlternative(track).catch(() => track);
    if (requestId !== playRequestId) return;
    const q = originalQueue.slice();
    if (q[index]) q[index] = playableTrack;
    set({
      current: playableTrack,
      queue: q,
      queueIndex: index,
      error: null,
      positionMs: 0,
      durationMs: (playableTrack.durationSeconds ?? 0) * 1000,
      // A resolver/carregar até o áudio começar mesmo (pulsa a capa).
      buffering: true,
      // O player nativo autoplay-a ao montar; estado real chega via bridge.
      isPlaying: true,
      activeBackend: 'resolving',
      downloadProgress: null,
      autoplayOnLoad: true,
      resumePositionMs: null,
      // Alinhar o percurso do shuffle com a fila. Quando o `next()` chama isto
      // com a MESMA fila, o reconcile não mexe em nada e a travessia continua;
      // quando chega uma playlist nova, não sobra chave nenhuma e sai uma
      // ordem inteiramente nova. Um só caminho para os dois casos.
      shuffleOrder: get().shuffle ? reconcileOrder(get().shuffleOrder, q, index) : [],
      // Escolher uma fila nova sai do rádio; continuar na mesma mantém-no.
      radioActive: get().radioActive && q === get().queue,
      ...(shouldExpand ? { expanded: true } : {}),
    });
  },

  replaceUnavailableTrack: (failedSourceId, replacement) => {
    let replaced = false;
    set((state) => {
      if (!state.current || state.current.sourceId !== failedSourceId) return {};

      // A copia e apenas uma nova fonte de audio. Manter titulo, capa e
      // artista evita que a biblioteca pareca mudar de faixa a meio.
      const playableReplacement: Track = {
        ...state.current,
        sourceId: replacement.sourceId,
        durationSeconds: replacement.durationSeconds ?? state.current.durationSeconds,
      };

      const queue = state.queue.slice();
      if (queue[state.queueIndex]?.sourceId === failedSourceId) {
        queue[state.queueIndex] = playableReplacement;
      }

      // O shuffle guarda chaves de faixa. Substituir a chave no mesmo lugar
      // preserva o percurso que o utilizador já estava a ouvir.
      const failedKey = trackKey(state.current);
      const replacementKey = trackKey(playableReplacement);
      const seen = new Set<string>();
      const shuffleOrder = state.shuffleOrder
        .map((key) => key === failedKey ? replacementKey : key)
        .filter((key) => {
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      replaced = true;
      return {
        current: playableReplacement,
        queue,
        shuffleOrder,
        error: null,
        positionMs: 0,
        durationMs: (playableReplacement.durationSeconds ?? 0) * 1000,
        buffering: true,
        isPlaying: true,
        activeBackend: 'resolving' as const,
        downloadProgress: null,
        autoplayOnLoad: true,
        resumePositionMs: null,
      };
    });
    return replaced;
  },

  skipUnavailableTrack: async (failedSourceId) => {
    const state = get();
    if (!state.current || state.current.sourceId !== failedSourceId) return;

    let target: Track | null = null;
    if (state.shuffle && state.queue.length > 1) {
      let order = state._ensureShuffleOrder();
      let targetIndex = stepIndex(order, state.queue, state.queueIndex, 1);
      if (targetIndex === null && state.repeatMode === 'all') {
        order = shuffleKeys(state.queue, state.queueIndex);
        set({ shuffleOrder: order });
        targetIndex = stepIndex(order, state.queue, state.queueIndex, 1);
      }
      if (targetIndex !== null) target = state.queue[targetIndex];
    } else if (state.queueIndex + 1 < state.queue.length) {
      target = state.queue[state.queueIndex + 1];
    } else if (state.repeatMode === 'all' && state.queue.length > 1) {
      target = state.queue[0];
    }

    // Não deixar o vídeo morto na fila desta sessão: com repeat all voltaria
    // a bloquear mais tarde. A biblioteca/playlist guardada não é alterada.
    const queue = state.queue.filter((_, index) => index !== state.queueIndex);
    if (target) {
      await get().playTrack(target, queue);
      return;
    }

    // Era a última faixa reproduzível. Terminar já, sem a chamada de rede do
    // rádio automático que deixava “Skipping…” visível indefinidamente.
    set({
      current: null,
      queue,
      queueIndex: 0,
      shuffleOrder: state.shuffleOrder.filter((key) => key !== trackKey(state.current!)),
      isPlaying: false,
      buffering: false,
      error: null,
      positionMs: 0,
      durationMs: 0,
      activeBackend: 'resolving',
      downloadProgress: null,
    });
  },

  adoptSession: ({ track, queue, queueIndex, positionMs }) => {
    const q = queue.length > 0 ? queue : [track];
    const index = Math.max(0, Math.min(queueIndex, q.length - 1));
    set({
      current: track,
      queue: q,
      queueIndex: index,
      error: null,
      positionMs,
      durationMs: (track.durationSeconds ?? 0) * 1000,
      buffering: true,
      isPlaying: true,
      activeBackend: 'resolving',
      downloadProgress: null,
      autoplayOnLoad: true,
      shuffleOrder: get().shuffle ? reconcileOrder(get().shuffleOrder, q, index) : [],
      // Os dois motores retomam por caminhos diferentes: o nativo consome o
      // `resumePositionMs` no beginPlayback, o do desktop lê o `positionMs`
      // no onReady do IFrame. Preencher os dois é o que faz o handoff cair
      // no segundo certo nas duas plataformas.
      resumePositionMs: positionMs > 1500 ? positionMs : null,
    });
  },

  playShuffled: async (tracks) => {
    if (tracks.length === 0) return;
    // O que estava nos botões era `sort(() => Math.random() - 0.5)`: um
    // baralhamento enviesado (comparador inconsistente — o TimSort do V8
    // deixa os elementos perto de onde estavam) que além disso NÃO ligava o
    // modo aleatório do player. Resultado: o botão Shuffle e o interruptor
    // do player discordavam, e a fila ficava fisicamente desordenada face à
    // biblioteca. Agora liga-se o modo a sério e a ordem é Fisher-Yates.
    const start = Math.floor(Math.random() * tracks.length);
    // Percurso limpo: sem isto o reconcile aproveitaria a ordem da fila
    // anterior e a primeira faixa podia cair no fim do percurso.
    set({ shuffle: true, shuffleOrder: [] });
    persistShuffle(true).catch(() => {});
    await get().playTrack(tracks[start], tracks, true);
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

    // Fim da fila: em vez de silêncio, o rádio. Normalmente já estendeu a
    // fila em antecipação (useAutoplayRadio) e nem se chega aqui; isto é a
    // rede de segurança para quando a rede foi lenta. Não recursa em ciclo:
    // se estender, a fila cresceu e a chamada seguinte encontra faixa; se
    // não estender, pára.
    const stopOrRadio = async () => {
      if (await get().extendQueueWithRadio()) {
        await get().next();
        return;
      }
      set({ isPlaying: false });
    };

    // Shuffle: seguir o percurso materializado, não sortear.
    //
    // O que estava aqui antes sorteava um índice diferente do atual a cada
    // chamada. Isso repete faixas antes de tocar as outras todas — numa fila
    // de 20, ouvir as 20 sem repetição era praticamente impossível.
    if (shuffle && queue.length > 1) {
      const order = get()._ensureShuffleOrder();
      const target = stepIndex(order, queue, queueIndex, 1);
      if (target !== null) {
        await playTrack(queue[target], queue);
        return;
      }
      // Percurso esgotado: com repeat "all" baralha-se outra vez (como a
      // Spotify) em vez de repetir a mesma ordem.
      if (repeatMode === 'all') {
        const fresh = shuffleKeys(queue, queueIndex);
        set({ shuffleOrder: fresh });
        const first = stepIndex(fresh, queue, queueIndex, 1);
        if (first !== null) {
          await playTrack(queue[first], queue);
          return;
        }
      }
      await stopOrRadio();
      return;
    }

    if (queueIndex + 1 < queue.length) {
      await playTrack(queue[queueIndex + 1], queue);
    } else if (repeatMode === 'all') {
      await playTrack(queue[0], queue);
    } else {
      await stopOrRadio();
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
    // Com shuffle, "anterior" volta pelo caminho por onde veio — impossível
    // enquanto a ordem era sorteada a cada salto.
    if (get().shuffle && queue.length > 1) {
      const order = get()._ensureShuffleOrder();
      const target = stepIndex(order, queue, queueIndex, -1);
      if (target !== null) {
        await playTrack(queue[target], queue);
        return;
      }
      if (repeatMode === 'all') {
        const lastKey = order[order.length - 1];
        const last = queue.findIndex((t) => trackKey(t) === lastKey);
        if (last >= 0) await playTrack(queue[last], queue);
      }
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

  setAutoplayRadio: (v) => set({ autoplayRadio: v }),

  setVolumeNormalization: (v) => set({ volumeNormalization: v }),

  extendQueueWithRadio: async () => {
    const { autoplayRadio, current, queue, queueIndex, repeatMode } = get();
    if (
      !shouldExtendWithRadio(autoplayRadio, !!current, get().upcomingQueue().length, repeatMode)
    ) {
      return false;
    }
    // Duas idas à rede em simultâneo (o efeito de antecipação e o `next()`
    // disparam quase ao mesmo tempo) duplicavam as faixas na fila.
    if (radioInFlight) return false;
    radioInFlight = true;
    try {
      const tracks = await fetchRadioTracks(radioSeeds(queue, queueIndex), queue);
      if (tracks.length === 0) return false;

      // A fila pode ter mudado enquanto isto foi à rede — reler o estado,
      // nunca usar o que foi capturado no início.
      const live = get();
      const merged = [...live.queue, ...tracks];
      set({
        queue: merged,
        radioActive: true,
        shuffleOrder: live.shuffle
          ? reconcileOrder(live.shuffleOrder, merged, live.queueIndex)
          : [],
      });
      return true;
    } catch {
      return false;
    } finally {
      radioInFlight = false;
    }
  },

  upcomingQueue: () => {
    const { queue, queueIndex, shuffle, shuffleOrder } = get();
    if (queue.length === 0) return [];
    if (!shuffle || shuffleOrder.length === 0) {
      return queue
        .slice(queueIndex + 1)
        .map((track, i) => ({ track, index: queueIndex + 1 + i }));
    }
    return upcomingIndexes(shuffleOrder, queue, queueIndex).map((index) => ({
      track: queue[index],
      index,
    }));
  },

  _ensureShuffleOrder: () => {
    const { queue, queueIndex, shuffleOrder } = get();
    const order = reconcileOrder(shuffleOrder, queue, queueIndex);
    set({ shuffleOrder: order });
    return order;
  },

  peekNextTrack: () => {
    const { queue, queueIndex, repeatMode, shuffle, shuffleOrder } = get();
    if (queue.length === 0) return null;
    // Repeat "one" volta à mesma faixa: já está em cache, nada a pré-carregar.
    if (repeatMode === 'one') return null;

    if (shuffle && queue.length > 1) {
      // Sem percurso ainda (shuffle acabado de ligar sem nenhum salto), não
      // se adivinha — gerar aqui daria uma ordem diferente da que o `next()`
      // vai usar, e pré-carregava-se a faixa errada.
      if (shuffleOrder.length === 0) return null;
      const target = stepIndex(shuffleOrder, queue, queueIndex, 1);
      // Fim do percurso com repeat "all": vai baralhar outra vez, é
      // imprevisível por definição. Melhor não pré-carregar nada.
      return target !== null ? queue[target] : null;
    }

    if (queueIndex + 1 < queue.length) return queue[queueIndex + 1];
    if (repeatMode === 'all') return queue[0];
    return null;
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
  // Ligar o shuffle gera o percurso de raiz (com a faixa atual à cabeça);
  // desligar deita-o fora, para a próxima vez começar limpo.
  setShuffle: (v) =>
    set((s) => ({
      shuffle: v,
      shuffleOrder: v ? shuffleKeys(s.queue, s.queueIndex) : [],
    })),
  toggleShuffle: () => get().setShuffle(!get().shuffle),
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
    // Persistido aqui e não nos ecrãs de Definições: são dois (telemóvel e
    // desktop) e assim nenhum se pode esquecer. Antes o preset voltava a
    // "normal" a cada arranque, apesar de estar apresentado como definição.
    persistSoundPreset(preset).catch(() => {});
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

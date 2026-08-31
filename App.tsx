import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UpdateSheet } from './src/components/UpdateSheet';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  getAutoplayRadio,
  getKeepAwake,
  getRepeatMode,
  getShowRewindButton,
  getShuffle,
  getShuffleInteligente,
  getPlaybackRate,
  getEqGanhos,
  getAjustesPorFaixa,
  getVolumeNormalization,
  loadPrefsCache,
} from './src/lib/prefs';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { loadLoudnessCache } from './src/lib/loudnessCache';
import { supabase } from './src/lib/supabase';
import {
  invalidateStaleAudioCache,
  loadCachedAudioIndex,
  migrateAudioCacheToDocuments,
  pruneAudioCacheLRU,
} from './src/lib/youtubeCache';
import { registerBackgroundInboxCheck } from './src/lib/backgroundInbox';
import { useAuth } from './src/state/auth';
import { usePlayer } from './src/state/player';
import { useTheme } from './src/state/theme';

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
    // Hidrata preferências persistidas no arranque da app.
    loadPrefsCache();
    // Verificação da inbox com a app fechada (best-effort; ver backgroundInbox).
    registerBackgroundInboxCheck();
    invalidateStaleAudioCache()
      // As músicas viviam na pasta Caches, que o iOS apaga sozinho quando
      // precisa de espaço — era por isso que os downloads desapareciam.
      // Passaram para Documents; isto muda de sítio o que já estava lá.
      .then(() => migrateAudioCacheToDocuments())
      .then(() => {
      // Índice em memória dos downloads (badges "offline" nas listas).
      loadCachedAudioIndex();
      // Pruning LRU do cache de áudio — só no arranque, nunca durante a
      // reprodução, e protegendo a fila restaurada da sessão anterior.
      const prune = () =>
        pruneAudioCacheLRU(usePlayer.getState().queue.map((t) => t.sourceId));
      if (usePlayer.persist.hasHydrated()) prune();
      else usePlayer.persist.onFinishHydration(prune);
    });
    useTheme.getState().loadTheme();
    // Loudness conhecida por vídeo (normalização de volume) — tem de estar em
    // memória antes de a primeira faixa arrancar.
    loadLoudnessCache();
    Promise.all([
      getRepeatMode(),
      getShuffle(),
      getShuffleInteligente(),
      getShowRewindButton(),
      getAutoplayRadio(),
      getVolumeNormalization(),
      getPlaybackRate(),
      getEqGanhos(),
      getAjustesPorFaixa(),
    ]).then(([repeatMode, shuffle, shuffleInteligente, showRewindButton, autoplayRadio, volumeNormalization, playbackRate, eqGanhos, ajustes]) => {
      const player = usePlayer.getState();
      player.setRepeatMode(repeatMode);
      player.setShuffle(shuffle);
      // O "inteligente" so vale com o shuffle ligado — ver lib/smartShuffle.ts.
      usePlayer.setState({ shuffleInteligente: shuffle && shuffleInteligente });
      player.setShowRewindButton(showRewindButton);
      player.setAutoplayRadio(autoplayRadio);
      player.setVolumeNormalization(volumeNormalization);
      // A memoria por faixa e os ganhos entram JUNTOS e sem reaplicar nada: o
      // grafo do EQ so existe quando ha um video, e isso e tratado no
      // playTrack.
      player._carregarAjustes(ajustes, eqGanhos, playbackRate);
    });

    // "Manter o ecrã ligado" só era aplicado pelo useEffect do ecrã de
    // Definições. Depois de reiniciar a app o interruptor aparecia ligado
    // mas o ecrã apagava na mesma, até se visitar esse ecrã.
    getKeepAwake().then((on) => {
      // No desktop isto assenta na Wake Lock API do browser, que pode
      // recusar; falhar a manter o ecrã ligado não pode partir o arranque.
      if (on) activateKeepAwakeAsync().catch(() => {});
    });
  }, [init]);

  // Renovação automática do token do Supabase ligada ao ciclo de vida da app.
  // Sem isto, o token expira em background e as queries (com RLS) voltam
  // vazias ao regressar — "perdia" biblioteca/artistas até reiniciar. Ao
  // voltar a "active" força-se a renovação; em background pára-se o ticker.
  useEffect(() => {
    supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

  // Temporizador (Sleep Timer) global ticking a cada 1 segundo
  useEffect(() => {
    const id = setInterval(() => {
      usePlayer.getState().tickSleepTimer();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
      <UpdateSheet />
    </SafeAreaProvider>
  );
}

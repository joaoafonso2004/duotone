import 'react-native-url-polyfill/auto';
import { startConnectivity,useConnectivity } from './src/state/connectivity';
import { loadRecommendationFeedback,useRecommendationFeedback } from './src/state/recommendationFeedback';
import { refreshSuggestionPreferences } from './src/state/recomendacoes';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {useLyricsPrefetch} from './src/hooks/useLyricsPrefetch';
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
import {chaveDaFaixa} from './src/lib/equalizer';
import { startTrackAdjustmentSync } from './src/state/trackAdjustments';
import { usePlayer } from './src/state/player';
import { useTheme } from './src/state/theme';
import { useAcompanharCapa } from './src/hooks/useAcompanharCapa';
import { useEstadoDoWidget } from './src/hooks/useEstadoDoWidget';
import { useRecomendacoes } from './src/state/recomendacoes';
import { iniciarPresenca } from './src/lib/presenceSync';
import { sincronizarPreferencias } from './src/lib/prefsSync';
import { iniciarEventos } from './src/lib/eventos';
import { iniciarSocial } from './src/state/social';

export default function App() {
  // O acento segue a capa a tocar quando esse modo esta escolhido. Aqui em
  // cima porque a App e a raiz das duas plataformas -- um so sitio a ligar.
  useAcompanharCapa();
  // E o widget do ecra inicial fica a par do que a app sabe (so no iOS).
  useEstadoDoWidget();
  useLyricsPrefetch();
  useEffect(startConnectivity,[]);
  const offline=useConnectivity(s=>s.offline);
  const sleepTimerEndsAt=usePlayer(s=>s.sleepTimerEndsAt);
  const init = useAuth((s) => s.init);
  const userId = useAuth((s) => s.session?.user.id);
  const adjustmentUserId=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const [preferencesReady,setPreferencesReady]=useState(false);
  useEffect(()=>{
    if(!preferencesReady)return;
    const player=usePlayer.getState();player._carregarAjustes({},player.padraoGanhos,player.padraoRate);
    if(!adjustmentUserId)return;
    return startTrackAdjustmentSync(adjustmentUserId,values=>{
      const p=usePlayer.getState(),key=p.current?chaveDaFaixa(p.current):null;
      // Um polling sem alterações não aplica a meio da música um novo padrão
      // escolhido nas Definições para as faixas seguintes.
      if(!key||JSON.stringify(p.ajustesPorFaixa[key])===JSON.stringify(values[key]))usePlayer.setState({ajustesPorFaixa:values});
      else p._carregarAjustes(values,p.padraoGanhos,p.padraoRate);
    });
  },[adjustmentUserId,preferencesReady]);

  useEffect(() => {
    if (!userId||offline) return;
    const pararPresenca = iniciarPresenca(userId);
    // As preferências passam a viver na conta: reinstalar deixa de as apagar.
    const pararPrefs = sincronizarPreferencias(userId);
    const pararEventos = iniciarEventos(userId);
    const pararSocial = iniciarSocial(userId);
    return () => { pararPresenca(); pararSocial(); pararPrefs(); pararEventos(); };
  }, [userId,offline]);

  useEffect(() => {
    if (!userId||offline) return;
    let active=true;
    void loadRecommendationFeedback(userId).then(()=>{if(active)void useRecomendacoes.getState().carregar();});
    return () => {active=false;useRecomendacoes.getState().limpar();};
  }, [userId,offline]);

  useEffect(()=>useRecommendationFeedback.subscribe((next,prev)=>{
    if(next.revision!==prev.revision)refreshSuggestionPreferences();
  }),[]);
  useEffect(()=>{if(!userId)void loadRecommendationFeedback(null);},[userId]);
  useEffect(()=>{
    if(offline){supabase.auth.stopAutoRefresh();return;}
    supabase.auth.startAutoRefresh();
    void useAuth.getState().refreshSession().catch(()=>{});
  },[offline]);

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
      if (usePlayer.persist.hasHydrated()) {if(!useConnectivity.getState().offline)prune();}
      else usePlayer.persist.onFinishHydration(()=>{if(!useConnectivity.getState().offline)prune();});
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
    ]).then(([repeatMode, shuffle, shuffleInteligente, showRewindButton, autoplayRadio, volumeNormalization, playbackRate, eqGanhos]) => {
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
      player._carregarAjustes({},eqGanhos,playbackRate);
      setPreferencesReady(true);
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
    if(!useConnectivity.getState().offline)supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active'&&!useConnectivity.getState().offline) {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

  // O relógio do sleep timer só existe quando há um timer armado. Antes a app
  // acordava uma vez por segundo durante toda a sua vida para uma função que,
  // quase sempre, devolvia imediatamente.
  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    usePlayer.getState().tickSleepTimer();
    const id = setInterval(() => {
      usePlayer.getState().tickSleepTimer();
    }, 1000);
    return () => clearInterval(id);
  }, [sleepTimerEndsAt]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
      <UpdateSheet />
    </SafeAreaProvider>
  );
}

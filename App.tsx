import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  getRepeatMode,
  getShowRewindButton,
  getShuffle,
  loadPrefsCache,
} from './src/lib/prefs';
import { supabase } from './src/lib/supabase';
import { useAuth } from './src/state/auth';
import { usePlayer } from './src/state/player';
import { useTheme } from './src/state/theme';

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
    // Hidrata preferências persistidas no arranque da app.
    loadPrefsCache();
    useTheme.getState().loadTheme();
    Promise.all([getRepeatMode(), getShuffle(), getShowRewindButton()]).then(
      ([repeatMode, shuffle, showRewindButton]) => {
        const player = usePlayer.getState();
        player.setRepeatMode(repeatMode);
        player.setShuffle(shuffle);
        player.setShowRewindButton(showRewindButton);
      }
    );
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
    </SafeAreaProvider>
  );
}

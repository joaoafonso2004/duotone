import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BotGuardMinter } from './src/components/BotGuardMinter';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  getDefaultYtViewMode,
  getRepeatQueue,
  getShowRewindButton,
  loadPrefsCache,
} from './src/lib/prefs';
import { useAuth } from './src/state/auth';
import { usePlayer } from './src/state/player';

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
    // Hidrata preferências persistidas (Definições) no arranque da app.
    loadPrefsCache();
    Promise.all([getDefaultYtViewMode(), getRepeatQueue(), getShowRewindButton()]).then(
      ([ytViewMode, repeatQueue, showRewindButton]) => {
        const player = usePlayer.getState();
        player.setYtViewMode(ytViewMode);
        player.setRepeatQueue(repeatQueue);
        player.setShowRewindButton(showRewindButton);
      }
    );
  }, [init]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* Escondida, montada uma única vez para a app inteira — gera PO
          Tokens on-device (ver BotGuardMinter.tsx / potProvider.ts). */}
      <BotGuardMinter />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

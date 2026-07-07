import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
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
    Promise.all([getRepeatQueue(), getShowRewindButton()]).then(
      ([repeatQueue, showRewindButton]) => {
        const player = usePlayer.getState();
        player.setRepeatQueue(repeatQueue);
        player.setShowRewindButton(showRewindButton);
      }
    );
  }, [init]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

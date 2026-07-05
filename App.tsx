import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/state/auth';

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

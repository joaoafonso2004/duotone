import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { GlitchMode } from '../lib/prefs';
import { hapticSelection } from '../lib/haptics';

const KEY = 'pref:glitchModeIOS';
let loading: Promise<void> | null = null;
let revision = 0;
let writing = Promise.resolve();
export const useCapaIOS = create<{ mode: GlitchMode; feedback: number;
  setMode: (mode: GlitchMode) => void; toggle: () => void }>((set, get) => ({
  mode: 'reactive', feedback: 0,
  setMode: mode => {
    if (get().mode === mode) return;
    revision++; hapticSelection(); set({ mode, feedback: get().feedback + 1 });
    writing = writing.then(() => AsyncStorage.setItem(KEY, mode)).catch(() => {});
  },
  toggle: () => { if (get().mode !== 'off') get().setMode(get().mode === 'reactive' ? 'static' : 'reactive'); },
}));
export function loadCapaIOS(): Promise<void> {
  if (!loading) {
    const started = revision;
    loading = AsyncStorage.getItem(KEY).then(value => {
      if (started === revision) useCapaIOS.setState({ mode: value === 'static' || value === 'off' ? value : 'reactive' });
    }).catch(() => {});
  }
  return loading;
}

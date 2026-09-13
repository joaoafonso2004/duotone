import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { hapticSelection } from '../lib/haptics';
import { interpretarEstiloDaCapa, type EstiloDaCapaIOS } from '../lib/capaFlutuante3D';

const KEY = 'pref:artworkStyleIOS';
const LEGACY_KEY = 'pref:glitchModeIOS';
let loading: Promise<void> | null = null;
let revision = 0;
let writing = Promise.resolve();
export const useCapaIOS = create<{
  style: EstiloDaCapaIOS;
  loaded: boolean;
  setStyle: (style: EstiloDaCapaIOS) => void;
}>((set, get) => ({
  style: 'floating',
  loaded: false,
  setStyle: style => {
    if (get().style === style && get().loaded) return;
    revision++;
    hapticSelection();
    set({ style, loaded: true });
    writing = writing.then(() => AsyncStorage.setItem(KEY, style)).catch(() => {});
  },
}));
export function loadCapaIOS(): Promise<void> {
  if (!loading) {
    const started = revision;
    loading = Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(LEGACY_KEY)]).then(([value, legacy]) => {
      if (started !== revision) return;
      const style = interpretarEstiloDaCapa(value, legacy);
      useCapaIOS.setState({ style, loaded: true });
      // Grava já a migração para não depender para sempre da chave do glitch.
      if (value !== style) writing = writing.then(() => AsyncStorage.setItem(KEY, style)).catch(() => {});
    }).catch(() => {
      if (started === revision) useCapaIOS.setState({ loaded: true });
    });
  }
  return loading;
}

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AccentColorName = 'violet' | 'blue' | 'orange' | 'green' | 'pink' | 'red' | 'mono' | 'steel';

export interface AccentTheme {
  name: AccentColorName;
  color: string;
  soft: string;
  gradient: readonly [string, string];
  textColorOnGradient: string;
}

export const ACCENT_THEMES: Record<AccentColorName, AccentTheme> = {
  violet: {
    name: 'violet',
    color: '#8B5CF6',
    soft: 'rgba(139,92,246,0.16)',
    gradient: ['#7C3AED', '#DB2777'] as const,
    textColorOnGradient: '#FFFFFF',
  },
  blue: {
    name: 'blue',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.16)',
    gradient: ['#2563EB', '#22D3EE'] as const,
    textColorOnGradient: '#FFFFFF',
  },
  orange: {
    name: 'orange',
    color: '#F97316',
    soft: 'rgba(249,115,22,0.16)',
    gradient: ['#F97316', '#EF4444'] as const,
    textColorOnGradient: '#FFFFFF',
  },
  green: {
    name: 'green',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.16)',
    gradient: ['#10B981', '#84CC16'] as const,
    textColorOnGradient: '#FFFFFF',
  },
  pink: {
    name: 'pink',
    color: '#EC4899',
    soft: 'rgba(236,72,153,0.16)',
    gradient: ['#EC4899', '#8B5CF6'] as const,
    textColorOnGradient: '#FFFFFF',
  },
  red: {
    name: 'red',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    gradient: ['#EF4444', '#F59E0B'] as const,
    textColorOnGradient: '#FFFFFF',
  },
  mono: {
    name: 'mono',
    color: '#F5F5F7',
    soft: 'rgba(255,255,255,0.12)',
    gradient: ['#FFFFFF', '#A1A1AA'] as const,
    textColorOnGradient: '#0A0A0F', // Preto para contraste absoluto
  },
  steel: {
    name: 'steel',
    color: '#A1A1AA',
    soft: 'rgba(161,161,170,0.12)',
    gradient: ['#71717A', '#3F3F46'] as const,
    textColorOnGradient: '#FFFFFF', // Branco contrasta bem com cinzento escuro
  },
};

interface ThemeState {
  themeName: AccentColorName;
  theme: AccentTheme;
  setTheme: (name: AccentColorName) => Promise<void>;
  loadTheme: () => Promise<void>;
}

export const useTheme = create<ThemeState>((set) => ({
  themeName: 'violet',
  theme: ACCENT_THEMES.violet,
  setTheme: async (name) => {
    const theme = ACCENT_THEMES[name] || ACCENT_THEMES.violet;
    set({ themeName: name, theme });
    await AsyncStorage.setItem('pref:accentTheme', name);
  },
  loadTheme: async () => {
    const saved = await AsyncStorage.getItem('pref:accentTheme');
    if (saved && saved in ACCENT_THEMES) {
      const name = saved as AccentColorName;
      set({ themeName: name, theme: ACCENT_THEMES[name] });
    }
  },
}));

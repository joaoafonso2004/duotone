import { create } from 'zustand';

interface NotificationState {
  hasNotification: boolean; // Red dot on bottom Profile tab icon
  hasSocialNotification: boolean; // Red dot on Social button inside Profile Screen
  setHasNotification: (v: boolean) => void;
  setHasSocialNotification: (v: boolean) => void;
}

export const useNotifications = create<NotificationState>((set) => ({
  hasNotification: false,
  hasSocialNotification: false,
  setHasNotification: (v) => set({ hasNotification: v }),
  setHasSocialNotification: (v) => set({ hasSocialNotification: v }),
}));

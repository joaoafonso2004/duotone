import { create } from 'zustand';
import { enqueueNotification, type InAppNotification } from '../lib/inAppNotifications';

interface NotificationState {
  epoch: number;
  banners: InAppNotification[];
  enqueue: (item: InAppNotification) => void;
  dismiss: (id: string) => void;
  clearBanners: () => void;
  hasNotification: boolean; // Red dot on bottom Profile tab icon
  hasSocialNotification: boolean; // Red dot on Social button inside Profile Screen
  setHasNotification: (v: boolean) => void;
  setHasSocialNotification: (v: boolean) => void;
}

export const useNotifications = create<NotificationState>((set) => ({
  epoch:0,banners: [],
  enqueue: item => set(s => ({banners:enqueueNotification(s.banners,item)})),
  dismiss: id => set(s => ({banners:s.banners.filter(n => n.id !== id)})),
  clearBanners: () => set(s => ({banners:[],epoch:s.epoch+1})),
  hasNotification: false,
  hasSocialNotification: false,
  setHasNotification: (v) => set({ hasNotification: v }),
  setHasSocialNotification: (v) => set({ hasSocialNotification: v }),
}));

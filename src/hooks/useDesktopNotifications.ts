import { useEffect, useRef } from 'react';
import { useAuth } from '../state/auth';
import { useSocial } from '../state/social';
import { useNotifications } from '../state/notifications';
import { getNotificationsEnabled } from '../lib/prefs';
import { createNotificationJournal, shouldPresentNotification } from '../lib/inAppNotifications';
import { naoLidasPorAmigo } from '../lib/social';

/** One inbox feeds the banner, native notification and taskbar count. */
export function useDesktopNotifications(
  abrirSocial: (conversation?: { friendId?: string; groupId?: string }) => void,
  openConversation: () => string | null,
) {
  const userId = useAuth(s => s.session?.user.id);
  const currentConversation = useRef(openConversation);
  currentConversation.current = openConversation;
  useEffect(() => {
    useNotifications.getState().clearBanners();
    if (!userId) return;
    const desktop = window.duotoneDesktop;
    const consume = createNotificationJournal(userId);
    let alive = true;
    let delivery = Promise.resolve();
    const focused = () => document.visibilityState !== 'hidden' && document.hasFocus();
    const count = () => [...naoLidasPorAmigo(useSocial.getState().received.filter(m => m.sender.id !== userId), useSocial.getState().seen).values()].reduce((a, b) => a + b, 0);
    const context = (enabled: boolean) => ({ enabled, active: focused(),
      openConversation: currentConversation.current(), seen: useSocial.getState().seen });
    const process = () => {
      const next = useSocial.getState();
      desktop?.setUnreadMessages?.(count(), false);
      for (const item of useNotifications.getState().banners) {
        if (!shouldPresentNotification(item, context(true))) useNotifications.getState().dismiss(item.id);
      }
      if (!next.inboxSnapshot) return;
      const items = consume(next.inboxSnapshot);
      if (!items.length) return;
      delivery = delivery.then(async () => {
        const enabled = await getNotificationsEnabled();
        if (!alive || useAuth.getState().session?.user.id !== userId) return;
        for (const item of items) {
          if (shouldPresentNotification(item, context(enabled))) useNotifications.getState().enqueue(item);
          // Test read markers again after the async preference read. Focusing a
          // conversation on either device can have cleared this message.
          if (item.kind === 'message' && !focused() && shouldPresentNotification(item,
            { enabled, active: true, openConversation: null, seen: useSocial.getState().seen })) {
            desktop?.setUnreadMessages?.(count(), true);
            desktop?.notifyMessage?.({ ...item, ...item.target });
          }
        }
      }).catch(() => {});
    };
    const unsubscribe = useSocial.subscribe(process);
    const visibility = () => { if (!focused()) useNotifications.getState().clearBanners(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', visibility);
    const click = desktop?.onNotificationClick?.(abrirSocial);
    process();
    return () => {
      alive = false; unsubscribe(); click?.();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', visibility);
      desktop?.setUnreadMessages?.(0, false);
      useNotifications.getState().clearBanners();
    };
  }, [userId, abrirSocial]);
}

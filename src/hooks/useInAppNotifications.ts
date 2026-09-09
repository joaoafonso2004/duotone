import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../state/auth';
import { useSocial } from '../state/social';
import { useNotifications } from '../state/notifications';
import { useConnectivity } from '../state/connectivity';
import { getNotificationsEnabled } from '../lib/prefs';
import { createNotificationJournal, shouldPresentNotification } from '../lib/inAppNotifications';

/** Mounted once at the mobile navigator. No system permissions or APNs. */
export function useInAppNotifications(openConversation: () => string | null) {
  const userId = useAuth(s => s.session?.user.id);
  useEffect(() => {
    useNotifications.getState().clearBanners();
    if (!userId) return;
    const consume = createNotificationJournal(userId);
    let alive = true, visibilityEpoch = 0;
    let delivery = Promise.resolve();
    const context = (enabled: boolean) => ({enabled,
      active:AppState.currentState === 'active' && !useConnectivity.getState().offline,
      openConversation:openConversation(), seen:useSocial.getState().seen});
    const unsubscribe = useSocial.subscribe((next, previous) => {
      // Opening/reading a conversation also removes its pending cards.
      for (const item of useNotifications.getState().banners) {
        const resolvedRequest = item.kind === 'request' && !next.friends.some(f => `request:${f.friendId}` === item.id && f.status === 'pending' && !f.isSender);
        if (resolvedRequest || !shouldPresentNotification(item,context(true))) useNotifications.getState().dismiss(item.id);
      }
      if (!next.inboxSnapshot || next.inboxSnapshot === previous.inboxSnapshot) return;
      const items = consume(next.inboxSnapshot); // Reserve IDs synchronously, before storage awaits.
      const epoch = visibilityEpoch;
      const bannerEpoch = useNotifications.getState().epoch;
      if (!items.length) return;
      delivery = delivery.then(async () => {
        const enabled = await getNotificationsEnabled();
        if (!alive || bannerEpoch !== useNotifications.getState().epoch || epoch !== visibilityEpoch || useAuth.getState().session?.user.id !== userId) return;
        for (const item of items) {
          if (shouldPresentNotification(item,context(enabled))) useNotifications.getState().enqueue(item);
        }
      }).catch(() => {});
    });
    const initial = useSocial.getState().inboxSnapshot;
    if (initial) consume(initial);
    const app = AppState.addEventListener('change', () => {
      visibilityEpoch++;
      useNotifications.getState().clearBanners();
    });
    const connection = useConnectivity.subscribe(s => {
      if (s.offline) { visibilityEpoch++; useNotifications.getState().clearBanners(); }
    });
    return () => { alive=false; unsubscribe(); app.remove(); connection(); useNotifications.getState().clearBanners(); };
  }, [userId, openConversation]);
}

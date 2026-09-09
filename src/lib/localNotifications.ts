import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Migration only: an older installation may still deliver a queued local alert.
// All new mobile notifications are rendered inside the app.
if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({shouldPlaySound:false, shouldSetBadge:false,
    shouldShowBanner:false, shouldShowList:false}),
});
export async function clearLegacySystemNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
    Notifications.setBadgeCountAsync(0),
  ]);
}

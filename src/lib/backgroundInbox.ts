import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { clearLegacySystemNotifications } from './localNotifications';

const TASK = 'duotone-inbox-check';
// Keep a harmless definition during migration if iOS wakes an old registration.
TaskManager.defineTask(TASK, async () => BackgroundTask.BackgroundTaskResult.Success);

/** Remove the previous best-effort background sender on existing installs. */
export async function retireBackgroundInboxCheck(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch { /* Retried next launch; the legacy task itself no longer sends. */ }
  await clearLegacySystemNotifications();
}

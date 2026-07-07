import * as Haptics from 'expo-haptics';
import { isHapticsEnabledSync } from './prefs';

/** Wrappers finos sobre expo-haptics que respeitam a preferência global
 * "Háptica" das Definições (ver prefs.ts). Reexporta os enums para os
 * chamadores não precisarem de importar 'expo-haptics' diretamente. */

export const ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = Haptics.NotificationFeedbackType;

export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light
): void {
  if (isHapticsEnabledSync()) Haptics.impactAsync(style);
}

export function hapticSelection(): void {
  if (isHapticsEnabledSync()) Haptics.selectionAsync();
}

export function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
): void {
  if (isHapticsEnabledSync()) Haptics.notificationAsync(type);
}

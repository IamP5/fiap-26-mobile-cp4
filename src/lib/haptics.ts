import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Thin, fire-and-forget haptics vocabulary. Android routes through
// performAndroidHapticsAsync (system haptic constants, no VIBRATE permission);
// web is skipped — the Vibration API buzzes, it does not tick.
const run = (ios: () => Promise<void>, android: Haptics.AndroidHaptics): void => {
  if (Platform.OS === 'web') {
    return;
  }
  const task: Promise<void> = Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(android) : ios();
  task.catch(() => undefined);
};

export const haptics = {
  /** Light tick for taps on primary controls (send, tab switch). */
  tap: (): void =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), Haptics.AndroidHaptics.Context_Click),
  /** Selection changed (segmented control, filter chip, switch). */
  select: (): void => run(() => Haptics.selectionAsync(), Haptics.AndroidHaptics.Segment_Tick),
  /** Long-press opened something. */
  long: (): void =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), Haptics.AndroidHaptics.Long_Press),
  success: (): void =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), Haptics.AndroidHaptics.Confirm),
  error: (): void =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), Haptics.AndroidHaptics.Reject),
};

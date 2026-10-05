import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import type { RemoteMessage } from '@react-native-firebase/messaging';

import type { PushPayload } from '../../types/notification';
import type { PushApi, PushAvailability } from './types';

export type { PushApi, PushAvailability } from './types';

/**
 * Thin wrapper over React Native Firebase Messaging (FCM on Android AND iOS:
 * on iOS the SDK registers with APNs and exchanges that for an FCM token, so
 * the API only ever talks to FCM).
 *
 * The native module does not exist in Expo Go, so it is imported lazily and
 * any failure degrades to "unsupported" instead of crashing the app.
 */

const readString = (data: RemoteMessage['data'], key: string): string | null => {
  const value: unknown = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

/** Extracts the routing data the API puts in every push payload. */
export const toPushPayload = (message: RemoteMessage | null): PushPayload | null => {
  if (message === null) {
    return null;
  }
  const conversationId: string | null = readString(message.data, 'conversationId');
  const conversationType: string | null = readString(message.data, 'conversationType');
  if (conversationId === null || (conversationType !== 'direct' && conversationType !== 'group')) {
    return null;
  }
  return {
    conversationId,
    conversationType,
    title: message.notification?.title ?? null,
    body: message.notification?.body ?? null,
  };
};

let cached: Promise<PushAvailability> | null = null;

export const loadPushApi = (): Promise<PushAvailability> => {
  if (cached === null) {
    cached = createPushApi();
  }
  return cached;
};

const createPushApi = async (): Promise<PushAvailability> => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { available: false, reason: 'Notificações push só funcionam no Android e no iOS.' };
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return {
      available: false,
      reason: 'O Expo Go não inclui o Firebase Cloud Messaging. Use um development build (npx expo run:android / run:ios).',
    };
  }
  try {
    const fcm = await import('@react-native-firebase/messaging');
    const messaging = fcm.getMessaging();

    const api: PushApi = {
      requestPermission: async (): Promise<boolean> => {
        if (Platform.OS === 'android') {
          // Android 13+ requires the runtime POST_NOTIFICATIONS permission.
          if (typeof Platform.Version === 'number' && Platform.Version >= 33) {
            const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            return result === PermissionsAndroid.RESULTS.GRANTED;
          }
          return true;
        }
        const status = await fcm.requestPermission(messaging);
        return status === fcm.AuthorizationStatus.AUTHORIZED || status === fcm.AuthorizationStatus.PROVISIONAL;
      },
      getToken: async (): Promise<string | null> => {
        const token: string = await fcm.getToken(messaging);
        return token.length > 0 ? token : null;
      },
      deleteToken: () => fcm.deleteToken(messaging),
      onTokenRefresh: (listener) => fcm.onTokenRefresh(messaging, listener),
      onForegroundMessage: (listener) =>
        fcm.onMessage(messaging, (message: RemoteMessage) => {
          const payload = toPushPayload(message);
          if (payload !== null) {
            listener(payload);
          }
        }),
      onNotificationOpened: (listener) =>
        fcm.onNotificationOpenedApp(messaging, (message: RemoteMessage) => {
          const payload = toPushPayload(message);
          if (payload !== null) {
            listener(payload);
          }
        }),
      getInitialNotification: async () => toPushPayload(await fcm.getInitialNotification(messaging)),
    };
    return { available: true, api };
  } catch {
    return { available: false, reason: 'O módulo de notificações não está disponível neste build.' };
  }
};

/**
 * Must run at startup (index.ts). Notification messages are displayed by the
 * OS while the app is in background or closed; this handler only exists so
 * FCM never warns about a missing one for data-only messages.
 */
export const registerBackgroundHandler = (): void => {
  void loadPushApi().then(async (availability: PushAvailability) => {
    if (!availability.available) {
      return;
    }
    const fcm = await import('@react-native-firebase/messaging');
    fcm.setBackgroundMessageHandler(fcm.getMessaging(), async () => undefined);
  });
};

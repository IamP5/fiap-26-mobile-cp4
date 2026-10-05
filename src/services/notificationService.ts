import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import type { DevicePlatform, PushPayload, PushStatus, StoredDevice } from '../types/notification';
import { NETWORK_TIMEOUT_MS, withTimeout } from '../utils/async';
import { translateFirebaseError } from '../utils/errors';
import { getDeviceId } from './deviceId';
import { firestore } from './firebase';
import { loadPushApi, type PushAvailability } from './push/nativeMessaging';

/**
 * Device side of push notifications: permission, FCM token registration in
 * Firestore (users/{uid}/devices/{deviceId}), token refresh, and receiving /
 * tapping notifications. Sending is NOT done here: the app only asks the
 * team's API, which holds the admin credentials.
 */

const devicePlatform = (): DevicePlatform | null =>
  Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;

const deviceRef = async (uid: string) => doc(firestore, 'users', uid, 'devices', await getDeviceId());

const saveToken = async (uid: string, token: string, enabled: boolean): Promise<void> => {
  const platform: DevicePlatform | null = devicePlatform();
  if (platform === null) {
    return;
  }
  const device: StoredDevice = { token, platform, enabled, updatedAt: Date.now() };
  await withTimeout(
    setDoc(await deviceRef(uid), device),
    NETWORK_TIMEOUT_MS,
    'Tempo esgotado ao registrar o aparelho para notificações.',
  );
};

/** Keeps the user's on/off choice for this device across token refreshes. */
const storedPreference = async (uid: string): Promise<boolean> => {
  try {
    const snapshot = await getDoc(await deviceRef(uid));
    const enabled: unknown = snapshot.exists() ? snapshot.data().enabled : undefined;
    return typeof enabled === 'boolean' ? enabled : true;
  } catch {
    return true;
  }
};

/** FCM registration failures with a cause the user can act on. */
const describePushError = (error: unknown): string => {
  const raw: string = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (raw.includes('apns') || raw.includes('aps-environment') || raw.includes('entitlement')) {
    return 'O iPhone não conseguiu se registrar no serviço de push da Apple (APNs). Use um aparelho físico com o app assinado e a chave APNs configurada no Firebase.';
  }
  if (raw.includes('service_not_available') || raw.includes('play services') || raw.includes('missing_instanceid')) {
    return 'Este aparelho não tem o Google Play Services disponível, necessário para receber notificações.';
  }
  return translateFirebaseError(error);
};

export const registerDevice = async (uid: string): Promise<PushStatus> => {
  const availability: PushAvailability = await loadPushApi();
  if (!availability.available) {
    return { state: 'unsupported', reason: availability.reason };
  }
  try {
    const granted: boolean = await availability.api.requestPermission();
    if (!granted) {
      return { state: 'denied' };
    }
    const token: string | null = await availability.api.getToken();
    if (token === null) {
      return { state: 'no_token' };
    }
    const enabled: boolean = await storedPreference(uid);
    await saveToken(uid, token, enabled);
    return { state: 'registered', enabled };
  } catch (error: unknown) {
    return { state: 'error', message: describePushError(error) };
  }
};

/** FCM rotates tokens; the stored one is replaced so pushes keep arriving. */
export const watchTokenRefresh = async (uid: string): Promise<() => void> => {
  const availability: PushAvailability = await loadPushApi();
  if (!availability.available) {
    return () => undefined;
  }
  return availability.api.onTokenRefresh((token: string) => {
    void storedPreference(uid)
      .then((enabled: boolean) => saveToken(uid, token, enabled))
      .catch(() => undefined);
  });
};

export const setDeviceNotificationsEnabled = async (uid: string, enabled: boolean): Promise<void> => {
  await withTimeout(
    updateDoc(await deviceRef(uid), { enabled, updatedAt: Date.now() }),
    NETWORK_TIMEOUT_MS,
    'Tempo esgotado ao salvar a preferência de notificações.',
  );
};

/**
 * Logout: removes this device from the account and invalidates the token, so
 * the previous user never receives pushes on this phone again.
 */
export const unregisterDevice = async (uid: string): Promise<void> => {
  try {
    await withTimeout(deleteDoc(await deviceRef(uid)), 5000, 'timeout');
  } catch {
    // Offline logout: the API also drops tokens FCM reports as dead.
  }
  const availability: PushAvailability = await loadPushApi();
  if (availability.available) {
    await availability.api.deleteToken().catch(() => undefined);
  }
};

export type NotificationHandlers = {
  /** A push arrived while the app is open (the OS shows nothing then). */
  onForeground: (payload: PushPayload) => void;
  /** The user tapped a notification (app in background or closed). */
  onOpen: (payload: PushPayload) => void;
};

let initialNotificationConsumed = false;

export const listenForNotifications = async (handlers: NotificationHandlers): Promise<() => void> => {
  const availability: PushAvailability = await loadPushApi();
  if (!availability.available) {
    return () => undefined;
  }
  const { api } = availability;
  const unsubscribers: Array<() => void> = [
    api.onForegroundMessage(handlers.onForeground),
    api.onNotificationOpened(handlers.onOpen),
  ];
  // Cold start from a notification tap. FCM keeps returning that same
  // notification for the whole process lifetime, so it is consumed once.
  if (!initialNotificationConsumed) {
    initialNotificationConsumed = true;
    const initial: PushPayload | null = await api.getInitialNotification().catch(() => null);
    if (initial !== null) {
      handlers.onOpen(initial);
    }
  }
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
};

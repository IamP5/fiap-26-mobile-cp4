import type { PushPayload } from '../../types/notification';

export type PushApi = {
  requestPermission: () => Promise<boolean>;
  getToken: () => Promise<string | null>;
  deleteToken: () => Promise<void>;
  onTokenRefresh: (listener: (token: string) => void) => () => void;
  onForegroundMessage: (listener: (payload: PushPayload) => void) => () => void;
  onNotificationOpened: (listener: (payload: PushPayload) => void) => () => void;
  getInitialNotification: () => Promise<PushPayload | null>;
};

export type PushAvailability = { available: true; api: PushApi } | { available: false; reason: string };

export type NotificationPolicy =
  | 'all_group_messages'
  | 'mentioned_members'
  | 'direct_messages_only'
  | 'disabled';

export type NotificationSettings = {
  conversationId: string;
  policy: NotificationPolicy;
  updatedBy: string;
  updatedAt: number;
};

export type DevicePlatform = 'ios' | 'android';

/** Firestore users/{uid}/devices/{deviceId}. */
export type StoredDevice = {
  token: string;
  platform: DevicePlatform;
  enabled: boolean;
  updatedAt: number;
};

/** Where push registration stands on this device. */
export type PushStatus =
  | { state: 'idle' }
  | { state: 'registering' }
  | { state: 'registered'; enabled: boolean }
  | { state: 'unsupported'; reason: string }
  | { state: 'denied' }
  | { state: 'no_token' }
  | { state: 'error'; message: string };

/** The data payload every push carries (set by the API). */
export type PushPayload = {
  conversationId: string;
  conversationType: 'direct' | 'group';
  title: string | null;
  body: string | null;
};

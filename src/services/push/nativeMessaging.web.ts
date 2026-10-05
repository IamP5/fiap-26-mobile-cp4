// Web build (used for development previews): push is mobile-only, so the
// native module is never bundled here.
import type { PushAvailability } from './types';

export type { PushApi, PushAvailability } from './types';

export const loadPushApi = (): Promise<PushAvailability> =>
  Promise.resolve({ available: false, reason: 'Notificações push só funcionam no Android e no iOS.' });

export const registerBackgroundHandler = (): void => undefined;

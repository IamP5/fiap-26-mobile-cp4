import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getActiveConversation, navigationRef } from '../navigation/navigationRef';
import {
  listenForNotifications,
  registerDevice,
  setDeviceNotificationsEnabled,
  watchTokenRefresh,
} from '../services/notificationService';
import type { PushPayload, PushStatus } from '../types/notification';
import type { ChatUser } from '../types/user';
import { translateFirebaseError } from '../utils/errors';

export type NotificationContextValue = {
  status: PushStatus;
  /** A push received while the app is open, shown as an in-app banner. */
  banner: PushPayload | null;
  dismissBanner: () => void;
  openConversation: (payload: PushPayload) => void;
  retryRegistration: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const BANNER_MS = 5000;

/**
 * Mounted while signed in: registers this device's FCM token, keeps it fresh,
 * and routes notification taps to the right conversation. Unmounting (logout)
 * removes every listener.
 */
export const NotificationProvider: React.FC<{ user: ChatUser; children: React.ReactNode }> = ({ user, children }) => {
  const [status, setStatus] = useState<PushStatus>({ state: 'idle' });
  const [banner, setBanner] = useState<PushPayload | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const pendingOpenRef = useRef<PushPayload | null>(null);
  const uid: string = user.uid;

  const openConversation = useCallback((payload: PushPayload): void => {
    setBanner(null);
    if (!navigationRef.isReady()) {
      // Cold start: navigation mounts right after; flushed below.
      pendingOpenRef.current = payload;
      return;
    }
    navigationRef.navigate('Chat', {
      conversationId: payload.conversationId,
      conversationType: payload.conversationType,
    });
  }, []);

  useEffect(() => {
    let active = true;
    let stopRefresh: () => void = () => undefined;
    setStatus({ state: 'registering' });
    void registerDevice(uid).then((next: PushStatus) => {
      if (active) {
        setStatus(next);
      }
    });
    void watchTokenRefresh(uid).then((stop) => {
      if (active) {
        stopRefresh = stop;
      } else {
        stop();
      }
    });
    return () => {
      active = false;
      stopRefresh();
    };
  }, [uid, attempt]);

  useEffect(() => {
    let active = true;
    let stop: () => void = () => undefined;
    void listenForNotifications({
      onForeground: (payload: PushPayload) => {
        if (getActiveConversation() !== payload.conversationId) {
          setBanner(payload);
        }
      },
      onOpen: openConversation,
    }).then((unsubscribe) => {
      if (active) {
        stop = unsubscribe;
      } else {
        unsubscribe();
      }
    });
    return () => {
      active = false;
      stop();
    };
  }, [openConversation]);

  // Flush a tap that arrived before navigation was ready.
  useEffect(() => {
    const timer = setInterval(() => {
      const pendingOpen = pendingOpenRef.current;
      if (pendingOpen !== null && navigationRef.isReady()) {
        pendingOpenRef.current = null;
        openConversation(pendingOpen);
      }
    }, 300);
    return () => clearInterval(timer);
  }, [openConversation]);

  useEffect(() => {
    if (banner === null) {
      return undefined;
    }
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  const setEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      try {
        await setDeviceNotificationsEnabled(uid, enabled);
        setStatus({ state: 'registered', enabled });
      } catch (error: unknown) {
        throw new Error(translateFirebaseError(error));
      }
    },
    [uid],
  );

  const dismissBanner = useCallback((): void => setBanner(null), []);
  const retryRegistration = useCallback((): void => setAttempt((prev: number) => prev + 1), []);

  const value = useMemo<NotificationContextValue>(
    () => ({ status, banner, dismissBanner, openConversation, retryRegistration, setEnabled }),
    [status, banner, dismissBanner, openConversation, retryRegistration, setEnabled],
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = (): NotificationContextValue => {
  const value = useContext(NotificationContext);
  if (value === null) {
    throw new Error('useNotifications deve ser usado dentro de um NotificationProvider.');
  }
  return value;
};

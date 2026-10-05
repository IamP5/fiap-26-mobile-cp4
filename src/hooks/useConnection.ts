import { useEffect, useState } from 'react';

import { subscribeToConnection } from '../services/chatService';

/** Realtime Database connectivity. Starts optimistic so the offline banner
 * does not flash while the socket is still connecting on app start. */
export const useConnection = (): boolean => {
  const [connected, setConnected] = useState<boolean>(true);
  useEffect(() => {
    let first = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToConnection((next: boolean) => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // The first `false` is the initial "not connected yet" state: give the
      // connection a few seconds before declaring the device offline.
      if (!next && first) {
        timer = setTimeout(() => setConnected(false), 4000);
      } else {
        setConnected(next);
      }
      if (next) {
        first = false;
      }
    });
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);
  return connected;
};

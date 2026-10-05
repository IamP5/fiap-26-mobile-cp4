import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { subscribeToDirectory } from '../services/userService';
import type { PublicProfile } from '../types/user';
import { translateFirebaseError } from '../utils/errors';

export type DirectoryContextValue = {
  profiles: PublicProfile[];
  byUid: ReadonlyMap<string, PublicProfile>;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const DirectoryContext = createContext<DirectoryContextValue | null>(null);

/**
 * One live subscription to the public directory (name + photo of every
 * user), shared by the conversation list, the user picker and the chats.
 * Mounted only while signed in, so logout tears the listener down.
 */
export const DirectoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeToDirectory(
      (next: PublicProfile[]) => {
        setProfiles(next);
        setError(null);
        setLoading(false);
      },
      (subscriptionError: unknown) => {
        setError(translateFirebaseError(subscriptionError));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [reloadToken]);

  const byUid = useMemo<ReadonlyMap<string, PublicProfile>>(
    () => new Map(profiles.map((profile: PublicProfile) => [profile.uid, profile])),
    [profiles],
  );

  const reload = useCallback((): void => setReloadToken((prev: number) => prev + 1), []);

  const value = useMemo<DirectoryContextValue>(
    () => ({ profiles, byUid, loading, error, reload }),
    [profiles, byUid, loading, error, reload],
  );
  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
};

export const useDirectory = (): DirectoryContextValue => {
  const value = useContext(DirectoryContext);
  if (value === null) {
    throw new Error('useDirectory deve ser usado dentro de um DirectoryProvider.');
  }
  return value;
};

/** Display data for a uid, with a safe fallback while loading or for
 * accounts that no longer exist. */
export const profileOrFallback = (byUid: ReadonlyMap<string, PublicProfile>, uid: string): PublicProfile =>
  byUid.get(uid) ?? { uid, name: 'Usuário', photoUrl: '' };

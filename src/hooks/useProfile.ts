import { useCallback, useEffect, useState } from 'react';

import { fetchSharedProfile, type ProfileResult } from '../services/userService';
import type { ChatUser } from '../types/user';
import { translateFirebaseError } from '../utils/errors';

export type UseProfileResult = {
  profile: ChatUser | null;
  loading: boolean;
  error: string | null;
  notShared: boolean;
  retry: () => void;
};

/** Registration data of another user, through the API's shared-context
 * check. My own profile comes straight from AuthContext. */
export const useProfile = (uid: string, me: ChatUser): UseProfileResult => {
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<number>(0);
  const isMe: boolean = uid === me.uid;

  useEffect(() => {
    if (isMe) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchSharedProfile(uid)
      .then((next: ProfileResult) => {
        if (active) {
          setResult(next);
        }
      })
      .catch((fetchError: unknown) => {
        if (active) {
          setError(translateFirebaseError(fetchError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [uid, isMe, token]);

  const retry = useCallback((): void => setToken((prev: number) => prev + 1), []);

  return {
    profile: isMe ? me : result?.status === 'ok' ? result.user : null,
    loading,
    error,
    notShared: !isMe && result?.status === 'not_shared',
    retry,
  };
};

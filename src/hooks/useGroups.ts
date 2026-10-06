import { useEffect, useState } from 'react';

import { subscribeToGroup } from '../services/groupService';
import type { ChatGroup } from '../types/group';
import { translateFirebaseError } from '../utils/errors';

export type UseGroupResult = {
  group: ChatGroup | null;
  loading: boolean;
  error: string | null;
  /** The group was deleted or the user is no longer a member. */
  unavailable: boolean;
};

/** Live group document; the listener is replaced when groupId changes and
 * removed on unmount. */
export const useGroup = (groupId: string | null): UseGroupResult => {
  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [loading, setLoading] = useState<boolean>(groupId !== null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<boolean>(false);

  useEffect(() => {
    if (groupId === null) {
      setGroup(null);
      setLoading(false);
      return undefined;
    }
    // Never show the previous group's data while the new one loads.
    setGroup(null);
    setLoading(true);
    setError(null);
    setUnavailable(false);
    return subscribeToGroup(
      groupId,
      (next: ChatGroup | null) => {
        setGroup(next);
        setUnavailable(next === null);
        setLoading(false);
      },
      (subscriptionError: unknown) => {
        // Removed members lose read access: the rules deny the listener.
        const code: unknown =
          typeof subscriptionError === 'object' && subscriptionError !== null && 'code' in subscriptionError
            ? subscriptionError.code
            : null;
        if (code === 'permission-denied') {
          setUnavailable(true);
          setGroup(null);
        } else {
          setError(translateFirebaseError(subscriptionError));
        }
        setLoading(false);
      },
    );
  }, [groupId]);

  return { group, loading, error, unavailable };
};

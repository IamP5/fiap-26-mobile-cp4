import { useCallback, useEffect, useMemo, useState } from 'react';

import { subscribeToUsers } from '../services/userService';
import type { ChatUser } from '../types/user';
import { filterContacts } from '../utils/chatRules';
import { translateFirebaseError } from '../utils/errors';

export type UseContactsResult = {
  contacts: ChatUser[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export const useContacts = (me: ChatUser): UseContactsResult => {
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToUsers(
      (users) => {
        if (!active) {
          return;
        }
        setAllUsers(() => [...users]);
        setError(null);
        setLoading(false);
      },
      (subscriptionError) => {
        if (!active) {
          return;
        }
        setError(translateFirebaseError(subscriptionError));
        setLoading(false);
      },
    );

    return (): void => {
      active = false;
      unsubscribe();
    };
  }, [reloadToken]);

  const contacts = useMemo<ChatUser[]>(
    () => filterContacts(allUsers, me),
    [allUsers, me],
  );

  const reload = useCallback((): void => {
    setReloadToken((prev) => prev + 1);
  }, []);

  return { contacts, loading, error, reload };
};

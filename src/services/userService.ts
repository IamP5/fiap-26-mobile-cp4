import { get, onValue, ref, set } from 'firebase/database';

import { database } from './firebase';
import type { AuthProvider, ChatUser, StoredUser } from '../types/user';

const USERS_PATH = 'users';

const isAuthProvider = (value: unknown): value is AuthProvider =>
  value === 'password' || value === 'google' || value === 'apple';

const toStoredUser = (user: ChatUser): StoredUser => ({
  uid: user.uid,
  name: user.name,
  email: user.email === null ? '' : user.email,
  photoUrl: user.photoUrl === null ? '' : user.photoUrl,
  provider: user.provider,
  createdAt: user.createdAt,
});

const parseChatUser = (value: unknown): ChatUser | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record: Record<string, unknown> = value as Record<string, unknown>;
  const uid: unknown = record.uid;
  const name: unknown = record.name;
  const email: unknown = record.email;
  const photoUrl: unknown = record.photoUrl;
  const provider: unknown = record.provider;
  const createdAt: unknown = record.createdAt;

  if (typeof uid !== 'string' || uid.length === 0) {
    return null;
  }
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  if (!isAuthProvider(provider)) {
    return null;
  }
  if (typeof createdAt !== 'number') {
    return null;
  }

  const normalizedEmail: string | null =
    typeof email === 'string' && email.length > 0 ? email : null;
  // Only https urls are trusted for rendering; anything else falls back to
  // initials (profiles written by older app versions simply have no field).
  const normalizedPhotoUrl: string | null =
    typeof photoUrl === 'string' && photoUrl.startsWith('https://') ? photoUrl : null;

  return { uid, name, email: normalizedEmail, photoUrl: normalizedPhotoUrl, provider, createdAt };
};

export const saveUser = async (user: ChatUser): Promise<void> => {
  const payload: StoredUser = toStoredUser(user);
  await set(ref(database, `${USERS_PATH}/${user.uid}`), payload);
};

export const getUser = async (uid: string): Promise<ChatUser | null> => {
  const snapshot = await get(ref(database, `${USERS_PATH}/${uid}`));
  if (!snapshot.exists()) {
    return null;
  }
  return parseChatUser(snapshot.val());
};

export const subscribeToUsers = (
  onChange: (users: ChatUser[]) => void,
  onError: (error: unknown) => void,
): (() => void) => {
  const usersRef = ref(database, USERS_PATH);

  const unsubscribe = onValue(
    usersRef,
    (snapshot) => {
      const users: ChatUser[] = [];
      snapshot.forEach((child) => {
        const parsed = parseChatUser(child.val());
        if (parsed !== null) {
          users.push(parsed);
        }
      });
      const sorted: ChatUser[] = [...users].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR'),
      );
      onChange(sorted);
    },
    (error) => {
      onError(error);
    },
  );

  return (): void => {
    unsubscribe();
  };
};

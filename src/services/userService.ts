import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import type { ChatUser, PublicProfile, StoredPublicProfile, StoredUser } from '../types/user';
import { isApiError } from '../utils/errors';
import { apiRequest } from './apiClient';
import { firestore } from './firebase';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const safePhotoUrl = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('https://') ? value : '';

export const parseChatUser = (uid: string, value: unknown): ChatUser | null => {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.createdAt !== 'number') {
    return null;
  }
  return {
    uid,
    name: value.name,
    email: asString(value.email),
    phoneNumber: asString(value.phoneNumber),
    birthDate: asString(value.birthDate),
    photoUrl: safePhotoUrl(value.photoUrl),
    createdAt: value.createdAt,
  };
};

const parsePublicProfile = (uid: string, value: unknown): PublicProfile | null =>
  isRecord(value) && typeof value.name === 'string' && value.name.length > 0
    ? { uid, name: value.name, photoUrl: safePhotoUrl(value.photoUrl) }
    : null;

/** Writes the private profile and its public directory entry atomically. */
export const saveUser = async (user: ChatUser): Promise<void> => {
  const stored: StoredUser = {
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    birthDate: user.birthDate,
    photoUrl: user.photoUrl,
    createdAt: user.createdAt,
  };
  const publicEntry: StoredPublicProfile = {
    name: user.name,
    nameLower: user.name.toLowerCase(),
    photoUrl: user.photoUrl,
    updatedAt: Date.now(),
  };
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'users', user.uid), stored);
  batch.set(doc(firestore, 'publicProfiles', user.uid), publicEntry);
  await batch.commit();
};

/** Reads MY private profile (the rules allow only the owner). */
export const getOwnUser = async (uid: string): Promise<ChatUser | null> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.exists() ? parseChatUser(uid, snapshot.data()) : null;
};

/** Live directory of registered users, sorted by name. */
export const subscribeToDirectory = (
  onChange: (profiles: PublicProfile[]) => void,
  onError: (error: unknown) => void,
): (() => void) =>
  onSnapshot(
    query(collection(firestore, 'publicProfiles'), orderBy('nameLower')),
    (snapshot) => {
      const profiles: PublicProfile[] = snapshot.docs
        .map((entry: QueryDocumentSnapshot) => parsePublicProfile(entry.id, entry.data()))
        .filter((profile): profile is PublicProfile => profile !== null);
      onChange(profiles);
    },
    onError,
  );

export type ProfileResult =
  | { status: 'ok'; user: ChatUser }
  | { status: 'not_shared' }
  | { status: 'not_found' };

/**
 * Registration data of another user. Served by the API, which only answers
 * when the two users share a direct conversation or a group.
 */
export const fetchSharedProfile = async (uid: string): Promise<ProfileResult> => {
  try {
    const body: unknown = await apiRequest('GET', `/profiles/${encodeURIComponent(uid)}`);
    const user: ChatUser | null =
      isRecord(body) && isRecord(body.profile) ? parseChatUser(uid, body.profile) : null;
    return user === null ? { status: 'not_found' } : { status: 'ok', user };
  } catch (error: unknown) {
    if (isApiError(error, 'PROFILE_NOT_SHARED')) {
      return { status: 'not_shared' };
    }
    if (isApiError(error, 'PROFILE_NOT_FOUND')) {
      return { status: 'not_found' };
    }
    throw error;
  }
};

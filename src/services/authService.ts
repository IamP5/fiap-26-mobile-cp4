import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
} from 'firebase/auth';

import type { ChatUser, PickedImage } from '../types/user';
import { NETWORK_TIMEOUT_MS, withTimeout } from '../utils/async';
import { createAppError } from '../utils/errors';
import { auth } from './firebase';
import { deletePhotoByUrl, uploadPhoto } from './photoService';
import { getOwnUser, saveUser } from './userService';

// E-mail and password is the only sign-in method of this app.

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  /** E.164, e.g. +5511987654321. */
  phoneNumber: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  photo: PickedImage | null;
};

export type SignInInput = { email: string; password: string };

export type SignUpResult = {
  user: ChatUser;
  /** The account exists but the photo upload failed (it can be retried in
   * the profile tab). */
  photoFailed: boolean;
};

const AUTH_TIMEOUT_MESSAGE = 'Tempo esgotado ao autenticar. Verifique sua conexão e tente novamente.';
const PROFILE_TIMEOUT_MESSAGE = 'Tempo esgotado ao carregar seu perfil. Verifique sua conexão e tente novamente.';

export const INCOMPLETE_PROFILE_MESSAGE =
  'Seu cadastro não foi concluído. Toque em "Criar conta" e use o mesmo e-mail e senha para terminar.';

const readProfile = (uid: string): Promise<ChatUser | null> =>
  withTimeout(getOwnUser(uid), NETWORK_TIMEOUT_MS, PROFILE_TIMEOUT_MESSAGE);

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

/**
 * Creates the Auth account, uploads the photo and writes users/{uid} plus
 * publicProfiles/{uid}. If a previous attempt created the account but died
 * before the profile was written, signing up again with the same e-mail and
 * password completes it instead of failing with "e-mail already in use".
 */
export const signUpWithEmail = async (input: SignUpInput): Promise<SignUpResult> => {
  const email: string = input.email.trim().toLowerCase();
  let firebaseUser: User;
  try {
    const credential: UserCredential = await withTimeout(
      createUserWithEmailAndPassword(auth, email, input.password),
      NETWORK_TIMEOUT_MS,
      AUTH_TIMEOUT_MESSAGE,
    );
    firebaseUser = credential.user;
  } catch (error: unknown) {
    if (errorCode(error) !== 'auth/email-already-in-use') {
      throw error;
    }
    let existing: UserCredential;
    try {
      existing = await signInWithEmailAndPassword(auth, email, input.password);
    } catch {
      throw error;
    }
    const profile: ChatUser | null = await readProfile(existing.user.uid);
    if (profile !== null) {
      return { user: profile, photoFailed: false };
    }
    firebaseUser = existing.user;
  }

  let photoUrl = '';
  let photoFailed = false;
  if (input.photo !== null) {
    try {
      photoUrl = await uploadPhoto('profile-photos', firebaseUser.uid, input.photo);
    } catch {
      photoFailed = true;
    }
  }

  const user: ChatUser = {
    uid: firebaseUser.uid,
    name: input.name.trim(),
    email: firebaseUser.email ?? email,
    phoneNumber: input.phoneNumber,
    birthDate: input.birthDate,
    photoUrl,
    createdAt: Date.now(),
  };
  await withTimeout(saveUser(user), NETWORK_TIMEOUT_MS, PROFILE_TIMEOUT_MESSAGE);
  // Cosmetic copy on the Auth record; the Firestore profile is the source.
  void updateProfile(firebaseUser, { displayName: user.name }).catch(() => undefined);
  return { user, photoFailed };
};

export const signInWithEmail = async (input: SignInInput): Promise<ChatUser> => {
  const credential: UserCredential = await withTimeout(
    signInWithEmailAndPassword(auth, input.email.trim().toLowerCase(), input.password),
    NETWORK_TIMEOUT_MS,
    AUTH_TIMEOUT_MESSAGE,
  );
  const profile: ChatUser | null = await readProfile(credential.user.uid);
  if (profile === null) {
    await signOut(auth);
    throw createAppError(INCOMPLETE_PROFILE_MESSAGE);
  }
  return profile;
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  await withTimeout(
    sendPasswordResetEmail(auth, email.trim().toLowerCase()),
    NETWORK_TIMEOUT_MS,
    AUTH_TIMEOUT_MESSAGE,
  );
};

/** Profile of a restored session; null when the account has no profile. */
export const resolveSessionUser = (firebaseUser: User): Promise<ChatUser | null> =>
  readProfile(firebaseUser.uid);

export const signOutUser = async (): Promise<void> => {
  await signOut(auth);
};

export const updateUserName = async (current: ChatUser, name: string): Promise<ChatUser> => {
  const trimmed: string = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) {
    throw createAppError('Informe um nome entre 1 e 80 caracteres.');
  }
  const updated: ChatUser = { ...current, name: trimmed };
  await withTimeout(saveUser(updated), NETWORK_TIMEOUT_MS, PROFILE_TIMEOUT_MESSAGE);
  return updated;
};

export const updateUserPhoto = async (current: ChatUser, image: PickedImage): Promise<ChatUser> => {
  const photoUrl: string = await uploadPhoto('profile-photos', current.uid, image);
  const updated: ChatUser = { ...current, photoUrl };
  await withTimeout(saveUser(updated), NETWORK_TIMEOUT_MS, PROFILE_TIMEOUT_MESSAGE);
  void deletePhotoByUrl('profile-photos', current.uid, current.photoUrl);
  return updated;
};

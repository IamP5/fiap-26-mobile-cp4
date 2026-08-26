import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
} from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';

import { auth } from './firebase';
import { deleteProfilePhotoByUrl, uploadProfilePhoto } from './photoService';
import { getUser, saveUser } from './userService';
import type { AuthProvider, ChatUser } from '../types/user';
import { createAppError } from '../utils/errors';

export type SignUpInput = { name: string; email: string; password: string };
export type SignInInput = { email: string; password: string };

const MAX_NAME_LENGTH = 80;

/**
 * The Realtime Database SDK queues reads/writes forever while the client is
 * offline (no built-in deadline), which would leave the auth bootstrap hanging
 * on "Carregando..." with no way out. Every profile round-trip is therefore
 * raced against an explicit deadline.
 */
const PROFILE_TIMEOUT_MS = 8000;

/**
 * The Firebase Auth network calls (credential exchange / e-mail sign-in) also
 * have no client-side deadline, and a request that never settles would leave
 * the login form disabled forever — so they get the same explicit-race
 * treatment as the profile round-trips, just with a more generous budget.
 */
const AUTH_TIMEOUT_MS = 20000;

const AUTH_TIMEOUT_MESSAGE =
  'Tempo esgotado ao autenticar. Verifique sua conexão e tente novamente.';

const withTimeout = <T,>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout((): void => {
      reject(createAppError(message));
    }, timeoutMs);
    operation.then(
      (value: T): void => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown): void => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const withAuthTimeout = <T,>(operation: Promise<T>): Promise<T> =>
  withTimeout(operation, AUTH_TIMEOUT_MS, AUTH_TIMEOUT_MESSAGE);

const readProfile = (uid: string): Promise<ChatUser | null> =>
  withTimeout(
    getUser(uid),
    PROFILE_TIMEOUT_MS,
    'Tempo esgotado ao carregar seu perfil. Verifique sua conexão e tente novamente.',
  );

const writeProfile = (user: ChatUser): Promise<void> =>
  withTimeout(
    saveUser(user),
    PROFILE_TIMEOUT_MS,
    'Tempo esgotado ao salvar seu perfil. Verifique sua conexão e tente novamente.',
  );

type StoredProfileOutcome =
  | { status: 'found'; user: ChatUser }
  | { status: 'missing' }
  | { status: 'unavailable' };

/** Tolerant read used on app start: never rejects, but says WHY there is no profile. */
const readProfileTolerant = async (uid: string): Promise<StoredProfileOutcome> => {
  try {
    const stored: ChatUser | null = await readProfile(uid);
    return stored === null ? { status: 'missing' } : { status: 'found', user: stored };
  } catch {
    return { status: 'unavailable' };
  }
};

const resolveProvider = (firebaseUser: User): AuthProvider => {
  const providerIds: string[] = firebaseUser.providerData.map(
    (info): string => info.providerId,
  );

  if (providerIds.includes('google.com')) {
    return 'google';
  }
  if (providerIds.includes('apple.com')) {
    return 'apple';
  }
  return 'password';
};

const asHttpsUrl = (candidate: string | null): string | null =>
  typeof candidate === 'string' && candidate.startsWith('https://') ? candidate : null;

/** Photo reported by the identity provider itself (Google populates it; Apple
 * never does, and e-mail/senha accounts have none). */
const providerPhotoUrl = (firebaseUser: User): string | null =>
  asHttpsUrl(
    firebaseUser.providerData
      .map((info): string | null => info.photoURL)
      .find((url): url is string => typeof url === 'string' && url.length > 0) ?? null,
  );

/**
 * Effective profile photo. The account-level photoURL wins because it is where
 * custom uploads land (updateUserPhoto), then the provider photo, then whatever
 * was already stored — so a photo survives sign-ins where the provider stops
 * reporting one. Only https urls are accepted.
 */
const resolvePhotoUrl = (firebaseUser: User, storedPhotoUrl: string | null): string | null =>
  asHttpsUrl(firebaseUser.photoURL) ?? providerPhotoUrl(firebaseUser) ?? asHttpsUrl(storedPhotoUrl);

const nameFromEmail = (email: string | null): string | null => {
  if (email === null) {
    return null;
  }
  const localPart: string = email.split('@')[0] ?? '';
  return localPart.length > 0 ? localPart : null;
};

const normalizeName = (candidate: string | null): string => {
  const trimmed: string = (candidate ?? '').trim();
  const fallback: string = trimmed.length > 0 ? trimmed : 'Usuário';
  return fallback.slice(0, MAX_NAME_LENGTH);
};

const buildChatUser = (
  firebaseUser: User,
  preferredName: string | null,
  createdAt: number,
  storedPhotoUrl: string | null = null,
): ChatUser => ({
  uid: firebaseUser.uid,
  name: normalizeName(
    preferredName ?? firebaseUser.displayName ?? nameFromEmail(firebaseUser.email),
  ),
  email: firebaseUser.email,
  photoUrl: resolvePhotoUrl(firebaseUser, storedPhotoUrl),
  provider: resolveProvider(firebaseUser),
  createdAt,
});

/**
 * Upserts users/$uid for every successful sign-in, preserving the original
 * createdAt when a profile already exists but always refreshing name/provider.
 */
const upsertProfile = async (
  firebaseUser: User,
  preferredName: string | null,
): Promise<ChatUser> => {
  const stored: ChatUser | null = await readProfile(firebaseUser.uid);
  const createdAt: number = stored === null ? Date.now() : stored.createdAt;
  // Apple only returns the full name on the FIRST authorization and never
  // populates displayName, so an explicit name wins, then the stored name, and
  // only then the derived/placeholder fallbacks — otherwise a re-sign-in would
  // overwrite a real name with "Usuário".
  const resolvedName: string | null =
    preferredName ?? firebaseUser.displayName ?? (stored === null ? null : stored.name);
  const chatUser: ChatUser = buildChatUser(
    firebaseUser,
    resolvedName,
    createdAt,
    stored === null ? null : stored.photoUrl,
  );
  await writeProfile(chatUser);
  return chatUser;
};

export const signUpWithEmail = async (input: SignUpInput): Promise<ChatUser> => {
  const email: string = input.email.trim();
  const name: string = normalizeName(input.name);
  const credential: UserCredential = await withAuthTimeout(
    createUserWithEmailAndPassword(auth, email, input.password),
  );
  await updateProfile(credential.user, { displayName: name });
  return upsertProfile(credential.user, name);
};

export const signInWithEmail = async (input: SignInInput): Promise<ChatUser> => {
  const credential: UserCredential = await withAuthTimeout(
    signInWithEmailAndPassword(auth, input.email.trim(), input.password),
  );
  return upsertProfile(credential.user, null);
};

export const signInWithGoogleIdToken = async (
  idToken: string,
  accessToken?: string,
): Promise<ChatUser> => {
  const googleCredential = GoogleAuthProvider.credential(idToken, accessToken);
  const credential: UserCredential = await withAuthTimeout(
    signInWithCredential(auth, googleCredential),
  );
  return upsertProfile(credential.user, null);
};

/**
 * Web-only Google flow. On the browser the redirect of an expo-auth-session
 * request would have to be registered on the OAuth client for every dev host,
 * while Firebase's own popup handler is already authorized for this project,
 * so the popup is used instead of an id-token exchange.
 */
export const signInWithGooglePopup = async (): Promise<ChatUser> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential: UserCredential = await signInWithPopup(auth, provider);
  return upsertProfile(credential.user, null);
};

export const signInWithAppleCredential = async (
  identityToken: string,
  rawNonce: string,
  fullName: string | null,
): Promise<ChatUser> => {
  const provider = new OAuthProvider('apple.com');
  const appleCredential = provider.credential({ idToken: identityToken, rawNonce });
  const credential: UserCredential = await withAuthTimeout(
    signInWithCredential(auth, appleCredential),
  );
  return upsertProfile(credential.user, fullName);
};

export const signOutUser = async (): Promise<void> => {
  await signOut(auth);
};

/** Renames the account everywhere: Firebase Auth displayName + users/$uid. */
export const updateUserName = async (current: ChatUser, name: string): Promise<ChatUser> => {
  const trimmed: string = name.trim();
  if (trimmed.length === 0) {
    throw createAppError('Informe um nome válido.');
  }
  const normalized: string = normalizeName(trimmed);
  const firebaseUser: User | null = auth.currentUser;
  if (firebaseUser === null) {
    throw createAppError('Sessão expirada. Entre novamente para alterar o nome.');
  }
  await updateProfile(firebaseUser, { displayName: normalized });
  const updated: ChatUser = { ...current, name: normalized };
  await writeProfile(updated);
  return updated;
};

/**
 * Re-reads the provider photo (Google account picture) from the Firebase Auth
 * session and stores it on users/$uid so every contact sees it. Reads the
 * providerData photo specifically — the account-level photoURL may hold a
 * custom upload, and "import from Google" must bring back the GOOGLE one.
 * Apple and e-mail/senha accounts have no provider photo, so this rejects
 * with an explanatory message for them.
 */
export const syncProviderPhoto = async (current: ChatUser): Promise<ChatUser> => {
  const firebaseUser: User | null = auth.currentUser;
  if (firebaseUser === null) {
    throw createAppError('Sessão expirada. Entre novamente para atualizar a foto.');
  }
  // Best-effort refresh so a photo changed on the Google account since login
  // is picked up; a failed reload still lets the cached one be used.
  try {
    await firebaseUser.reload();
  } catch {
    // keep the cached session data
  }
  const refreshed: User = auth.currentUser ?? firebaseUser;
  const photoUrl: string | null = providerPhotoUrl(refreshed);
  if (photoUrl === null) {
    throw createAppError(
      current.provider === 'google'
        ? 'Sua conta Google não possui uma foto de perfil pública para importar.'
        : 'Este tipo de conta não fornece foto de perfil: a Apple não compartilha fotos, e contas de e-mail/senha não têm provedor de foto.',
    );
  }
  await updateProfile(refreshed, { photoURL: photoUrl });
  const updated: ChatUser = { ...current, photoUrl };
  await writeProfile(updated);
  // The previous photo may have been a custom upload; remove the orphan.
  void deleteProfilePhotoByUrl(current.uid, current.photoUrl);
  return updated;
};

/**
 * Custom profile photo picked from the gallery or taken with the camera:
 * uploads the local file to Firebase Storage, points the Firebase Auth
 * photoURL at it (so it survives future sign-ins — upsertProfile prefers the
 * account photoURL) and stores it on users/$uid so every contact sees it.
 */
export const updateUserPhoto = async (
  current: ChatUser,
  localUri: string,
  mimeType: string | null,
): Promise<ChatUser> => {
  const firebaseUser: User | null = auth.currentUser;
  if (firebaseUser === null) {
    throw createAppError('Sessão expirada. Entre novamente para atualizar a foto.');
  }
  const photoUrl: string = await uploadProfilePhoto(firebaseUser.uid, localUri, mimeType);
  await updateProfile(firebaseUser, { photoURL: photoUrl });
  const updated: ChatUser = { ...current, photoUrl };
  await writeProfile(updated);
  // Housekeeping only: a failure here never blocks the new photo.
  void deleteProfilePhotoByUrl(current.uid, current.photoUrl);
  return updated;
};

export const isAppleAuthAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    return false;
  }
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
};

/**
 * Resolves the app-level user for an already authenticated FirebaseUser:
 * prefers the stored RTDB profile, falling back to data derived from
 * providerData when the profile is missing.
 */
export const resolveChatUser = async (firebaseUser: User): Promise<ChatUser> => {
  const outcome: StoredProfileOutcome = await readProfileTolerant(firebaseUser.uid);
  if (outcome.status === 'found') {
    // Backfill the provider photo for profiles written before photos existed
    // (or whose photo write failed): the photo must appear without any user
    // action. Best-effort — the session proceeds with the stored profile
    // either way.
    const sessionPhotoUrl: string | null = resolvePhotoUrl(firebaseUser, null);
    if (outcome.user.photoUrl === null && sessionPhotoUrl !== null) {
      const withPhoto: ChatUser = { ...outcome.user, photoUrl: sessionPhotoUrl };
      try {
        await writeProfile(withPhoto);
        return withPhoto;
      } catch {
        return outcome.user;
      }
    }
    return outcome.user;
  }

  const derived: ChatUser = buildChatUser(firebaseUser, null, Date.now());

  if (outcome.status === 'missing') {
    // A session without users/$uid is invisible to every contact and has every
    // conversation/message write rejected by the rules, so the profile is
    // created here instead of admitting a session that cannot chat. A failure
    // is propagated so AuthContext can surface it and keep the login screen.
    await writeProfile(derived);
  }

  // 'unavailable' means the read itself failed (offline / denied): the derived
  // profile is used for this session and the stored one is left untouched.
  return derived;
};

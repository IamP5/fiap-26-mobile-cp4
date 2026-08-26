import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '../services/firebase';
import {
  resolveChatUser,
  signInWithAppleCredential,
  signInWithEmail,
  signInWithGoogleIdToken,
  signInWithGooglePopup,
  signOutUser,
  signUpWithEmail,
  syncProviderPhoto,
  updateUserName,
  updateUserPhoto,
  type SignInInput,
  type SignUpInput,
} from '../services/authService';
import { translateFirebaseError } from '../utils/errors';
import type { ChatUser } from '../types/user';

export type AuthContextValue = {
  user: ChatUser | null;
  initializing: boolean;
  loading: boolean;
  error: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithGoogleOnWeb: () => Promise<void>;
  signInWithApple: (
    identityToken: string,
    rawNonce: string,
    fullName: string | null,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  /** Account settings actions: update context user on success, THROW on
   * failure so the settings screen can show the error inline. */
  updateName: (name: string) => Promise<void>;
  syncPhoto: () => Promise<void>;
  /** Uploads a locally picked/captured image as the new profile photo. */
  updatePhoto: (localUri: string, mimeType: string | null) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = { children: React.ReactNode };

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const unsubscribe: () => void = onAuthStateChanged(
      auth,
      (firebaseUser: User | null): void => {
        if (firebaseUser === null) {
          if (active) {
            setUser(null);
            setInitializing(false);
          }
          return;
        }

        void resolveChatUser(firebaseUser)
          .then((chatUser: ChatUser): void => {
            if (active) {
              setUser(chatUser);
            }
          })
          .catch((resolveError: unknown): void => {
            if (active) {
              setUser(null);
              setError(translateFirebaseError(resolveError));
            }
          })
          .finally((): void => {
            if (active) {
              setInitializing(false);
            }
          });
      },
      (authError: unknown): void => {
        if (active) {
          setError(translateFirebaseError(authError));
          setInitializing(false);
        }
      },
    );

    return (): void => {
      active = false;
      unsubscribe();
    };
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  const runAction = useCallback(
    async (action: () => Promise<ChatUser>): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const chatUser: ChatUser = await action();
        setUser(chatUser);
      } catch (actionError: unknown) {
        setError(translateFirebaseError(actionError));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    async (input: SignInInput): Promise<void> => {
      await runAction((): Promise<ChatUser> => signInWithEmail(input));
    },
    [runAction],
  );

  const signUp = useCallback(
    async (input: SignUpInput): Promise<void> => {
      await runAction((): Promise<ChatUser> => signUpWithEmail(input));
    },
    [runAction],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string): Promise<void> => {
      await runAction((): Promise<ChatUser> => signInWithGoogleIdToken(idToken));
    },
    [runAction],
  );

  const signInWithGoogleOnWeb = useCallback(async (): Promise<void> => {
    await runAction((): Promise<ChatUser> => signInWithGooglePopup());
  }, [runAction]);

  const signInWithApple = useCallback(
    async (
      identityToken: string,
      rawNonce: string,
      fullName: string | null,
    ): Promise<void> => {
      await runAction(
        (): Promise<ChatUser> =>
          signInWithAppleCredential(identityToken, rawNonce, fullName),
      );
    },
    [runAction],
  );

  const updateName = useCallback(
    async (name: string): Promise<void> => {
      if (user === null) {
        return;
      }
      const updated: ChatUser = await updateUserName(user, name);
      setUser(updated);
    },
    [user],
  );

  const syncPhoto = useCallback(async (): Promise<void> => {
    if (user === null) {
      return;
    }
    const updated: ChatUser = await syncProviderPhoto(user);
    setUser(updated);
  }, [user]);

  const updatePhoto = useCallback(
    async (localUri: string, mimeType: string | null): Promise<void> => {
      if (user === null) {
        return;
      }
      const updated: ChatUser = await updateUserPhoto(user, localUri, mimeType);
      setUser(updated);
    },
    [user],
  );

  const signOut = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await signOutUser();
      setUser(null);
    } catch (signOutError: unknown) {
      setError(translateFirebaseError(signOutError));
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      loading,
      error,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleOnWeb,
      signInWithApple,
      signOut,
      clearError,
      updateName,
      syncPhoto,
      updatePhoto,
    }),
    [
      user,
      initializing,
      loading,
      error,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithGoogleOnWeb,
      signInWithApple,
      signOut,
      clearError,
      updateName,
      syncPhoto,
      updatePhoto,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

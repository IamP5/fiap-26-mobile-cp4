import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';

import {
  INCOMPLETE_PROFILE_MESSAGE,
  requestPasswordReset,
  resolveSessionUser,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  updateUserName,
  updateUserPhoto,
  type SignInInput,
  type SignUpInput,
  type SignUpResult,
} from '../services/authService';
import { auth } from '../services/firebase';
import { unregisterDevice } from '../services/notificationService';
import type { ChatUser, PickedImage } from '../types/user';
import { translateFirebaseError } from '../utils/errors';

export type AuthContextValue = {
  user: ChatUser | null;
  /** True until the persisted session has been checked on app start. */
  initializing: boolean;
  loading: boolean;
  error: string | null;
  /** Non-blocking info for the user, e.g. a failed photo upload. */
  notice: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  clearError: () => void;
  clearNotice: () => void;
  /** Profile actions THROW on failure so screens can show the error inline. */
  updateName: (name: string) => Promise<void>;
  updatePhoto: (image: PickedImage) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = { children: React.ReactNode };

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // While sign-up runs, Auth reports the new account before its Firestore
  // profile exists; the session observer must not treat that as a broken
  // account. signUp sets the user itself when it finishes.
  const signingUpRef = useRef<boolean>(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser: User | null): void => {
        if (firebaseUser === null) {
          if (active) {
            setUser(null);
            setInitializing(false);
          }
          return;
        }
        if (signingUpRef.current) {
          return;
        }
        resolveSessionUser(firebaseUser)
          .then(async (chatUser: ChatUser | null): Promise<void> => {
            if (!active || signingUpRef.current) {
              return;
            }
            if (chatUser === null) {
              await signOutUser().catch(() => undefined);
              setUser(null);
              setError(INCOMPLETE_PROFILE_MESSAGE);
              return;
            }
            setUser(chatUser);
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

  const signIn = useCallback(async (input: SignInInput): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setUser(await signInWithEmail(input));
    } catch (signInError: unknown) {
      setError(translateFirebaseError(signInError));
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<void> => {
    setLoading(true);
    setError(null);
    signingUpRef.current = true;
    try {
      const result: SignUpResult = await signUpWithEmail(input);
      setUser(result.user);
      if (result.photoFailed) {
        setNotice('Conta criada, mas não foi possível enviar a foto. Tente de novo na aba "Você".');
      }
    } catch (signUpError: unknown) {
      setError(translateFirebaseError(signUpError));
      // A half-created account stays signed out; signing up again with the
      // same credentials completes it.
      await signOutUser().catch(() => undefined);
    } finally {
      signingUpRef.current = false;
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const current = auth.currentUser;
      if (current !== null) {
        // Stop pushes to this phone before the session (and the permission
        // to delete the device document) goes away.
        await unregisterDevice(current.uid);
      }
      await signOutUser();
      setUser(null);
      setNotice(null);
    } catch (signOutError: unknown) {
      setError(translateFirebaseError(signOutError));
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    setError(null);
    try {
      await requestPasswordReset(email);
      setNotice('Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.');
      return true;
    } catch (resetError: unknown) {
      setError(translateFirebaseError(resetError));
      return false;
    }
  }, []);

  const clearError = useCallback((): void => setError(null), []);
  const clearNotice = useCallback((): void => setNotice(null), []);

  const updateName = useCallback(
    async (name: string): Promise<void> => {
      if (user !== null) {
        setUser(await updateUserName(user, name));
      }
    },
    [user],
  );

  const updatePhoto = useCallback(
    async (image: PickedImage): Promise<void> => {
      if (user !== null) {
        setUser(await updateUserPhoto(user, image));
      }
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      loading,
      error,
      notice,
      signIn,
      signUp,
      signOut,
      resetPassword,
      clearError,
      clearNotice,
      updateName,
      updatePhoto,
    }),
    [user, initializing, loading, error, notice, signIn, signUp, signOut, resetPassword, clearError, clearNotice, updateName, updatePhoto],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

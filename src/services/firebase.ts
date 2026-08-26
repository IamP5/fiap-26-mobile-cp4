import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  type Auth,
  type Persistence,
  type ReactNativeAsyncStorage,
} from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from '../config/firebaseConfig';

/**
 * `getReactNativePersistence` only exists in the React Native build of
 * '@firebase/auth' (it is absent from the browser/esm builds and from the
 * published type surface), so it is resolved at runtime behind a locally owned,
 * checked type instead of a static named import.
 */
type ReactNativePersistenceFactory = (storage: ReactNativeAsyncStorage) => Persistence;

const isPersistenceFactory = (
  value: unknown,
): value is ReactNativePersistenceFactory => typeof value === 'function';

const resolveReactNativePersistence = (): ReactNativePersistenceFactory | null => {
  const authModule: unknown = FirebaseAuth;
  if (typeof authModule !== 'object' || authModule === null) {
    return null;
  }
  if (!('getReactNativePersistence' in authModule)) {
    return null;
  }
  const candidate: unknown = authModule.getReactNativePersistence;
  return isPersistenceFactory(candidate) ? candidate : null;
};

const createFirebaseApp = (): FirebaseApp =>
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const firebaseApp: FirebaseApp = createFirebaseApp();

const createAuth = (app: FirebaseApp): Auth => {
  if (Platform.OS === 'web') {
    const webAuth = getAuth(app);
    void setPersistence(webAuth, browserLocalPersistence).catch(() => undefined);
    return webAuth;
  }

  const reactNativePersistence = resolveReactNativePersistence();
  if (reactNativePersistence === null) {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: reactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
};

export const auth: Auth = createAuth(firebaseApp);

export const database: Database = getDatabase(firebaseApp);

export const storage: FirebaseStorage = getStorage(firebaseApp);

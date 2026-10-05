import firebaseConfigJson from '../../firebaseConfig.json';

/** Firebase client SDK config, versioned at the repo root as required. It
 * identifies the project but grants no privileges: security comes from Auth
 * plus the Firestore / Realtime Database / Storage rules. */
export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export const firebaseConfig: FirebaseClientConfig = firebaseConfigJson;

const DEFAULT_API_URL = 'https://cp4-chat-api-749989544702.us-central1.run.app';

const normalizeUrl = (value: string | undefined): string | null => {
  const trimmed: string = (value ?? '').trim().replace(/\/+$/, '');
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') ? trimmed : null;
};

/** Public URL of the team's API (Cloud Run). Overridable through
 * EXPO_PUBLIC_API_URL, e.g. to point at a local server during development. */
export const API_URL: string = normalizeUrl(process.env.EXPO_PUBLIC_API_URL) ?? DEFAULT_API_URL;

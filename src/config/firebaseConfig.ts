export const firebaseConfig = {
  apiKey: 'AIzaSyB6Y9NfGC1icAx7g21a4YyXQo_7s3xWptU',
  authDomain: 'fiap-mobile-e8e61.firebaseapp.com',
  databaseURL: 'https://fiap-mobile-e8e61-default-rtdb.firebaseio.com',
  projectId: 'fiap-mobile-e8e61',
  storageBucket: 'fiap-mobile-e8e61.firebasestorage.app',
  messagingSenderId: '766438180232',
  appId: '1:766438180232:web:f6393a11c059e89b0f263d',
} as const;

export type GoogleClientIds = {
  expoClientId?: string;
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
};

/**
 * Expo inlines EXPO_PUBLIC_* with the literal value found in `.env`, so a var
 * declared but left empty arrives as `''` and NOT as `undefined`. An empty
 * string would defeat every `??` fallback downstream (and would be sent to
 * Google as `client_id=`), so it is normalized back to `undefined` here.
 */
const orUndefined = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed: string = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const googleClientIds: GoogleClientIds = {
  expoClientId: orUndefined(process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID),
  webClientId: orUndefined(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  iosClientId: orUndefined(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  androidClientId: orUndefined(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
};

/**
 * Google's iOS OAuth clients only accept a redirect on the reversed client id
 * scheme, and Android clients only on the package scheme. Both schemes are
 * registered in app.json, so the redirect is built here instead of relying on
 * expo-auth-session's default (which resolves to the Expo Go `exp://` URL and is
 * rejected by Google's OAuth policy with `invalid_request`).
 */
export const ANDROID_PACKAGE = 'com.fiap.cp4chat';

export const googleNativeRedirectUri = (platform: 'ios' | 'android'): string | undefined => {
  if (platform === 'android') {
    return `${ANDROID_PACKAGE}:/oauthredirect`;
  }
  const iosClientId: string | undefined = googleClientIds.iosClientId;
  if (iosClientId === undefined) {
    return undefined;
  }
  const guid: string = iosClientId.replace('.apps.googleusercontent.com', '');
  return `com.googleusercontent.apps.${guid}:/oauthredirect`;
};

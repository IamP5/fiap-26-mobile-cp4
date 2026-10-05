import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@cp4chat/device-id';

const randomId = (): string => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 24; i += 1) {
    id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return id;
};

/** Stable per-install id: the key of users/{uid}/devices/{deviceId}, so a
 * refreshed token replaces the old one instead of piling up documents. */
export const getDeviceId = async (): Promise<string> => {
  try {
    const stored: string | null = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored !== null && /^[a-z0-9]{24}$/.test(stored)) {
      return stored;
    }
    const created: string = randomId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return randomId();
  }
};

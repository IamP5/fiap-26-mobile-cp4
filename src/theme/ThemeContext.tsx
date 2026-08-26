import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { buildTheme, type ColorScheme, type Theme, type ThemeColors } from './theme';

/**
 * WhatsApp-style theme preference: follow the OS by default, with an explicit
 * light/dark override the user can pick in Settings. The choice is persisted
 * locally (it is a device preference, not account data).
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const PREFERENCE_STORAGE_KEY = '@cp4chat/theme-preference';

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export type ThemeContextValue = {
  theme: Theme;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = { children: React.ReactNode };

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // useColorScheme is null on some platforms while undetermined; dark is the
  // app's historical default, so it doubles as the fallback.
  const systemScheme: ColorScheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PREFERENCE_STORAGE_KEY)
      .then((stored: string | null): void => {
        if (active && isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      })
      .catch((): void => {
        // Unreadable storage just means "system" until the user picks again.
      });
    return (): void => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference): void => {
    setPreferenceState(next);
    AsyncStorage.setItem(PREFERENCE_STORAGE_KEY, next).catch((): void => {
      // The in-memory choice still applies for this session.
    });
  }, []);

  const scheme: ColorScheme = preference === 'system' ? systemScheme : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: buildTheme(scheme), scheme, preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeContext = (): ThemeContextValue => {
  const value: ThemeContextValue | null = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return value;
};

/** Convenience accessor: the resolved theme plus its colors. */
export const useTheme = (): Theme => useThemeContext().theme;

export const useThemeColors = (): ThemeColors => useThemeContext().theme.colors;

/**
 * Memoized themed StyleSheet: `factory` must be module-scope stable so the
 * styles are only rebuilt when the scheme actually flips.
 */
export const useThemedStyles = <T,>(factory: (theme: Theme) => T): T => {
  const theme: Theme = useTheme();
  return useMemo((): T => factory(theme), [factory, theme]);
};

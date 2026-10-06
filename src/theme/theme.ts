import { Platform } from 'react-native';

// JS mirror of the design tokens in src/global.css. Layout and color are
// styled with Uniwind classNames (`bg-background`, `text-muted-foreground`…);
// this file only exists for the props a className cannot reach — icon colors,
// placeholderTextColor, ActivityIndicator, the navigation theme, the chat
// wallpaper SVG. Keep both files in sync.

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  destructive: string;
  success: string;
  border: string;
  input: string;
  chat: string;
  chatPattern: string;
  bubbleMine: string;
  bubbleMineForeground: string;
  bubbleTheirs: string;
  bubbleTheirsForeground: string;
  mention: string;
  /** iOS grouped-list page background. */
  grouped: string;
  ripple: string;
  avatarPalette: readonly string[];
};

// Muted, modern hues (Vercel/Linear avatar style) that carry white initials
// in both schemes, so an avatar never changes color on a theme flip.
const AVATAR_PALETTE: readonly string[] = [
  '#e5484d',
  '#f76b15',
  '#ffb224',
  '#30a46c',
  '#12a594',
  '#0090ff',
  '#6e56cf',
  '#d6409f',
];

export const lightColors: ThemeColors = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  card: '#ffffff',
  popover: '#ffffff',
  primary: '#066fef',
  primaryForeground: '#ffffff',
  secondary: '#f4f4f5',
  muted: '#f4f4f5',
  mutedForeground: '#71717a',
  accent: '#f4f4f5',
  destructive: '#dc2626',
  success: '#16a34a',
  border: '#e4e4e7',
  input: '#e4e4e7',
  chat: '#f4f4f5',
  chatPattern: '#d4d4d8',
  bubbleMine: '#066fef',
  bubbleMineForeground: '#ffffff',
  bubbleTheirs: '#ffffff',
  bubbleTheirsForeground: '#0a0a0a',
  mention: '#066fef',
  grouped: '#f2f2f7',
  ripple: 'rgba(0,0,0,0.06)',
  avatarPalette: AVATAR_PALETTE,
};

export const darkColors: ThemeColors = {
  background: '#0f0f0f',
  foreground: '#f0f0f0',
  card: '#171717',
  popover: '#1e1e1e',
  primary: '#066fef',
  primaryForeground: '#ffffff',
  secondary: '#1e1e1e',
  muted: '#1e1e1e',
  mutedForeground: '#a1a1aa',
  accent: '#262626',
  destructive: '#f14e46',
  success: '#4ade80',
  border: '#262626',
  input: '#2e2e2e',
  chat: '#0a0a0a',
  chatPattern: '#1f1f1f',
  bubbleMine: '#066fef',
  bubbleMineForeground: '#ffffff',
  bubbleTheirs: '#1e1e1e',
  bubbleTheirsForeground: '#f0f0f0',
  mention: '#5ea4ff',
  grouped: '#0a0a0a',
  ripple: 'rgba(255,255,255,0.08)',
  avatarPalette: AVATAR_PALETTE,
};

export const interaction = {
  duration: { press: 120, enter: 180, banner: 240, screen: 280 },
  // Spring presets for Animated.spring. `pop` overshoots visibly (small
  // controls appearing, e.g. the send button); `settle` eases into place
  // without bounce-back (content entering, e.g. message bubbles).
  spring: {
    pop: { friction: 5, tension: 300 },
    settle: { friction: 9, tension: 160 },
  },
} as const;

export const androidRipple = (
  color: string,
  borderless: boolean = false,
): { color: string; borderless: boolean } | undefined =>
  Platform.OS === 'android' ? { color, borderless } : undefined;

/** Cap for chrome text (badges, timestamps, tab labels) under large font scales. */
export const maxFontScale = { chrome: 1.4 } as const;

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
};

export const buildTheme = (scheme: ColorScheme): Theme => ({
  scheme,
  colors: scheme === 'dark' ? darkColors : lightColors,
});

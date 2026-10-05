import { Platform, StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

// Two first-class palettes: the original Telegram-night-blue dark theme and a
// Telegram-day-style light theme. Everything color-dependent (colors,
// typography, elevation) is resolved per scheme through ThemeContext; the
// structural tokens (spacing, radius, layout, interaction) are scheme-free
// and stay importable directly.

export type ColorScheme = 'light' | 'dark';

export const darkColors = {
  background: '#0E1621',
  surface: '#17212B',
  surfaceSunken: '#242F3D',
  // Flat night canvas behind the message thread — deliberately a different
  // plane from the header surface so bubbles read as objects on a canvas
  // instead of rows on a page. Never pure black.
  chatBackground: '#0E1621',
  primary: '#6AB2F2',
  // Dark-on-accent label (8:1 contrast) — white-on-accent fails AA on this
  // light night-blue primary.
  primaryText: '#0E1621',
  primaryPressed: '#4D9BE0',
  primarySurface: '#16324A',
  onPrimary: '#0E1621',
  onPrimaryMuted: 'rgba(14,22,33,0.82)',
  text: '#F5F5F5',
  textOnBubbleMine: '#FFFFFF',
  muted: '#90A0B0',
  border: '#2F3B4C',
  separator: '#1D2733',
  danger: '#F0625D',
  dangerSurface: '#2C1A1D',
  dangerBorder: '#5C2B2E',
  dangerText: '#F28B82',
  overlay: 'rgba(0,0,0,0.55)',
  bubbleMine: '#2B5278',
  bubbleTheirs: '#182533',
  unreadBadge: '#4C9CE2',
  tickBlue: '#53BDEB',
  mention: '#8CC8FF',
  success: '#4FBF7F',
  // Avatar initials are always white: the palette below is vibrant in both
  // schemes and every entry carries white glyphs.
  avatarText: '#FFFFFF',
  ripple: 'rgba(255,255,255,0.08)',
  avatarPalette: ['#E17076', '#FAA774', '#A695E7', '#7BC862', '#6EC9CB', '#65AADD', '#EE7AAE'],
} as const;

export type ThemeColors = { [K in keyof typeof darkColors]: (typeof darkColors)[K] extends readonly string[] ? readonly string[] : string };

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSunken: '#F0F2F5',
  // Telegram-day wash: a light gray-blue canvas so white "theirs" bubbles
  // still read as objects on it.
  chatBackground: '#E7EDF3',
  // Darkened accent so WHITE-on-primary passes AA (~5:1) on light.
  primary: '#0B6BBE',
  primaryText: '#FFFFFF',
  primaryPressed: '#0A5CA4',
  primarySurface: '#E1EEFA',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255,255,255,0.85)',
  text: '#0F1720',
  // Light "mine" bubble carries dark text (Telegram-day), not white.
  textOnBubbleMine: '#0F1720',
  muted: '#65788A',
  border: '#D7DFE6',
  separator: '#E6EBEF',
  danger: '#D93025',
  dangerSurface: '#FDECEA',
  dangerBorder: '#F2B8B5',
  dangerText: '#A50E0E',
  overlay: 'rgba(0,0,0,0.4)',
  bubbleMine: '#D5E9FC',
  bubbleTheirs: '#FFFFFF',
  unreadBadge: '#0B6BBE',
  tickBlue: '#1683D8',
  mention: '#0B5FA8',
  success: '#1E8E4E',
  avatarText: '#FFFFFF',
  ripple: 'rgba(0,0,0,0.06)',
  avatarPalette: ['#E17076', '#FAA774', '#A695E7', '#7BC862', '#6EC9CB', '#65AADD', '#EE7AAE'],
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  bubble: 18,
  bubbleTail: 5,
  pill: 999,
} as const;

export type Typography = Record<
  'largeTitle' | 'title' | 'subtitle' | 'body' | 'label' | 'caption',
  TextStyle
>;

export const buildTypography = (colors: ThemeColors): Typography => ({
  largeTitle: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, fontWeight: '400', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted },
  caption: { fontSize: 12, fontWeight: '400', color: colors.muted },
});

export const layout = {
  touchTarget: 44,
  hairline: StyleSheet.hairlineWidth,
  bubbleMaxWidth: '78%',
  headerMinHeight: 56,
  avatar: { sm: 32, md: 44, lg: 56, xl: 88 },
} as const;

export type Elevation = Record<'none' | 'card' | 'raised' | 'floating', ViewStyle>;

// String boxShadow only (New Architecture, which Expo 57 mandates). Do NOT
// also set the legacy Android `elevation` prop or the iOS shadow* props —
// doubling them renders two shadows. Light shadows are much softer: heavy
// dark shadows read as smudges on white.
export const buildElevation = (scheme: ColorScheme): Elevation =>
  scheme === 'dark'
    ? {
        none: {},
        card: { boxShadow: '0px 1px 3px rgba(0,0,0,0.35)' },
        raised: { boxShadow: '0px 2px 8px rgba(0,0,0,0.45)' },
        floating: { boxShadow: '0px 6px 16px rgba(0,0,0,0.60)' },
      }
    : {
        none: {},
        card: { boxShadow: '0px 1px 3px rgba(23,33,43,0.12)' },
        raised: { boxShadow: '0px 2px 8px rgba(23,33,43,0.14)' },
        floating: { boxShadow: '0px 6px 16px rgba(23,33,43,0.20)' },
      };

export const interaction = {
  pressedOpacity: 0.7,
  pressedOpacityFilled: 0.85,
  disabledOpacity: 0.45,
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

export const maxFontScale = { chrome: 1.4 } as const;

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  typography: Typography;
  elevation: Elevation;
  spacing: typeof spacing;
  radius: typeof radius;
  layout: typeof layout;
  interaction: typeof interaction;
  maxFontScale: typeof maxFontScale;
};

export const buildTheme = (scheme: ColorScheme): Theme => {
  const colors: ThemeColors = scheme === 'dark' ? darkColors : lightColors;
  return {
    scheme,
    colors,
    typography: buildTypography(colors),
    elevation: buildElevation(scheme),
    spacing,
    radius,
    layout,
    interaction,
    maxFontScale,
  };
};

export const darkTheme: Theme = buildTheme('dark');
export const lightTheme: Theme = buildTheme('light');

export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Layout = typeof layout;
export type Interaction = typeof interaction;
export type MaxFontScale = typeof maxFontScale;

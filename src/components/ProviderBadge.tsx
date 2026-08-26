import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { useThemeContext } from '../theme/ThemeContext';
import { maxFontScale, radius, spacing, type ColorScheme } from '../theme/theme';
import { providerLabel } from '../utils/chatRules';
import type { AuthProvider } from '../types/user';

export type ProviderBadgeProps = {
  provider: AuthProvider;
};

type BadgePalette = {
  background: string;
  border: string;
  text: string;
};

// These palettes are load-bearing for the cross-provider pairing rule
// (password <-> Google/Apple) and are intentionally kept as literal colors
// rather than folded into the shared token set — one tuned set per scheme.
const palettes: Record<ColorScheme, Record<AuthProvider, BadgePalette>> = {
  dark: {
    password: { background: '#16324A', border: '#2B5C86', text: '#7CC1F5' },
    google: { background: '#3A1D21', border: '#6E3238', text: '#F0918B' },
    apple: { background: '#222E3A', border: '#3A4A5A', text: '#AAB8C5' },
  },
  light: {
    password: { background: '#E3F0FB', border: '#B7D8F2', text: '#0B6BBE' },
    google: { background: '#FDE9E7', border: '#F5C0BB', text: '#C5221F' },
    apple: { background: '#EDF1F5', border: '#CBD5DF', text: '#4A5866' },
  },
};

export const ProviderBadge: React.FC<ProviderBadgeProps> = ({
  provider,
}: ProviderBadgeProps) => {
  const { scheme } = useThemeContext();
  const palette: BadgePalette = palettes[scheme][provider];

  const containerStyle: ViewStyle = useMemo(
    () => ({ backgroundColor: palette.background, borderColor: palette.border }),
    [palette.background, palette.border],
  );

  const textStyle: TextStyle = useMemo(
    () => ({ color: palette.text }),
    [palette.text],
  );

  return (
    <View style={[styles.badge, containerStyle]}>
      <Text
        style={[styles.label, textStyle]}
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontScale.chrome}
      >
        {providerLabel(provider)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default ProviderBadge;

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../theme/ThemeContext';
import { maxFontScale, radius, spacing, type Theme } from '../theme/theme';

export type DateSeparatorProps = {
  label: string;
};

// Non-sticky by design: a sticky header fights `inverted` FlatLists (the
// sticky index math is computed against the pre-inversion order), so this
// just renders as a normal row that scrolls with the thread.
export const DateSeparator: React.FC<DateSeparatorProps> = ({ label }: DateSeparatorProps) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container} accessibilityRole="header">
      <Text style={styles.label} maxFontSizeMultiplier={maxFontScale.chrome}>
        {label}
      </Text>
    </View>
  );
};

const createStyles = ({ colors, scheme }: Theme) =>
  StyleSheet.create({
    // Flat WhatsApp chip: a pill that separates from the canvas by surface
    // contrast alone — no shadow on dark; on light the chip is the plain
    // surface over the tinted wash.
    container: {
      alignSelf: 'center',
      backgroundColor: scheme === 'dark' ? colors.surfaceSunken : colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginVertical: spacing.md,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
  });

export default DateSeparator;

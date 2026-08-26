import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { spacing, type Theme } from '../theme/theme';

export type LoadingProps = {
  label?: string;
  compact?: boolean;
};

export const Loading: React.FC<LoadingProps> = ({ label, compact = false }: LoadingProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[styles.container, compact ? styles.compact : null]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {label !== undefined && label.length > 0 ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: colors.background,
    },
    compact: {
      flex: 0,
      backgroundColor: 'transparent',
      padding: spacing.sm,
    },
    label: {
      marginTop: spacing.md,
      fontSize: 15,
      lineHeight: 20,
      color: colors.muted,
      textAlign: 'center',
    },
  });

export default Loading;

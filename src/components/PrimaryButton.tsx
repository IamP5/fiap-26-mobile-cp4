import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, interaction, maxFontScale, radius, spacing, type Theme } from '../theme/theme';

export type PrimaryButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: PrimaryButtonVariant;
};

type VariantStyles = {
  container: StyleProp<ViewStyle>;
  label: StyleProp<TextStyle>;
  spinner: string;
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    base: {
      minHeight: 50,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + spacing.xxs,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      alignItems: 'stretch',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 22,
    },
    baseLabel: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    blocked: {
      opacity: interaction.disabledOpacity,
    },
    primaryContainer: {
      backgroundColor: colors.primary,
    },
    primaryLabel: {
      color: colors.primaryText,
    },
    secondaryContainer: {
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryLabel: {
      color: colors.text,
    },
    dangerContainer: {
      backgroundColor: colors.dangerSurface,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    dangerLabel: {
      color: colors.dangerText,
    },
    ghostContainer: {
      backgroundColor: 'transparent',
    },
    ghostLabel: {
      color: colors.primary,
    },
    pressedGhost: {
      opacity: interaction.pressedOpacity,
    },
    pressedFilled: {
      opacity: interaction.pressedOpacityFilled,
    },
  });

const isGhostVariant = (variant: PrimaryButtonVariant): boolean => variant === 'ghost';

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: PrimaryButtonProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const variantStyles: Record<PrimaryButtonVariant, VariantStyles> = useMemo(
    () => ({
      primary: {
        container: styles.primaryContainer,
        label: styles.primaryLabel,
        spinner: colors.primaryText,
      },
      secondary: {
        container: styles.secondaryContainer,
        label: styles.secondaryLabel,
        spinner: colors.text,
      },
      danger: {
        container: styles.dangerContainer,
        label: styles.dangerLabel,
        spinner: colors.dangerText,
      },
      ghost: {
        container: styles.ghostContainer,
        label: styles.ghostLabel,
        spinner: colors.primary,
      },
    }),
    [styles, colors],
  );

  const isBlocked: boolean = disabled || loading;
  const current: VariantStyles = variantStyles[variant];
  const ghost: boolean = isGhostVariant(variant);

  return (
    <Pressable
      onPress={onPress}
      disabled={isBlocked}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      android_ripple={androidRipple(colors.ripple)}
      style={({ pressed }: { pressed: boolean }) => [
        styles.base,
        current.container,
        pressed && !isBlocked ? (ghost ? styles.pressedGhost : styles.pressedFilled) : null,
        isBlocked ? styles.blocked : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={current.spinner} />
        ) : (
          <Text
            style={[styles.baseLabel, current.label]}
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.chrome}
          >
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

export default PrimaryButton;

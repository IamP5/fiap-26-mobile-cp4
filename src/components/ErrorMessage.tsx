import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { interaction, layout, spacing, type Theme } from '../theme/theme';
import { Icon } from './Icon';

export type ErrorMessageProps = {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  onDismiss,
}: ErrorMessageProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: interaction.duration.banner,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const animatedStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View
      style={[styles.card, animatedStyle]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Icon name="alert" size={14} color={colors.dangerSurface} />
        </View>
        <Text style={styles.message}>{message}</Text>
        {onDismiss !== undefined ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Fechar aviso"
            hitSlop={8}
            style={({ pressed }: { pressed: boolean }) => [
              styles.dismissButton,
              pressed ? styles.dismissButtonPressed : null,
            ]}
          >
            <Icon name="close" size={14} color={colors.dangerText} />
          </Pressable>
        ) : null}
      </View>
      {onRetry !== undefined ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
          style={({ pressed }: { pressed: boolean }) => [
            styles.retryButton,
            pressed ? styles.retryButtonPressed : null,
          ]}
        >
          <Text style={styles.retryLabel}>Tentar novamente</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.dangerSurface,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      borderRadius: 14,
      padding: spacing.md,
      marginVertical: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    iconCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    message: {
      flex: 1,
      color: colors.dangerText,
      fontSize: 14,
      lineHeight: 20,
    },
    dismissButton: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      marginTop: -(layout.touchTarget - 22) / 2,
      marginRight: -(layout.touchTarget - 22) / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissButtonPressed: {
      opacity: interaction.pressedOpacity,
    },
    retryButton: {
      alignSelf: 'flex-start',
      marginTop: spacing.md,
      minHeight: layout.touchTarget,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryButtonPressed: {
      opacity: interaction.pressedOpacityFilled,
    },
    retryLabel: {
      color: colors.dangerSurface,
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default ErrorMessage;

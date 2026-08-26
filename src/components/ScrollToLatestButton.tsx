import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, interaction, layout, spacing, type Theme } from '../theme/theme';
import { Icon } from './Icon';

export type ScrollToLatestButtonProps = {
  visible: boolean;
  onPress: () => void;
};

const ANIMATION_DURATION_MS = 150;

export const ScrollToLatestButton: React.FC<ScrollToLatestButtonProps> = ({
  visible,
  onPress,
}: ScrollToLatestButtonProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    // Pop in with a spring, fade out with a quick timing — overshoot only
    // reads as intentional in the appearing direction.
    if (visible) {
      Animated.spring(progress, {
        toValue: 1,
        ...interaction.spring.pop,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, progress]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ir para a mensagem mais recente"
        android_ripple={androidRipple(colors.ripple)}
        style={({ pressed }: { pressed: boolean }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Icon name="chevron-down" color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.md,
    },
    // Telegram-style FAB: surface disc with a subtle border ring so it
    // separates from same-hue bubbles beneath it, plus a floating shadow.
    button: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: layout.touchTarget / 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      ...elevation.floating,
    },
    buttonPressed: {
      opacity: 0.85,
    },
  });

export default ScrollToLatestButton;

import React, { useCallback } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { buttonVariants } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { fadeIn, fadeOut, timing } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple } from '@/theme/theme';

export type PrimaryButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: PrimaryButtonVariant;
  className?: string;
};

const BUTTON_VARIANT = {
  primary: 'default',
  secondary: 'outline',
  danger: 'destructive',
  ghost: 'ghost',
} as const;

const LABEL_CLASS: Record<PrimaryButtonVariant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-foreground',
  danger: 'text-white',
  ghost: 'text-foreground',
};

/** Full-width capsule button in the platform's shape, with a light haptic
 * tick and a label ⇄ spinner crossfade that keeps the button's size stable. */
export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  className,
}) => {
  const colors = useThemeColors();
  const spinner: string = variant === 'primary' || variant === 'danger' ? colors.primaryForeground : colors.foreground;
  const inactive: boolean = disabled || loading;

  const labelStyle = useAnimatedStyle(() => ({ opacity: withTiming(loading ? 0 : 1, timing.fast) }), [loading]);

  const handlePress = useCallback((): void => {
    haptics.tap();
    onPress();
  }, [onPress]);

  return (
    <PressableScale
      activeScale={0.98}
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      android_ripple={androidRipple(
        variant === 'primary' || variant === 'danger' ? 'rgba(255,255,255,0.24)' : colors.ripple,
      )}
      className={cn(
        buttonVariants({ variant: BUTTON_VARIANT[variant], size: 'lg' }),
        // Capsules on both platforms: iOS 26 large buttons, Material 3 filled buttons.
        'overflow-hidden rounded-full shadow-none',
        isMaterial ? 'h-12' : 'h-[50px]',
        // iOS secondary buttons are gray-tinted, not outlined.
        variant === 'secondary' && !isMaterial && 'bg-muted border-0',
        disabled && !loading && 'opacity-50',
        className,
      )}
    >
      <Animated.Text
        style={labelStyle}
        numberOfLines={1}
        className={cn(
          isMaterial ? 'text-[15px] font-medium' : 'text-[17px] font-semibold',
          LABEL_CLASS[variant],
          variant === 'secondary' && !isMaterial && 'text-primary',
          variant === 'ghost' && 'text-primary',
        )}
      >
        {label}
      </Animated.Text>
      {loading ? (
        <Animated.View
          entering={fadeIn}
          exiting={fadeOut}
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <ActivityIndicator size="small" color={spinner} />
        </Animated.View>
      ) : null}
    </PressableScale>
  );
};

export default PrimaryButton;

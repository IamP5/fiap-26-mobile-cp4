import React from 'react';
import { Pressable, type PressableProps, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { spring } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = PressableProps & {
  /** Scale while pressed; 0.97 for rows/cards, ~0.9 for small icon buttons. */
  activeScale?: number;
  className?: string;
};

/**
 * Pressable with a subtle scale-down on press (iOS; Android keeps its ripple). Transform lives in `style` (Reanimated), layout
 * and color stay in `className` (Uniwind).
 */
export const PressableScale = React.forwardRef<React.ComponentRef<typeof Pressable>, PressableScaleProps>(
  ({ activeScale: requestedScale = 0.97, onPressIn, onPressOut, style, disabled, ...rest }, ref) => {
    // Material answers touches with the ripple alone; scaling is an iOS idiom.
    const activeScale: number = isMaterial ? 1 : requestedScale;
    const pressed = useSharedValue<number>(0);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: withSpring(pressed.value === 1 ? activeScale : 1, spring.snappy) }],
    }));

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onPressIn={(event: GestureResponderEvent) => {
          pressed.value = 1;
          onPressIn?.(event);
        }}
        onPressOut={(event: GestureResponderEvent) => {
          pressed.value = 0;
          onPressOut?.(event);
        }}
        style={[animatedStyle, style as object]}
        {...rest}
      />
    );
  },
);
PressableScale.displayName = 'PressableScale';

export default PressableScale;

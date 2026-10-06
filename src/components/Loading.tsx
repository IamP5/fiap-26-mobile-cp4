import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { fadeIn } from '@/lib/motion';
import { cn } from '@/lib/utils';

export type LoadingProps = {
  label?: string;
  compact?: boolean;
};

const Dot: React.FC<{ index: number }> = ({ index }) => {
  const progress = useSharedValue<number>(0);
  useEffect(() => {
    progress.value = withDelay(
      index * 140,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [index, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + progress.value * 0.7,
    transform: [{ translateY: -progress.value * 4 }],
  }));
  return <Animated.View className="bg-muted-foreground size-1.5 rounded-full" style={style} />;
};

/** Three-dot "typing" loader — reads as a chat app, not a generic spinner. */
export const Loading: React.FC<LoadingProps> = ({ label, compact = false }) => (
  <Animated.View
    entering={fadeIn}
    className={cn('items-center justify-center gap-3', compact ? 'py-4' : 'flex-1 p-8')}
    accessibilityRole="progressbar"
    accessibilityLabel={label}
  >
    <View className="h-4 flex-row items-center gap-1.5">
      {[0, 1, 2].map((index: number) => (
        <Dot key={index} index={index} />
      ))}
    </View>
    {label !== undefined && label.length > 0 ? <Text className="text-muted-foreground text-sm">{label}</Text> : null}
  </Animated.View>
);

export default Loading;

import { CircleAlert, RotateCw, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { Icon } from '@/components/ui/icon';
import { fadeOut, riseIn } from '@/lib/motion';

export type ErrorMessageProps = {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

/** shadcn "Alert" (destructive) with optional retry / dismiss. */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry, onDismiss }) => (
  <Animated.View
    entering={riseIn}
    exiting={fadeOut}
    className="border-destructive/25 bg-destructive/8 my-2 gap-3 rounded-xl border p-3.5"
    accessibilityRole="alert"
    accessibilityLiveRegion="polite"
  >
    <View className="flex-row items-start gap-2.5">
      <Icon as={CircleAlert} className="text-destructive mt-0.5 size-4" />
      <Text className="text-foreground flex-1 text-sm leading-5">{message}</Text>
      {onDismiss !== undefined ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Fechar aviso"
          className="size-5 items-center justify-center rounded-full active:bg-accent"
        >
          <Icon as={X} className="text-muted-foreground size-3.5" />
        </Pressable>
      ) : null}
    </View>
    {onRetry !== undefined ? (
      <PressableScale
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Tentar novamente"
        className="border-border bg-background h-8 flex-row items-center gap-1.5 self-start rounded-lg border px-3 active:bg-accent"
      >
        <Icon as={RotateCw} className="text-foreground size-3.5" />
        <Text className="text-foreground text-[13px] font-medium">Tentar novamente</Text>
      </PressableScale>
    ) : null}
  </Animated.View>
);

export default ErrorMessage;

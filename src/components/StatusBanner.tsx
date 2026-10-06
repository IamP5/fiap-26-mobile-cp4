import { MessageCircle, Users, WifiOff, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/motion/PressableScale';
import { Icon } from '@/components/ui/icon';
import { dropIn, dropOut } from '@/lib/motion';
import type { PushPayload } from '@/types/notification';

/** "Sem conexão" strip, driven by the Realtime Database connection state. */
export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(180)}
      className="bg-foreground absolute left-0 right-0 top-0 flex-row items-center justify-center gap-2 px-4 pb-1.5"
      style={{ paddingTop: insets.top + 4 }}
      pointerEvents="none"
      accessibilityRole="alert"
    >
      <Icon as={WifiOff} className="text-background size-3.5" />
      <Text className="text-background text-xs font-medium">Sem conexão · sincronizando quando voltar</Text>
    </Animated.View>
  );
};

export type InAppNotificationProps = {
  payload: PushPayload;
  onPress: (payload: PushPayload) => void;
  onDismiss: () => void;
};

/** Sonner-style toast for messages that arrive while the app is open. */
export const InAppNotification: React.FC<InAppNotificationProps> = ({ payload, onPress, onDismiss }) => {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={dropIn}
      exiting={dropOut}
      className="absolute left-3 right-3 z-50"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      <View className="bg-popover border-border flex-row items-center gap-3 rounded-2xl border p-3 shadow-xl shadow-black/15">
        <PressableScale
          activeScale={0.98}
          onPress={() => onPress(payload)}
          accessibilityRole="button"
          accessibilityLabel={`Nova notificação: ${payload.title ?? ''} ${payload.body ?? ''}. Toque para abrir.`}
          className="flex-1 flex-row items-center gap-3"
        >
          <View className="bg-primary size-9 items-center justify-center rounded-full">
            <Icon
              as={payload.conversationType === 'group' ? Users : MessageCircle}
              className="text-primary-foreground size-4"
            />
          </View>
          <View className="flex-1">
            <Text className="text-popover-foreground text-sm font-semibold" numberOfLines={1}>
              {payload.title ?? 'Nova mensagem'}
            </Text>
            {payload.body !== null ? (
              <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                {payload.body}
              </Text>
            ) : null}
          </View>
        </PressableScale>
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Fechar notificação"
          className="size-6 items-center justify-center rounded-full active:bg-accent"
        >
          <Icon as={X} className="text-muted-foreground size-3.5" />
        </Pressable>
      </View>
    </Animated.View>
  );
};

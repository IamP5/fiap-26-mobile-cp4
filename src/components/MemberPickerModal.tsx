import { Check, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, type LayoutChangeEvent, type ListRenderItemInfo, Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { PressableScale } from '@/components/motion/PressableScale';
import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { listItemEnter, popIn, popOut, spring } from '@/lib/motion';
import type { PublicProfile } from '@/types/user';
import { Avatar } from './Avatar';

export type MemberPickerModalProps = {
  visible: boolean;
  title: string;
  members: readonly PublicProfile[];
  /** Adds an "Todos" row at the top (recipient picker). */
  allowEveryone?: boolean;
  selectedUid?: string | null;
  onSelect: (member: PublicProfile | null) => void;
  onClose: () => void;
};

/** Off-screen distance used before the sheet has been measured. */
const FALLBACK_SHEET_HEIGHT = 640;

/**
 * Bottom sheet listing group members (mentions / recipient picker).
 *
 * The RN Modal itself does not animate: the sheet springs up and the backdrop
 * fades in on a shared progress value, and on close both run in reverse
 * before the Modal unmounts — layout-animation `exiting` would never play
 * because Modal tears its children down as soon as `visible` flips.
 */
export const MemberPickerModal: React.FC<MemberPickerModalProps> = ({
  visible,
  title,
  members,
  allowEveryone = false,
  selectedUid = null,
  onSelect,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState<boolean>(visible);
  const progress = useSharedValue<number>(0);
  const sheetHeight = useSharedValue<number>(FALLBACK_SHEET_HEIGHT);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, spring.gentle);
      return;
    }
    progress.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }, (finished?: boolean) => {
      if (finished === true) {
        scheduleOnRN(setMounted, false);
      }
    });
  }, [visible, progress]);

  const handleSheetLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      sheetHeight.value = event.nativeEvent.layout.height;
    },
    [sheetHeight],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], 'clamp'),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (sheetHeight.value + 24) }],
  }));

  const select = useCallback(
    (member: PublicProfile | null): void => {
      haptics.select();
      onSelect(member);
    },
    [onSelect],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PublicProfile>) => {
      const selected: boolean = selectedUid === item.uid;
      return (
        <Animated.View entering={listItemEnter(index + (allowEveryone ? 1 : 0))}>
          <PressableScale
            activeScale={0.985}
            onPress={() => select(item)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            accessibilityState={{ selected }}
            className="active:bg-accent mx-2 min-h-14 flex-row items-center gap-3 rounded-lg px-3"
          >
            <Avatar name={item.name} uid={item.uid} photoUrl={item.photoUrl} size={36} />
            <Text className="text-foreground flex-1 text-[15px] font-medium" numberOfLines={1}>
              {item.name}
            </Text>
            {selected ? (
              <Animated.View entering={popIn} exiting={popOut}>
                <Icon as={Check} strokeWidth={2.5} className="text-primary size-4" />
              </Animated.View>
            ) : null}
          </PressableScale>
        </Animated.View>
      );
    },
    [select, selectedUid, allowEveryone],
  );

  const everyoneSelected: boolean = selectedUid === null;

  return (
    <Modal visible={visible || mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        </Animated.View>
        <Animated.View
          onLayout={handleSheetLayout}
          style={[sheetStyle, { paddingBottom: insets.bottom + 12 }]}
          className="bg-popover border-border max-h-[70%] rounded-t-2xl border-x border-t pt-2.5 shadow-2xl shadow-black/30"
          accessibilityViewIsModal
        >
          <View className="bg-muted-foreground/30 mb-3 h-1 w-9 self-center rounded-full" />
          <View className="mb-1 flex-row items-baseline justify-between px-5 pb-2">
            <Text className="text-foreground text-base font-semibold tracking-tight">{title}</Text>
            {members.length > 0 ? (
              <Text className="text-muted-foreground text-xs tabular-nums">
                {members.length} {members.length === 1 ? 'integrante' : 'integrantes'}
              </Text>
            ) : null}
          </View>
          {allowEveryone ? (
            <Animated.View entering={listItemEnter(0)}>
              <PressableScale
                activeScale={0.985}
                onPress={() => select(null)}
                accessibilityRole="button"
                accessibilityLabel="Todos do grupo"
                accessibilityState={{ selected: everyoneSelected }}
                className="active:bg-accent mx-2 min-h-14 flex-row items-center gap-3 rounded-lg px-3"
              >
                <View className="bg-primary size-9 items-center justify-center rounded-full">
                  <Icon as={Users} className="text-primary-foreground size-4" />
                </View>
                <Text className="text-foreground flex-1 text-[15px] font-medium">Todos do grupo</Text>
                {everyoneSelected ? (
                  <Animated.View entering={popIn} exiting={popOut}>
                    <Icon as={Check} strokeWidth={2.5} className="text-primary size-4" />
                  </Animated.View>
                ) : null}
              </PressableScale>
              <View className="bg-border mx-5 my-1 h-px" />
            </Animated.View>
          ) : null}
          <FlatList
            data={members}
            keyExtractor={(item: PublicProfile) => item.uid}
            renderItem={renderItem}
            style={{ flexGrow: 0 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text className="text-muted-foreground p-5 text-center text-sm">Nenhum outro integrante no grupo.</Text>
            }
          />
        </Animated.View>
      </View>
    </Modal>
  );
};

export default MemberPickerModal;

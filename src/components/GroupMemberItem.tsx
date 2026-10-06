import { Crown } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { fadeIn, fadeOut } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple } from '@/theme/theme';
import type { PublicProfile } from '@/types/user';
import { Avatar } from './Avatar';

export type GroupMemberItemProps = {
  member: PublicProfile;
  isOwner: boolean;
  isMe: boolean;
  onPress: (member: PublicProfile) => void;
  /** Only passed to the group owner, for members other than themselves. */
  onRemove?: (member: PublicProfile) => void;
  removing?: boolean;
};

export const GroupMemberItem: React.FC<GroupMemberItemProps> = ({
  member,
  isOwner,
  isMe,
  onPress,
  onRemove,
  removing = false,
}) => {
  const colors = useThemeColors();
  const handlePress = useCallback((): void => onPress(member), [onPress, member]);
  const handleRemove = useCallback((): void => {
    haptics.tap();
    onRemove?.(member);
  }, [onRemove, member]);

  return (
    <View className={cn('flex-row items-center', onRemove !== undefined && 'pr-2')}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${member.name}${isOwner ? ', proprietário' : ''}`}
        android_ripple={androidRipple(colors.ripple)}
        className="ios:active:bg-accent web:active:bg-accent min-h-[60px] flex-1 flex-row items-center gap-3 px-4 py-2"
      >
        <Avatar name={member.name} uid={member.uid} photoUrl={member.photoUrl} size={46} />
        <Text className="text-foreground min-w-0 flex-1 text-[16px] font-medium" numberOfLines={1}>
          {isMe ? `${member.name} (você)` : member.name}
        </Text>
        {/* Role as trailing text, like Telegram ("owner") and WhatsApp ("Admin"). */}
        {isOwner ? (
          <View className="flex-row items-center gap-1">
            <Icon as={Crown} className="text-primary size-3.5" />
            <Text className="text-primary text-[13px] font-medium">Proprietário</Text>
          </View>
        ) : null}
      </Pressable>
      {onRemove !== undefined ? (
        removing ? (
          <Animated.View
            key="removing"
            entering={fadeIn}
            exiting={fadeOut}
            className="h-8 w-[76px] items-center justify-center"
          >
            <ActivityIndicator color={colors.destructive} />
          </Animated.View>
        ) : (
          <Animated.View key="remove" entering={fadeIn} exiting={fadeOut}>
            <Pressable
              onPress={handleRemove}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${member.name} do grupo`}
              android_ripple={androidRipple(colors.ripple)}
              className="h-8 justify-center overflow-hidden rounded-full px-3 active:opacity-60"
            >
              <Text className="text-destructive text-[15px] font-medium">Remover</Text>
            </Pressable>
          </Animated.View>
        )
      ) : null}
    </View>
  );
};

export default GroupMemberItem;

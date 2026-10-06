import { Check } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { popIn, popOut } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple } from '@/theme/theme';
import type { PublicProfile } from '@/types/user';
import { Avatar } from './Avatar';

export type UserItemProps = {
  user: PublicProfile;
  onPress: (user: PublicProfile) => void;
  /** Selection mode (group members): undefined renders a plain row. */
  selected?: boolean;
  disabled?: boolean;
  /** Small caption under the name (e.g. "Já está no grupo"). */
  caption?: string;
};

/** Full-width contact row (same geometry as ConversationItem); iOS-style round check. */
export const UserItem: React.FC<UserItemProps> = ({ user, onPress, selected, disabled = false, caption }) => {
  const colors = useThemeColors();
  const handlePress = useCallback((): void => onPress(user), [onPress, user]);
  const selectable: boolean = selected !== undefined;
  const checked: boolean = selected === true;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected, disabled } : { disabled }}
      accessibilityLabel={selectable ? user.name : `Conversar com ${user.name}`}
      android_ripple={androidRipple(colors.ripple)}
      className={cn(
        'ios:active:bg-accent web:active:bg-accent min-h-16 flex-row items-center gap-3 px-4 py-2',
        disabled && 'opacity-40',
      )}
    >
      <Avatar name={user.name} uid={user.uid} photoUrl={user.photoUrl} size={46} />
      <View className="flex-1">
        <Text className="text-foreground text-base font-medium" numberOfLines={1}>
          {user.name}
        </Text>
        {caption !== undefined ? <Text className="text-muted-foreground text-[13px]">{caption}</Text> : null}
      </View>
      {selectable ? (
        <View
          className={cn(
            'size-[22px] items-center justify-center rounded-full border-2',
            checked ? 'bg-primary border-primary' : 'border-input',
          )}
        >
          {checked ? (
            <Animated.View entering={popIn} exiting={popOut}>
              <Icon as={Check} strokeWidth={3} className="text-primary-foreground size-3" />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
};

export default UserItem;

import { Check } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { popIn, popOut } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple, maxFontScale } from '@/theme/theme';
import type { ConversationSummary } from '@/types/chat';
import { formatRelativeShort } from '@/utils/datetime';
import { Avatar } from './Avatar';

export type ConversationItemProps = {
  conversation: ConversationSummary;
  meUid: string;
  /** Name of the last message's author (groups). */
  lastSenderName: string | null;
  onPress: (conversation: ConversationSummary) => void;
};

export const AVATAR_SIZE = 54;
/** Where the row text starts: 16 padding + avatar + 12 gap. */
export const ROW_TEXT_INSET: number = 16 + AVATAR_SIZE + 12;

/**
 * Full-width chat row, as in Telegram/WhatsApp: a gray highlight on press
 * (iOS) or a ripple (Android). The list adds iOS hairlines between rows,
 * inset past the avatar (ROW_TEXT_INSET); Material rows have none. Unread rows read heavier — bolder title,
 * foreground preview, accent timestamp — and carry a count badge.
 */
export const ConversationItem: React.FC<ConversationItemProps> = ({ conversation, meUid, lastSenderName, onPress }) => {
  const colors = useThemeColors();
  const handlePress = useCallback((): void => onPress(conversation), [onPress, conversation]);

  const isGroup: boolean = conversation.type === 'group';
  const last = conversation.lastMessage;
  const mine: boolean = last !== null && last.senderId === meUid;
  const author: string | null = last === null || mine ? null : isGroup ? lastSenderName : null;
  const preview: string = last === null ? (isGroup ? 'Grupo criado. Diga oi!' : 'Nenhuma mensagem ainda') : last.text;
  const unread: number = conversation.unreadCount;
  const hasUnread: boolean = unread > 0;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${isGroup ? 'Grupo' : 'Conversa com'} ${conversation.title}${
        hasUnread ? `, ${unread} não lidas` : ''
      }`}
      android_ripple={androidRipple(colors.ripple)}
      className="ios:active:bg-accent web:active:bg-accent flex-row items-center gap-3 pl-4"
    >
      <Avatar
        name={conversation.title}
        uid={conversation.otherUid ?? conversation.id}
        photoUrl={conversation.photoUrl}
        variant={isGroup ? 'group' : 'person'}
        size={AVATAR_SIZE}
      />
      <View className="flex-1 gap-0.5 py-3 pr-4">
        <View className="flex-row items-center gap-2">
          <Text
            className={cn('text-foreground flex-1 text-[16px]', hasUnread ? 'font-semibold' : 'font-medium')}
            numberOfLines={1}
          >
            {conversation.title}
          </Text>
          {last !== null ? (
            <Text
              className={cn('text-xs tabular-nums', hasUnread ? 'text-primary font-semibold' : 'text-muted-foreground')}
              maxFontSizeMultiplier={maxFontScale.chrome}
            >
              {formatRelativeShort(last.createdAt)}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center gap-1">
            {mine ? <Icon as={Check} strokeWidth={2.5} className="text-muted-foreground size-3.5" /> : null}
            <Text
              className={cn('flex-1 text-sm', hasUnread ? 'text-foreground' : 'text-muted-foreground')}
              numberOfLines={1}
            >
              {author !== null ? <Text className="text-foreground font-medium">{author}: </Text> : null}
              {preview}
            </Text>
          </View>
          {hasUnread ? (
            <Animated.View
              entering={popIn}
              exiting={popOut}
              className="bg-primary h-5 min-w-5 items-center justify-center rounded-full px-1.5"
            >
              <Text
                className="text-primary-foreground text-[11px] font-semibold tabular-nums"
                maxFontSizeMultiplier={maxFontScale.chrome}
              >
                {unread > 99 ? '99+' : unread}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

export default ConversationItem;

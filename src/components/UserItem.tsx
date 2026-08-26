import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import ProviderBadge from './ProviderBadge';
import { providerLabel } from '../utils/chatRules';
import { formatRelativeShort } from '../utils/datetime';
import { deriveTickState, TICK_LABELS, type TickState } from '../utils/receipts';
import type { ConversationPreview } from '../types/chat';
import type { ChatUser } from '../types/user';

export type UserItemProps = {
  user: ChatUser;
  meUid: string;
  /** Live conversation preview; null/undefined = no conversation yet. */
  preview?: ConversationPreview | null;
  onPress: (user: ChatUser) => void;
};

export const UserItem: React.FC<UserItemProps> = ({ user, meUid, preview, onPress }: UserItemProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const handlePress = useCallback((): void => {
    onPress(user);
  }, [onPress, user]);

  const lastMessage = preview?.lastMessage ?? null;
  const unreadCount: number = preview?.unreadCount ?? 0;
  const lastIsMine: boolean = lastMessage !== null && lastMessage.senderId === meUid;

  // Ticks only accompany MY last message (WhatsApp: the other person's text
  // gets no status prefix).
  const tickState: TickState | null =
    lastMessage !== null && lastIsMine
      ? deriveTickState(
          lastMessage.createdAt,
          preview?.otherDeliveredAt ?? 0,
          preview?.otherReadAt ?? 0,
        )
      : null;
  const tickIcon: IconName | null =
    tickState === null ? null : tickState === 'sent' ? 'check' : 'check-double';
  const tickColor: string = tickState === 'read' ? colors.tickBlue : colors.muted;

  const previewText: string | null = lastMessage !== null ? lastMessage.text : null;
  const secondLine: string =
    previewText ??
    (user.email !== null && user.email.length > 0 ? user.email : 'E-mail não informado');
  const timeLabel: string | null =
    lastMessage !== null ? formatRelativeShort(lastMessage.createdAt) : null;

  const statusHint: string =
    tickState !== null ? `, sua última mensagem foi ${TICK_LABELS[tickState]}` : '';
  const unreadHint: string =
    unreadCount > 0
      ? `, ${unreadCount} ${unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
      : '';
  const accessibilityLabel = `Conversar com ${user.name}, conta ${providerLabel(user.provider)}${
    previewText !== null ? `. Última mensagem: ${previewText}` : ''
  }${statusHint}${unreadHint}`;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={androidRipple(colors.ripple)}
      style={({ pressed }: { pressed: boolean }) => [
        styles.container,
        pressed ? styles.pressed : null,
      ]}
    >
      <Avatar name={user.name} uid={user.uid} photoUrl={user.photoUrl} size={layout.avatar.md} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          <ProviderBadge provider={user.provider} />
          {timeLabel !== null ? (
            <Text
              style={[styles.time, unreadCount > 0 ? styles.timeUnread : null]}
              maxFontSizeMultiplier={maxFontScale.chrome}
            >
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <View style={styles.previewRow}>
          {tickIcon !== null ? (
            <View style={styles.tick}>
              <Icon name={tickIcon} size={14} color={tickColor} />
            </View>
          ) : null}
          <Text
            style={[styles.preview, unreadCount > 0 ? styles.previewUnread : null]}
            numberOfLines={1}
          >
            {secondLine}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText} maxFontSizeMultiplier={maxFontScale.chrome}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const createStyles = ({ colors }: Theme) => StyleSheet.create({
  // Full-bleed messenger row: sits directly on the screen background, and the
  // pressed state is a slightly lighter surface highlight (never an opacity
  // flicker, which reads as a glitch on dark).
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: spacing.sm + spacing.xxs,
    paddingHorizontal: spacing.md,
    minHeight: 68,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  // WhatsApp: the timestamp turns accent-colored while the chat is unread.
  time: {
    fontSize: 12,
    color: colors.muted,
  },
  timeUnread: {
    color: colors.unreadBadge,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  tick: {
    marginRight: spacing.xs,
  },
  preview: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
  },
  previewUnread: {
    color: colors.text,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + spacing.xxs,
    marginLeft: spacing.sm,
    backgroundColor: colors.unreadBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

export default UserItem;

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import type { ConversationSummary } from '../types/chat';
import { formatRelativeShort } from '../utils/datetime';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type ConversationItemProps = {
  conversation: ConversationSummary;
  meUid: string;
  /** Name of the last message's author (groups). */
  lastSenderName: string | null;
  onPress: (conversation: ConversationSummary) => void;
};

export const ConversationItem: React.FC<ConversationItemProps> = ({ conversation, meUid, lastSenderName, onPress }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const handlePress = useCallback((): void => onPress(conversation), [onPress, conversation]);

  const isGroup: boolean = conversation.type === 'group';
  const last = conversation.lastMessage;
  const author: string | null =
    last === null ? null : last.senderId === meUid ? 'Você' : isGroup ? lastSenderName : null;
  const preview: string =
    last === null ? (isGroup ? 'Grupo criado. Diga oi!' : 'Nenhuma mensagem ainda') : last.text;
  const unread: number = conversation.unreadCount;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${isGroup ? 'Grupo' : 'Conversa com'} ${conversation.title}${
        unread > 0 ? `, ${unread} não lidas` : ''
      }`}
      android_ripple={androidRipple(colors.ripple)}
      style={({ pressed }: { pressed: boolean }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <Avatar
        name={conversation.title}
        uid={conversation.otherUid ?? conversation.id}
        photoUrl={conversation.photoUrl}
        variant={isGroup ? 'group' : 'person'}
        size={layout.avatar.lg - 4}
      />
      <View style={styles.info}>
        <View style={styles.titleRow}>
          {isGroup ? (
            <View style={styles.typeBadge}>
              <Icon name="group" size={12} color={colors.primary} />
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>
            {conversation.title}
          </Text>
          {last !== null ? (
            <Text style={[styles.time, unread > 0 ? styles.timeUnread : null]} maxFontSizeMultiplier={maxFontScale.chrome}>
              {formatRelativeShort(last.createdAt)}
            </Text>
          ) : null}
        </View>
        <View style={styles.previewRow}>
          <Text style={[styles.preview, unread > 0 ? styles.previewUnread : null]} numberOfLines={1}>
            {author !== null ? <Text style={styles.author}>{author}: </Text> : null}
            {preview}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText} maxFontSizeMultiplier={maxFontScale.chrome}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + spacing.xxs,
      paddingHorizontal: spacing.md,
      minHeight: 72,
      backgroundColor: colors.background,
    },
    pressed: { backgroundColor: colors.surface },
    info: { flex: 1, marginLeft: spacing.md },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    typeBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primarySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
    time: { fontSize: 12, color: colors.muted },
    timeUnread: { color: colors.unreadBadge, fontWeight: '600' },
    previewRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxs },
    preview: { flex: 1, fontSize: 14, color: colors.muted },
    previewUnread: { color: colors.text },
    author: { fontWeight: '600' },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs + spacing.xxs,
      marginLeft: spacing.sm,
      backgroundColor: colors.unreadBadge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: colors.onPrimary },
  });

export default ConversationItem;

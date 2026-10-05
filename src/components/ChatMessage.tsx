import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { interaction, layout, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import { formatClock } from '../utils/datetime';
import { Icon, type IconName } from './Icon';
import type { DisplayMessage } from '../types/chat';

export type ChatMessageProps = {
  message: DisplayMessage;
  isMine: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  senderName: string;
  /** Group chats label each run of received messages with its author. */
  showSender: boolean;
  /** Names of mentioned users, highlighted where "@Name" appears. */
  mentionNames: readonly string[];
  /** Explicit recipient of a group message ("Para Ana"); null = everyone. */
  targetName: string | null;
  /** The message mentions or targets the current user. */
  addressedToMe: boolean;
  onRetry?: (localId: string) => void;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits text into plain and "@Name" segments for highlighting. */
const splitMentions = (text: string, names: readonly string[]): Array<{ text: string; mention: boolean }> => {
  if (names.length === 0) {
    return [{ text, mention: false }];
  }
  const pattern = new RegExp(`(${[...names].sort((a, b) => b.length - a.length).map((n) => `@${escapeRegExp(n)}`).join('|')})`, 'g');
  return text
    .split(pattern)
    .filter((part: string) => part.length > 0)
    .map((part: string) => ({ text: part, mention: names.some((n: string) => part === `@${n}`) }));
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isMine,
  isFirstInGroup,
  isLastInGroup,
  senderName,
  showSender,
  mentionNames,
  targetName,
  addressedToMe,
  onRetry,
}: ChatMessageProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Only a genuinely new message animates in: an old row re-mounting through
  // list virtualization (scrolling back up the thread) must render settled,
  // or the history flickers with replayed entrances.
  const isFreshRef = useRef<boolean>(
    message.status === 'sending' || Date.now() - message.createdAt < 1500,
  );
  const opacity = useRef(new Animated.Value(isFreshRef.current ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(isFreshRef.current ? 10 : 0)).current;
  const scale = useRef(new Animated.Value(isFreshRef.current ? 0.96 : 1)).current;

  useEffect(() => {
    if (!isFreshRef.current) {
      return;
    }
    // Opacity on a quick timing, position/scale on a settle spring — the
    // bubble lands with weight (WhatsApp/Telegram send feel) instead of a
    // linear fade-slide.
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: interaction.duration.enter,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        ...interaction.spring.settle,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        ...interaction.spring.settle,
        useNativeDriver: true,
      }),
    ]).start();
    // Fired once on mount only — a row that regroups on later renders should
    // not replay the entry animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFailed: boolean = message.status === 'failed';
  const isSending: boolean = message.status === 'sending';

  const bubbleRadiusStyle: ViewStyle = useMemo(
    () => ({
      borderTopLeftRadius: radius.bubble,
      borderTopRightRadius: radius.bubble,
      borderBottomLeftRadius: !isMine && isLastInGroup ? radius.bubbleTail : radius.bubble,
      borderBottomRightRadius: isMine && isLastInGroup ? radius.bubbleTail : radius.bubble,
    }),
    [isMine, isLastInGroup],
  );

  const time: string = useMemo(() => formatClock(message.createdAt), [message.createdAt]);

  const statusSuffix: string = isSending ? ', enviando' : isFailed ? ', falha no envio' : '';
  const targetSuffix: string = targetName !== null ? `, para ${targetName}` : '';
  const composedLabel = `${isMine ? 'Você' : senderName} disse: ${message.text}${targetSuffix}, às ${time}${statusSuffix}`;

  const iconName: IconName = isSending ? 'pending' : isFailed ? 'alert' : 'check';
  const iconColor: string = isFailed ? colors.dangerText : colors.textOnBubbleMine;
  const segments = useMemo(() => splitMentions(message.text, mentionNames), [message.text, mentionNames]);

  const handleRetry = (): void => {
    if (message.localId !== undefined && onRetry !== undefined) {
      onRetry(message.localId);
    }
  };

  const bubbleContent = (
    <View
      style={[
        styles.bubble,
        bubbleRadiusStyle,
        isMine ? styles.bubbleMine : styles.bubbleTheirs,
        !isMine && addressedToMe ? styles.bubbleAddressed : null,
        isFailed ? styles.bubbleFailed : null,
        isSending ? styles.bubbleSending : null,
      ]}
    >
      {showSender && !isMine && isFirstInGroup ? (
        <Text style={styles.sender} numberOfLines={1}>
          {senderName}
        </Text>
      ) : null}
      {targetName !== null ? (
        <Text style={[styles.target, isMine ? styles.targetMine : null]} numberOfLines={1}>
          {isMine ? `Para ${targetName}` : addressedToMe ? 'Para você' : `Para ${targetName}`}
        </Text>
      ) : null}
      <View style={styles.contentRow}>
        <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs, isFailed ? styles.textFailed : null]}>
          {segments.map((segment, index) =>
            segment.mention ? (
              <Text key={index} style={[styles.mention, isMine ? styles.mentionMine : null]}>
                {segment.text}
              </Text>
            ) : (
              <Text key={index}>{segment.text}</Text>
            ),
          )}
        </Text>
        {isLastInGroup ? (
          <View style={styles.meta}>
            <Text
              style={[styles.time, isMine ? styles.timeMine : styles.timeTheirs, isFailed ? styles.timeFailed : null]}
              maxFontSizeMultiplier={maxFontScale.chrome}
              allowFontScaling
            >
              {time}
            </Text>
            {isMine ? (
              <View
                style={[styles.statusIcon, isFailed ? null : styles.statusIconDimmed]}
              >
                <Icon name={iconName} size={13} color={iconColor} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Animated.View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        { marginBottom: isLastInGroup ? spacing.sm + spacing.xxs : spacing.xxs, opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      {isFailed ? (
        <Pressable
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Falha ao enviar. Toque para tentar novamente."
          style={({ pressed }: { pressed: boolean }) => [
            styles.bubbleWrapper,
            pressed ? styles.pressed : null,
          ]}
        >
          {bubbleContent}
        </Pressable>
      ) : (
        <View style={styles.bubbleWrapper} accessible accessibilityLabel={composedLabel}>
          {bubbleContent}
        </View>
      )}
    </Animated.View>
  );
};

const createStyles = ({ colors }: Theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  pressed: {
    opacity: interaction.pressedOpacityFilled,
  },
  // The width cap lives on the wrapper, not the bubble: the wrapper is the
  // direct child of the row, and a percentage maxWidth on the bubble would
  // resolve against an unconstrained parent while the row child (flexShrink 0
  // by default) overflowed the screen.
  bubbleWrapper: {
    maxWidth: layout.bubbleMaxWidth,
    flexShrink: 1,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xxs,
  },
  // No shadows on bubbles: on a dark canvas they read by surface contrast
  // alone, and a drop shadow would look like a light-theme leftover.
  bubbleMine: {
    backgroundColor: colors.bubbleMine,
  },
  bubbleTheirs: {
    backgroundColor: colors.bubbleTheirs,
  },
  bubbleAddressed: {
    borderLeftWidth: 3,
    borderLeftColor: colors.mention,
  },
  sender: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  target: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mention,
    marginBottom: 2,
  },
  targetMine: {
    color: colors.textOnBubbleMine,
    opacity: 0.75,
  },
  mention: {
    fontWeight: '700',
    color: colors.mention,
  },
  mentionMine: {
    color: colors.textOnBubbleMine,
    textDecorationLine: 'underline',
  },
  bubbleFailed: {
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  bubbleSending: {
    opacity: 0.55,
  },
  contentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  text: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  textMine: {
    color: colors.textOnBubbleMine,
  },
  textTheirs: {
    color: colors.text,
  },
  textFailed: {
    color: colors.dangerText,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    marginTop: 2,
  },
  time: {
    fontSize: 11,
  },
  // WhatsApp meta: white-ish time on my blue bubble, dimmed via opacity so the
  // color still comes from a theme token.
  timeMine: {
    color: colors.textOnBubbleMine,
    opacity: 0.6,
  },
  timeTheirs: {
    color: colors.muted,
  },
  timeFailed: {
    color: colors.dangerText,
    opacity: 0.8,
  },
  statusIcon: {
    marginLeft: spacing.xs,
  },
  // Sent tick and sending ring: dimmed meta, matching the timestamp.
  statusIconDimmed: {
    opacity: 0.6,
  },
});

export default ChatMessage;

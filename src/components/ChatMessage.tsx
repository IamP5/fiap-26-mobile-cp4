import { Check, CircleAlert, Clock3, RotateCw } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { fadeIn, popIn, timing } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { avatarColorFor } from './Avatar';
import { useThemeColors } from '@/theme/ThemeContext';
import { maxFontScale } from '@/theme/theme';
import type { DisplayMessage } from '@/types/chat';
import { formatClock } from '@/utils/datetime';

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
  const pattern = new RegExp(
    `(${[...names]
      .sort((a, b) => b.length - a.length)
      .map((n) => `@${escapeRegExp(n)}`)
      .join('|')})`,
    'g',
  );
  return text
    .split(pattern)
    .filter((part: string) => part.length > 0)
    .map((part: string) => ({
      text: part,
      mention: names.some((n: string) => part === `@${n}`),
    }));
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
  const colors = useThemeColors();
  // Only a genuinely new message animates in: an old row re-mounting through
  // list virtualization (scrolling back up the thread) must render settled,
  // or the history flickers with replayed entrances.
  const isFreshRef = useRef<boolean>(message.status === 'sending' || Date.now() - message.createdAt < 1500);
  // 0 → 1 entrance on the UI thread: a short fade with a few points of lift,
  // like Telegram/WhatsApp — the bubble just arrives, it does not perform.
  const enter = useSharedValue<number>(isFreshRef.current ? 0 : 1);

  useEffect(() => {
    if (isFreshRef.current) {
      enter.value = withTiming(1, timing.base);
    }
    // Fired once on mount only — a row that regroups on later renders should
    // not replay the entry animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 6 }],
  }));

  const isFailed: boolean = message.status === 'failed';
  const isSending: boolean = message.status === 'sending';
  const time: string = useMemo(() => formatClock(message.createdAt), [message.createdAt]);
  const segments = useMemo(() => splitMentions(message.text, mentionNames), [message.text, mentionNames]);
  // Group senders get their avatar hue, Telegram-style, so runs from
  // different people are distinguishable at a glance.
  const senderColor: string = useMemo(
    () => avatarColorFor(message.senderId, colors.avatarPalette),
    [message.senderId, colors.avatarPalette],
  );

  const statusSuffix: string = isSending ? ', enviando' : isFailed ? ', falha no envio' : '';
  const targetSuffix: string = targetName !== null ? `, para ${targetName}` : '';
  const composedLabel = `${isMine ? 'Você' : senderName} disse: ${message.text}${targetSuffix}, às ${time}${statusSuffix}`;

  const handleRetry = (): void => {
    if (message.localId !== undefined && onRetry !== undefined) {
      onRetry(message.localId);
    }
  };

  const metaTone: string = isMine ? 'text-bubble-mine-foreground/70' : 'text-muted-foreground';

  // Invisible spacer the width of the timestamp: lets the last text line wrap
  // around the absolutely positioned meta exactly like WhatsApp, instead of
  // always pushing the time onto its own line.
  const metaSpacer: string = isMine ? '        ' : '      ';

  const bubble = (
    <View
      className={cn(
        'rounded-[18px] px-3 pb-1.5 pt-1.5',
        isMine ? 'bg-bubble-mine' : 'bg-bubble-theirs shadow-sm shadow-black/10',
        isMine && isLastInGroup && 'rounded-br-[6px]',
        !isMine && isLastInGroup && 'rounded-bl-[6px]',
        !isMine && addressedToMe && 'border-l-mention border-l-[3px] dark:border-l-mention',
        isFailed && 'bg-destructive/10 border-destructive/40 border',
        isSending && 'opacity-70',
      )}
    >
      {showSender && !isMine && isFirstInGroup ? (
        <Text className="mb-0.5 text-[13px] font-semibold" style={{ color: senderColor }} numberOfLines={1}>
          {senderName}
        </Text>
      ) : null}
      {targetName !== null ? (
        <Text
          className={cn('mb-0.5 text-xs font-medium', isMine ? 'text-bubble-mine-foreground/75' : 'text-mention')}
          numberOfLines={1}
        >
          {isMine ? `Para ${targetName}` : addressedToMe ? 'Para você' : `Para ${targetName}`}
        </Text>
      ) : null}
      <Text
        className={cn(
          'text-[16px] leading-[22px]',
          isMine ? 'text-bubble-mine-foreground' : 'text-bubble-theirs-foreground',
          isFailed && 'text-destructive',
        )}
      >
        {segments.map((segment, index) =>
          segment.mention ? (
            <Text
              key={index}
              className={cn('font-semibold', isMine ? 'text-bubble-mine-foreground underline' : 'text-mention')}
            >
              {segment.text}
            </Text>
          ) : (
            <Text key={index}>{segment.text}</Text>
          ),
        )}
        <Text className="text-[11px]">{metaSpacer}</Text>
      </Text>
      <View className="absolute bottom-1.5 right-2.5 flex-row items-center gap-0.5">
        <Text
          className={cn('text-[11px] tabular-nums', isFailed ? 'text-destructive' : metaTone)}
          maxFontSizeMultiplier={maxFontScale.chrome}
        >
          {time}
        </Text>
        {isMine ? (
          // Keyed by status: sending → sent swaps the glyph with a small pop.
          <Animated.View key={message.status} entering={isSending ? undefined : popIn}>
            <Icon
              as={isSending ? Clock3 : isFailed ? CircleAlert : Check}
              strokeWidth={2.5}
              className={cn('size-3.5', isFailed ? 'text-destructive' : metaTone)}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Animated.View style={[{ marginBottom: isLastInGroup ? 8 : 2 }, enterStyle]}>
      <View className={cn('w-full flex-row px-1', isMine ? 'justify-end' : 'justify-start')}>
        {isFailed ? (
          <Pressable
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Falha ao enviar. Toque para tentar novamente."
            className="max-w-[80%] shrink items-end active:opacity-80"
          >
            {bubble}
            <Animated.View entering={fadeIn} className="mt-1 flex-row items-center gap-1">
              <Icon as={RotateCw} className="text-destructive size-3" />
              <Text className="text-destructive text-xs font-medium">Não enviada · toque para tentar de novo</Text>
            </Animated.View>
          </Pressable>
        ) : (
          // The width cap lives on the wrapper (the row's direct child): a
          // percentage maxWidth on the bubble would resolve against an
          // unconstrained parent and overflow the screen.
          <View className="max-w-[80%] shrink" accessible accessibilityLabel={composedLabel}>
            {bubble}
          </View>
        )}
      </View>
    </Animated.View>
  );
};

export default ChatMessage;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  View,
} from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, interaction, layout, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import type { MessageTarget, OutgoingMessage } from '../types/chat';
import type { PublicProfile } from '../types/user';
import { Icon } from './Icon';
import { MemberPickerModal } from './MemberPickerModal';

export type ChatInputProps = {
  /**
   * Fires the send. A failed send is no longer this component's problem: it
   * survives as a retryable bubble in the thread (see ChatMessage/useChat), so
   * the draft can be cleared the instant the user taps send instead of
   * waiting on a promise to know whether to restore it.
   */
  onSend: (message: OutgoingMessage) => void;
  disabled?: boolean;
  /** Other members of a group chat: enables @mentions and choosing a
   * recipient. Undefined in direct chats. */
  members?: readonly PublicProfile[];
};

export const MAX_LENGTH = 2000;

type PickerMode = 'mention' | 'target' | null;

const COUNTER_THRESHOLD: number = MAX_LENGTH * 0.9;
const BASE_MAX_HEIGHT = 120;

const SEND_DISC_SIZE = 40;
const INPUT_MIN_HEIGHT = 40;
const INPUT_LINE_HEIGHT = 21;
const INPUT_VERTICAL_PADDING: number = (INPUT_MIN_HEIGHT - INPUT_LINE_HEIGHT) / 2;

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled = false, members }: ChatInputProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState<string>('');
  const [mentioned, setMentioned] = useState<PublicProfile[]>([]);
  const [target, setTarget] = useState<PublicProfile | null>(null);
  const [picker, setPicker] = useState<PickerMode>(null);
  const isGroup: boolean = members !== undefined;

  // A member who left the group can no longer be targeted.
  useEffect(() => {
    if (target !== null && members !== undefined && !members.some((m) => m.uid === target.uid)) {
      setTarget(null);
    }
  }, [members, target]);

  const handlePick = useCallback(
    (member: PublicProfile | null): void => {
      if (picker === 'target') {
        setTarget(member);
      } else if (member !== null) {
        setMentioned((prev: PublicProfile[]) => (prev.some((m) => m.uid === member.uid) ? prev : [...prev, member]));
        setDraft((prev: string) => `${prev}${prev.length === 0 || prev.endsWith(' ') ? '' : ' '}@${member.name} `);
      }
      setPicker(null);
    },
    [picker],
  );

  const trimmed: string = useMemo(() => draft.trim(), [draft]);
  const canSend: boolean = trimmed.length > 0 && !disabled;

  // Drives the primary send disc, layered over a muted base disc. Spring with
  // overshoot on the way in (the WhatsApp mic→send pop), quick fade on the way
  // out — the overshoot only reads as intentional in the appearing direction.
  const sendProgress = useRef(new Animated.Value(canSend ? 1 : 0)).current;

  useEffect(() => {
    if (canSend) {
      Animated.spring(sendProgress, {
        toValue: 1,
        ...interaction.spring.pop,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(sendProgress, {
        toValue: 0,
        duration: interaction.duration.press,
        useNativeDriver: true,
      }).start();
    }
  }, [canSend, sendProgress]);

  const handleSend = useCallback((): void => {
    const value: string = draft.trim();
    if (value.length === 0 || disabled) {
      return;
    }
    // Only mentions still present in the text count.
    const mentionedUserIds: string[] = mentioned
      .filter((member: PublicProfile) => value.includes(`@${member.name}`))
      .map((member: PublicProfile) => member.uid);
    const messageTarget: MessageTarget =
      target === null ? { type: 'conversation' } : { type: 'member', memberId: target.uid };
    onSend({ text: value, target: messageTarget, mentionedUserIds });
    setDraft('');
    setMentioned([]);
    // The programmatic clear does not fire onContentSizeChange on web, so the
    // pill must collapse back to one line explicitly.
    setInputHeight(INPUT_MIN_HEIGHT);
  }, [draft, disabled, onSend, mentioned, target]);

  const showCounter: boolean = draft.length > COUNTER_THRESHOLD;
  const atCap: boolean = draft.length >= MAX_LENGTH;
  const maxInputHeight: number = BASE_MAX_HEIGHT * Math.min(PixelRatio.getFontScale(), 2);

  // Auto-grow (WhatsApp composer): a multiline TextInput does not start at one
  // line everywhere (react-native-web renders a 2-row textarea), so the pill's
  // height is driven explicitly from the reported content size — one line tall
  // when empty, growing with the draft up to the cap, scrolling past it.
  const [inputHeight, setInputHeight] = useState<number>(INPUT_MIN_HEIGHT);

  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>): void => {
      const contentHeight: number = event.nativeEvent.contentSize.height;
      // Web reports the padded scrollHeight; native platforms report the bare
      // text height, so the pill's padding is added back there.
      const padded: number =
        Platform.OS === 'web' ? contentHeight : contentHeight + INPUT_VERTICAL_PADDING * 2;
      setInputHeight(Math.min(Math.max(Math.ceil(padded), INPUT_MIN_HEIGHT), maxInputHeight));
    },
    [maxInputHeight],
  );

  // Opacity clamps so the spring's scale overshoot doesn't push it past 1.
  const activeDiscOpacity = sendProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {showCounter ? (
        <View style={styles.counterRow}>
          <Text
            style={[styles.counter, atCap ? styles.counterAtCap : null]}
            maxFontSizeMultiplier={maxFontScale.chrome}
          >
            {draft.length}/{MAX_LENGTH}
          </Text>
        </View>
      ) : null}
      {isGroup ? (
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => setPicker('target')}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Destinatário: ${target === null ? 'todos do grupo' : target.name}. Toque para alterar.`}
            style={({ pressed }: { pressed: boolean }) => [
              styles.chip,
              target !== null ? styles.chipActive : null,
              pressed ? styles.sendSlotPressed : null,
            ]}
          >
            <Text style={[styles.chipText, target !== null ? styles.chipTextActive : null]} numberOfLines={1}>
              Para: {target === null ? 'Todos' : target.name}
            </Text>
            <Icon name="chevron-down" size={10} color={target !== null ? colors.onPrimary : colors.muted} />
          </Pressable>
          {target !== null ? (
            <Pressable onPress={() => setTarget(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Enviar para todos">
              <Icon name="close" size={12} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        {isGroup ? (
          <Pressable
            onPress={() => setPicker('mention')}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Mencionar integrante"
            android_ripple={androidRipple(colors.ripple, true)}
            style={({ pressed }: { pressed: boolean }) => [styles.mentionSlot, pressed ? styles.sendSlotPressed : null]}
          >
            <Text style={styles.mentionGlyph} maxFontSizeMultiplier={maxFontScale.chrome}>
              @
            </Text>
          </Pressable>
        ) : null}
        <TextInput
          style={[styles.input, { height: inputHeight }, disabled ? styles.inputDisabled : null]}
          onContentSizeChange={handleContentSizeChange}
          value={draft}
          onChangeText={setDraft}
          placeholder="Mensagem"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled
          textAlignVertical="top"
          maxLength={MAX_LENGTH}
          editable={!disabled}
          accessibilityLabel="Campo de mensagem"
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
          accessibilityHint={!canSend ? 'Digite uma mensagem para habilitar o envio' : undefined}
          accessibilityState={{ disabled: !canSend }}
          android_ripple={androidRipple(colors.ripple, true)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.sendSlot,
            pressed && canSend ? styles.sendSlotPressed : null,
          ]}
        >
          {/* Empty state: a bare muted glyph (Telegram-style composer icons
              have no disc) — the filled disc exists only when there is
              something to send. */}
          <View style={styles.discBase}>
            <Icon name="send" color={colors.muted} size={22} />
          </View>
          <Animated.View
            style={[
              styles.discActive,
              { opacity: activeDiscOpacity, transform: [{ scale: sendProgress }] },
            ]}
          >
            <Icon name="send" color={colors.onPrimary} size={20} />
          </Animated.View>
        </Pressable>
      </View>
      {isGroup ? (
        <MemberPickerModal
          visible={picker !== null}
          title={picker === 'target' ? 'Enviar mensagem para' : 'Mencionar integrante'}
          members={members ?? []}
          allowEveryone={picker === 'target'}
          selectedUid={picker === 'target' ? (target?.uid ?? null) : undefined}
          onSelect={handlePick}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) => StyleSheet.create({
  // The screen's inputArea wrapper owns the bar's background, hairline and
  // outer padding (so the hairline spans the full width); this container is
  // just the content.
  container: {},
  counterRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xxs,
  },
  counter: {
    fontSize: 12,
    color: colors.muted,
  },
  counterAtCap: {
    color: colors.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 240,
    paddingHorizontal: spacing.sm + spacing.xxs,
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  mentionSlot: {
    width: 36,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionGlyph: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  // WhatsApp-style pill: a borderless rounded fill that reads as a soft well
  // in the bar — a border would make it look like a web form field. The
  // vertical padding is derived from the line height so a single line sits
  // dead-center in the pill.
  input: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.md,
    paddingTop: INPUT_VERTICAL_PADDING,
    paddingBottom: INPUT_VERTICAL_PADDING,
    fontSize: 16,
    lineHeight: INPUT_LINE_HEIGHT,
    color: colors.text,
    marginRight: spacing.sm,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  // The full touch target stays constant; only the visual disc inside it
  // animates, so the input pill never shifts as the button state changes.
  sendSlot: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendSlotPressed: {
    transform: [{ scale: 0.9 }],
  },
  discBase: {
    width: SEND_DISC_SIZE,
    height: SEND_DISC_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discActive: {
    position: 'absolute',
    width: SEND_DISC_SIZE,
    height: SEND_DISC_SIZE,
    borderRadius: SEND_DISC_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatInput;

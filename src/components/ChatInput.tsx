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
import { Icon } from './Icon';

export type ChatInputProps = {
  /**
   * Fires the send. A failed send is no longer this component's problem: it
   * survives as a retryable bubble in the thread (see ChatMessage/useChat), so
   * the draft can be cleared the instant the user taps send instead of
   * waiting on a promise to know whether to restore it.
   */
  onSend: (text: string) => void;
  disabled?: boolean;
};

export const MAX_LENGTH = 1000;

const COUNTER_THRESHOLD: number = MAX_LENGTH * 0.9;
const BASE_MAX_HEIGHT = 120;

const SEND_DISC_SIZE = 40;
const INPUT_MIN_HEIGHT = 40;
const INPUT_LINE_HEIGHT = 21;
const INPUT_VERTICAL_PADDING: number = (INPUT_MIN_HEIGHT - INPUT_LINE_HEIGHT) / 2;

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled = false }: ChatInputProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState<string>('');

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
    onSend(value);
    setDraft('');
    // The programmatic clear does not fire onContentSizeChange on web, so the
    // pill must collapse back to one line explicitly.
    setInputHeight(INPUT_MIN_HEIGHT);
  }, [draft, disabled, onSend]);

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
      <View style={styles.row}>
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

import { ArrowUp, AtSign, ChevronDown, SendHorizontal, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PixelRatio,
  Platform,
  Pressable,
  Text,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputKeyPressEventData,
  View,
} from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { Glass } from '@/components/native/Glass';
import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { fadeOut, layout, popIn, popOut, timing } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple, maxFontScale } from '@/theme/theme';
import type { MessageTarget, OutgoingMessage } from '@/types/chat';
import type { PublicProfile } from '@/types/user';
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

// Telegram iOS composer is a 40pt capsule; WhatsApp Android's field is 48dp.
const INPUT_MIN_HEIGHT: number = isMaterial ? 48 : 40;
const INPUT_LINE_HEIGHT = 21;
const INPUT_VERTICAL_PADDING: number = (INPUT_MIN_HEIGHT - INPUT_LINE_HEIGHT) / 2;

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled = false, members }: ChatInputProps) => {
  const colors = useThemeColors();
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

  // iOS: the accent send disc fades in over the idle glass button once there
  // is something to send (a short, settled transition — no spin, no bounce).
  const sendProgress = useSharedValue<number>(canSend ? 1 : 0);

  useEffect(() => {
    sendProgress.value = withTiming(canSend ? 1 : 0, canSend ? timing.base : timing.fast);
  }, [canSend, sendProgress]);

  const activeDiscStyle = useAnimatedStyle(() => ({
    opacity: sendProgress.value,
    transform: [{ scale: interpolate(sendProgress.value, [0, 1], [0.7, 1]) }],
  }));

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
    haptics.tap();
    onSend({ text: value, target: messageTarget, mentionedUserIds });
    setDraft('');
    setMentioned([]);
    // The programmatic clear does not fire onContentSizeChange on web, so the
    // pill must collapse back to one line explicitly.
    setInputHeight(INPUT_MIN_HEIGHT);
  }, [draft, disabled, onSend, mentioned, target]);

  // WhatsApp Web: Enter sends, Shift+Enter breaks the line. Native keyboards
  // keep the return key as a newline (the send button is right there).
  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>): void => {
      if (Platform.OS !== 'web') {
        return;
      }
      const native = event.nativeEvent as TextInputKeyPressEventData & {
        shiftKey?: boolean;
        isComposing?: boolean;
      };
      if (native.key === 'Enter' && native.shiftKey !== true && native.isComposing !== true) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const showCounter: boolean = draft.length > COUNTER_THRESHOLD;
  const atCap: boolean = draft.length >= MAX_LENGTH;
  const maxInputHeight: number = BASE_MAX_HEIGHT * Math.min(PixelRatio.getFontScale(), 2);

  // Auto-grow (WhatsApp composer). iOS/Android multiline inputs size
  // themselves between minHeight and maxHeight; react-native-web renders a
  // 2-row textarea, so on web the height is driven from the reported content
  // size — one line tall when empty, growing up to the cap, scrolling past it.
  const [inputHeight, setInputHeight] = useState<number>(INPUT_MIN_HEIGHT);

  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>): void => {
      const contentHeight: number = event.nativeEvent.contentSize.height;
      // Web reports the padded scrollHeight.
      const padded: number = contentHeight;
      setInputHeight(Math.min(Math.max(Math.ceil(padded), INPUT_MIN_HEIGHT), maxInputHeight));
    },
    [maxInputHeight],
  );

  const field = (
    <>
      {isGroup ? (
        <Pressable
          onPress={() => setPicker('mention')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Mencionar integrante"
          android_ripple={androidRipple(colors.ripple, true)}
          className="items-center justify-center rounded-full active:opacity-60"
          style={{ width: INPUT_MIN_HEIGHT, height: INPUT_MIN_HEIGHT }}
        >
          <Icon as={AtSign} className="text-muted-foreground size-5" />
        </Pressable>
      ) : null}
      <TextInput
        className={cn('text-foreground flex-1 text-base web:outline-none', isGroup ? 'pl-0 pr-4' : 'px-4')}
        style={{
          // Native multiline inputs grow with their text on their own; web's
          // textarea needs its height driven from the content size.
          ...(Platform.OS === 'web'
            ? { height: inputHeight }
            : { minHeight: INPUT_MIN_HEIGHT, maxHeight: maxInputHeight }),
          paddingTop: INPUT_VERTICAL_PADDING,
          paddingBottom: INPUT_VERTICAL_PADDING,
          lineHeight: INPUT_LINE_HEIGHT,
        }}
        onContentSizeChange={Platform.OS === 'web' ? handleContentSizeChange : undefined}
        value={draft}
        onChangeText={setDraft}
        placeholder="Mensagem"
        placeholderTextColor={colors.mutedForeground}
        multiline
        scrollEnabled
        textAlignVertical="top"
        maxLength={MAX_LENGTH}
        editable={!disabled}
        accessibilityLabel="Campo de mensagem"
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={handleSend}
        onKeyPress={handleKeyPress}
      />
    </>
  );

  return (
    <View className="gap-2">
      {isGroup ? (
        <View className="flex-row items-center gap-2 px-1">
          <PressableScale
            onPress={() => {
              haptics.select();
              setPicker('target');
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Destinatário: ${target === null ? 'todos do grupo' : target.name}. Toque para alterar.`}
            className={cn(
              'h-7 max-w-60 flex-row items-center gap-1.5 rounded-full border px-3',
              target !== null ? 'bg-primary border-primary' : 'border-border/70 bg-card',
            )}
          >
            <Text
              className={cn(
                'text-xs font-medium',
                target !== null ? 'text-primary-foreground' : 'text-muted-foreground',
              )}
              numberOfLines={1}
            >
              Para: {target === null ? 'Todos' : target.name}
            </Text>
            <Icon
              as={ChevronDown}
              className={cn('size-3', target !== null ? 'text-primary-foreground' : 'text-muted-foreground')}
            />
          </PressableScale>
          {target !== null ? (
            <Animated.View entering={popIn} exiting={popOut}>
              <Pressable
                onPress={() => setTarget(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Enviar para todos"
                className="size-6 items-center justify-center rounded-full active:bg-accent"
              >
                <Icon as={X} className="text-muted-foreground size-3.5" />
              </Pressable>
            </Animated.View>
          ) : null}
          {showCounter ? (
            <Animated.View entering={popIn} exiting={fadeOut} layout={layout} className="ml-auto">
              <Text
                className={cn('text-xs tabular-nums', atCap ? 'text-destructive' : 'text-muted-foreground')}
                maxFontSizeMultiplier={maxFontScale.chrome}
              >
                {draft.length}/{MAX_LENGTH}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      ) : showCounter ? (
        <Text
          className={cn('self-end px-1 text-xs tabular-nums', atCap ? 'text-destructive' : 'text-muted-foreground')}
          maxFontSizeMultiplier={maxFontScale.chrome}
        >
          {draft.length}/{MAX_LENGTH}
        </Text>
      ) : null}
      <View className={cn('flex-row items-end', isMaterial ? 'gap-1.5' : 'gap-2')}>
        {isMaterial ? (
          // WhatsApp Android: an elevated pill on the wallpaper.
          <View
            className={cn('bg-card flex-1 flex-row items-end rounded-[24px] shadow-sm', disabled && 'opacity-60')}
            style={{ minHeight: INPUT_MIN_HEIGHT, elevation: 1 }}
          >
            {field}
          </View>
        ) : (
          // Telegram iOS 26: a Liquid Glass capsule.
          <Glass
            radius={INPUT_MIN_HEIGHT / 2}
            className={cn('flex-1 flex-row items-end', disabled && 'opacity-60')}
            style={{ minHeight: INPUT_MIN_HEIGHT }}
          >
            {field}
          </Glass>
        )}
        {isMaterial ? (
          // WhatsApp's round accent button sits next to the pill at all times.
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            accessibilityHint={!canSend ? 'Digite uma mensagem para habilitar o envio' : undefined}
            accessibilityState={{ disabled: !canSend }}
            android_ripple={androidRipple('rgba(255,255,255,0.24)')}
            className="size-12 items-center justify-center overflow-hidden rounded-full"
            style={{ elevation: 2, backgroundColor: colors.primary }}
          >
            <Icon as={SendHorizontal} className="text-primary-foreground size-[22px]" />
          </Pressable>
        ) : (
          <PressableScale
            onPress={handleSend}
            disabled={!canSend}
            activeScale={0.92}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            accessibilityHint={!canSend ? 'Digite uma mensagem para habilitar o envio' : undefined}
            accessibilityState={{ disabled: !canSend }}
            className="size-10 items-center justify-center"
          >
            {/* Idle: a quiet glass circle. Ready: the accent disc fades in
                over it. The touch target never moves. */}
            <Glass radius={20} className="absolute size-10 items-center justify-center">
              <Icon as={ArrowUp} strokeWidth={2.5} className="text-muted-foreground size-5" />
            </Glass>
            <Animated.View style={[{ position: 'absolute' }, activeDiscStyle]}>
              <View className="bg-primary size-10 items-center justify-center rounded-full">
                <Icon as={ArrowUp} strokeWidth={2.5} className="text-primary-foreground size-5" />
              </View>
            </Animated.View>
          </PressableScale>
        )}
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

export default ChatInput;

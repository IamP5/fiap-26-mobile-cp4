import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { ChatInput } from '../components/ChatInput';
import { ChatMessage } from '../components/ChatMessage';
import { DateSeparator } from '../components/DateSeparator';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Icon } from '../components/Icon';
import { Loading } from '../components/Loading';
import { ScrollToLatestButton } from '../components/ScrollToLatestButton';
import { useChat } from '../hooks/useChat';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, spacing, type Theme } from '../theme/theme';
import type { DisplayMessage } from '../types/chat';
import type { ChatUser } from '../types/user';
import { providerLabel } from '../utils/chatRules';
import { buildChatRows, type ChatRow } from '../utils/messageRows';

export type ChatScreenProps = {
  me: ChatUser;
  other: ChatUser;
  onBack: () => void;
};

/** Distance (in the inverted list's own coordinate space) from the newest
 * message past which the scroll-to-latest button appears. */
const SCROLL_BUTTON_THRESHOLD = 240;

export const ChatScreen: React.FC<ChatScreenProps> = ({ me, other, onBack }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { messages, loading, error, otherDeliveredAt, otherReadAt, send, resend, retryInit } =
    useChat(me, other);
  const listRef = useRef<FlatList<ChatRow<DisplayMessage>>>(null);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  const [keyboardVisible, setKeyboardVisible] = useState<boolean>(false);

  // On iOS, KeyboardAvoidingView's "padding" behavior pads the screen by the
  // full keyboard frame height (which itself covers the home-indicator safe
  // area), so the composer must drop its own bottom safe-area padding while
  // the keyboard is up or the two insets stack into a visible gap. On
  // Android, "height" behavior parks the KAV's bottom edge flush with the
  // keyboard's top edge, but react-native-safe-area-context's Android insets
  // exclude the IME type — `insets.bottom` stays at the navigation-bar height
  // the whole time the keyboard is open — so the exact same stacked-inset gap
  // shows up there too unless it is collapsed the same way. iOS only has
  // "will" events; Android only fires "did".
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return (): void => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const rows = useMemo<ChatRow<DisplayMessage>[]>(
    () => buildChatRows(messages, me.uid),
    [messages, me.uid],
  );

  const keyExtractor = useCallback((row: ChatRow<DisplayMessage>): string => row.key, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatRow<DisplayMessage>>): React.ReactElement => {
      if (item.kind === 'day') {
        return <DateSeparator label={item.label} />;
      }
      return (
        <ChatMessage
          message={item.message}
          isMine={item.isMine}
          isFirstInGroup={item.isFirstInGroup}
          isLastInGroup={item.isLastInGroup}
          senderName={other.name}
          otherDeliveredAt={otherDeliveredAt}
          otherReadAt={otherReadAt}
          onRetry={resend}
        />
      );
    },
    [other.name, otherDeliveredAt, otherReadAt, resend],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const offsetY: number = event.nativeEvent.contentOffset.y;
    setShowScrollButton(offsetY > SCROLL_BUTTON_THRESHOLD);
  }, []);

  const scrollToLatest = useCallback((): void => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderBody = (): React.ReactElement => {
    if (loading) {
      return <Loading label="Abrindo conversa..." />;
    }
    if (error !== null) {
      return <ErrorMessage message={error} onRetry={retryInit} />;
    }
    // Rendering EmptyState directly (rather than via ListEmptyComponent)
    // sidesteps the inverted-list mirroring gotcha entirely, and there is no
    // longer a ref-preserving reason to keep the list mounted while empty.
    if (messages.length === 0) {
      return (
        <EmptyState
          variant="messages"
          title="Nenhuma mensagem ainda"
          description={`Envie a primeira mensagem para ${other.name}.`}
        />
      );
    }
    return (
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        inverted
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        accessibilityLiveRegion="polite"
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* On dark, the header separates from the canvas by surface contrast +
          hairline alone — a drop shadow would read as a light-theme artifact. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          android_ripple={androidRipple(colors.ripple, true)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.backButton,
            pressed ? styles.backButtonPressed : null,
          ]}
        >
          <Icon name="chevron-left" color={colors.primary} />
        </Pressable>
        <Avatar name={other.name} uid={other.uid} photoUrl={other.photoUrl} size={layout.avatar.sm} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={2}>
            {other.name}
          </Text>
          <Text style={styles.headerSubtitle}>{providerLabel(other.provider)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {renderBody()}
        {!loading && error === null && messages.length > 0 ? (
          <ScrollToLatestButton visible={showScrollButton} onPress={scrollToLatest} />
        ) : null}
      </View>

      <View
        style={[
          styles.inputArea,
          { paddingBottom: keyboardVisible ? spacing.sm : insets.bottom + spacing.sm },
        ]}
      >
        <ChatInput onSend={send} disabled={loading || error !== null} />
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = ({ colors }: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    // The thread sits on a tinted wash (WhatsApp/Telegram style); header and
    // composer stay on plain surface so they read as chrome above the canvas.
    backgroundColor: colors.chatBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.separator,
  },
  backButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.sm + spacing.xs,
  },
  headerName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 13,
    color: colors.muted,
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.md,
  },
  inputArea: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.separator,
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BellOff, X } from 'lucide-react-native';

import { Avatar } from '../components/Avatar';
import { Backdrop } from '../components/Backdrop';
import { EdgeFade } from '../components/native/EdgeFade';
import { Icon } from '../components/ui/icon';
import { ChatInput } from '../components/ChatInput';
import { ChatMessage } from '../components/ChatMessage';
import { DateSeparator } from '../components/DateSeparator';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScrollToLatestButton } from '../components/ScrollToLatestButton';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useGroup } from '../hooks/useGroups';
import { setActiveConversation } from '../navigation/navigationRef';
import { syncGroupAccess } from '../services/groupService';
import type { DisplayMessage } from '../types/chat';
import type { ScreenProps } from '../types/navigation';
import type { ChatUser, PublicProfile } from '../types/user';
import { otherParticipant } from '../utils/conversationId';
import { availableSlots } from '../utils/groupValidation';
import { dropIn, fadeIn, fadeOut } from '../lib/motion';
import { isCupertino } from '../lib/platform';
import { buildChatRows, type ChatRow } from '../utils/messageRows';

const SCROLL_BUTTON_THRESHOLD = 240;

const ChatContent: React.FC<ScreenProps<'Chat'> & { me: ChatUser }> = ({ navigation, route, me }) => {
  const insets = useSafeAreaInsets();
  const { conversationId, conversationType } = route.params;
  const isGroup: boolean = conversationType === 'group';
  const { byUid } = useDirectory();
  const { group, loading: groupLoading, unavailable: groupUnavailable } = useGroup(isGroup ? conversationId : null);

  const otherUid: string | null = isGroup ? null : otherParticipant(conversationId, me.uid);
  const other: PublicProfile | null = otherUid === null ? null : profileOrFallback(byUid, otherUid);
  const amMember: boolean = !isGroup || (group !== null && group.memberIds.includes(me.uid));

  const { messages, loading, error, accessLost, pushWarning, dismissPushWarning, send, resend, retry } = useChat(
    conversationId,
    conversationType,
    me.uid,
    amMember && !groupUnavailable,
  );

  // A group I am listed in but cannot read means the RTDB membership mirror
  // lags behind Firestore (e.g. I was just added): ask the API to re-sync.
  const resyncedRef = useRef<boolean>(false);
  useEffect(() => {
    if (accessLost && isGroup && amMember && !resyncedRef.current) {
      resyncedRef.current = true;
      syncGroupAccess(conversationId)
        .then(retry)
        .catch(() => undefined);
    }
  }, [accessLost, isGroup, amMember, conversationId, retry]);

  // Suppress in-app banners for the conversation on screen.
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(conversationId);
      return () => setActiveConversation(null);
    }, [conversationId]),
  );

  const [keyboardVisible, setKeyboardVisible] = useState<boolean>(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // iOS: the header floats over the thread (messages scroll under its glass),
  // so the list reserves its measured height as visual top padding.
  const [headerHeight, setHeaderHeight] = useState<number>(insets.top + 56);
  const handleHeaderLayout = useCallback((event: LayoutChangeEvent): void => {
    setHeaderHeight(Math.round(event.nativeEvent.layout.height));
  }, []);
  const overlayTop: number = isCupertino ? headerHeight : 0;

  // The composer floats too (Telegram iOS 26): the thread runs under its
  // glass down to the screen edge, and the list keeps its height clear.
  const [composerHeight, setComposerHeight] = useState<number>(insets.bottom + 56);
  const handleComposerLayout = useCallback((event: LayoutChangeEvent): void => {
    setComposerHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  const listRef = useRef<FlatList<ChatRow<DisplayMessage>>>(null);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);

  const rows = useMemo<ChatRow<DisplayMessage>[]>(() => buildChatRows(messages, me.uid), [messages, me.uid]);

  const otherMembers = useMemo<PublicProfile[] | undefined>(
    () =>
      isGroup && group !== null
        ? group.memberIds.filter((uid: string) => uid !== me.uid).map((uid: string) => profileOrFallback(byUid, uid))
        : undefined,
    [isGroup, group, me.uid, byUid],
  );

  const nameOf = useCallback(
    (uid: string): string => (uid === me.uid ? me.name : profileOrFallback(byUid, uid).name),
    [byUid, me.uid, me.name],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatRow<DisplayMessage>>): React.ReactElement => {
      if (item.kind === 'day') {
        return <DateSeparator label={item.label} />;
      }
      const message: DisplayMessage = item.message;
      const targetId: string | null = message.target.type === 'member' ? message.target.memberId : null;
      return (
        <ChatMessage
          message={message}
          isMine={item.isMine}
          isFirstInGroup={item.isFirstInGroup}
          isLastInGroup={item.isLastInGroup}
          senderName={nameOf(message.senderId)}
          showSender={isGroup}
          mentionNames={message.mentionedUserIds.map(nameOf)}
          targetName={isGroup && targetId !== null ? nameOf(targetId) : null}
          addressedToMe={targetId === me.uid || message.mentionedUserIds.includes(me.uid)}
          onRetry={resend}
        />
      );
    },
    [nameOf, isGroup, me.uid, resend],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    setShowScrollButton(event.nativeEvent.contentOffset.y > SCROLL_BUTTON_THRESHOLD);
  }, []);

  const openDetails = useCallback((): void => {
    if (isGroup) {
      navigation.navigate('GroupInfo', { groupId: conversationId });
    } else if (otherUid !== null) {
      navigation.navigate('Profile', { uid: otherUid });
    }
  }, [isGroup, navigation, conversationId, otherUid]);

  const title: string = isGroup
    ? (group?.name ?? (groupLoading ? 'Carregando...' : 'Grupo'))
    : (other?.name ?? 'Conversa');
  const subtitle: string = isGroup
    ? group !== null
      ? `${group.memberIds.length} integrantes${availableSlots(group.memberLimit, group.memberIds.length) === 0 ? ' · grupo cheio' : ''}`
      : ''
    : 'Toque para ver o perfil';

  const removed: boolean = isGroup && (groupUnavailable || (!groupLoading && group !== null && !amMember));
  const overlayBottom: number = isCupertino && !removed ? composerHeight : 0;

  const renderBody = (): React.ReactElement => {
    const state = renderState();
    return state === null ? (
      renderList()
    ) : (
      <View style={{ flex: 1, paddingTop: overlayTop, paddingBottom: overlayBottom }}>{state}</View>
    );
  };

  const renderState = (): React.ReactElement | null => {
    if (removed) {
      return (
        <EmptyState
          variant="contacts"
          title="Você não faz mais parte deste grupo"
          description="Foi removido pelo proprietário ou o grupo foi excluído. As mensagens não estão mais disponíveis."
        />
      );
    }
    if (loading) {
      return <Loading label="Abrindo conversa..." />;
    }
    if (error !== null) {
      return (
        <View className="p-4">
          <ErrorMessage message={error} onRetry={retry} />
        </View>
      );
    }
    if (messages.length === 0) {
      return (
        <EmptyState
          variant="messages"
          title="Nenhuma mensagem ainda"
          description={
            isGroup
              ? 'Envie a primeira mensagem para o grupo.'
              : `Envie a primeira mensagem para ${other?.name ?? 'esta pessoa'}.`
          }
        />
      );
    }
    return null;
  };

  const renderList = (): React.ReactElement => (
    <Animated.View entering={fadeIn} className="flex-1">
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row: ChatRow<DisplayMessage>) => row.key}
        renderItem={renderItem}
        inverted
        // Inverted: paddingBottom is the visual top (clear of the floating
        // header) and paddingTop the visual bottom (clear of the composer).
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingTop: overlayBottom + 12,
          paddingBottom: overlayTop + 12,
        }}
        // Keep the scroll indicator inside the visible band, too.
        scrollIndicatorInsets={{ top: overlayBottom, bottom: overlayTop }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        showsVerticalScrollIndicator={false}
      />
    </Animated.View>
  );

  const header = (
    <ScreenHeader
      title={title}
      subtitle={subtitle}
      onBack={navigation.goBack}
      onTitlePress={removed ? undefined : openDetails}
      titleAccessibilityLabel={isGroup ? `Ver integrantes de ${title}` : `Ver perfil de ${title}`}
      floating={isCupertino}
      onLayout={isCupertino ? handleHeaderLayout : undefined}
      leading={
        <Avatar
          name={title}
          uid={otherUid ?? conversationId}
          photoUrl={isGroup ? (group?.photoUrl ?? '') : (other?.photoUrl ?? '')}
          variant={isGroup ? 'group' : 'person'}
          size={isCupertino ? 44 : 40}
        />
      }
    />
  );

  const warning =
    pushWarning !== null ? (
      <Animated.View
        entering={dropIn}
        exiting={fadeOut}
        className={
          isCupertino
            ? 'bg-card/95 border-border/70 mx-4 mt-1 flex-row items-center gap-2 rounded-2xl border px-3 py-2'
            : 'bg-warning/10 flex-row items-center gap-2 px-4 py-2'
        }
      >
        <Icon as={BellOff} className="text-warning size-3.5" />
        <Text className="text-foreground flex-1 text-xs">{pushWarning}</Text>
        <Pressable
          onPress={dismissPushWarning}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Fechar aviso"
        >
          <Icon as={X} className="text-muted-foreground size-3.5" />
        </Pressable>
      </Animated.View>
    ) : null;

  const composer: React.ReactElement | null = removed ? null : (
    <View
      className={isCupertino ? 'px-3 pt-2' : 'px-1.5 pt-1.5'}
      style={{ paddingBottom: keyboardVisible ? 8 : insets.bottom + (isCupertino ? 4 : 8) }}
      onLayout={isCupertino ? handleComposerLayout : undefined}
    >
      <ChatInput onSend={send} disabled={loading || error !== null || !amMember} members={otherMembers} />
    </View>
  );

  return (
    <KeyboardAvoidingView className="bg-chat flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* One wallpaper behind everything: the bars are glass (iOS) or the
          composer floats on it directly (WhatsApp Android). */}
      <Backdrop />
      {isCupertino ? null : (
        <>
          {header}
          {warning}
        </>
      )}
      {/* Sized by flex, so it shrinks with the keyboard: the floating
          composer anchors to its bottom edge, not the screen's. */}
      <View className="flex-1">
        {renderBody()}
        {!loading && error === null && !removed && messages.length > 0 ? (
          <ScrollToLatestButton
            visible={showScrollButton}
            bottom={overlayBottom + 12}
            onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          />
        ) : null}
        {composer !== null && isCupertino ? (
          <View className="absolute inset-x-0 bottom-0" pointerEvents="box-none">
            <EdgeFade edge="bottom" height={composerHeight + 20} solid={Math.max(composerHeight - 28, 0)} />
            {composer}
          </View>
        ) : null}
      </View>
      {isCupertino ? null : composer}
      {isCupertino ? (
        <View className="absolute inset-x-0 top-0" pointerEvents="box-none">
          <EdgeFade height={headerHeight + 20} solid={Math.max(headerHeight - 12, 0)} />
          {header}
          {warning}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

export const ChatScreen: React.FC<ScreenProps<'Chat'>> = (props) => {
  const { user } = useAuth();
  // Keyed by conversation: a push tap can retarget this mounted screen, and
  // no per-chat state (composer target, resync flags) may leak across chats.
  return user === null ? null : (
    <ChatContent key={props.route.params.conversationId} {...props} me={user} />
  );
};

export default ChatScreen;

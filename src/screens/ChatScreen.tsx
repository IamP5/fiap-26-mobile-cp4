import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
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
import { useThemedStyles } from '../theme/ThemeContext';
import { layout, spacing, type Theme } from '../theme/theme';
import type { DisplayMessage } from '../types/chat';
import type { ScreenProps } from '../types/navigation';
import type { ChatUser, PublicProfile } from '../types/user';
import { otherParticipant } from '../utils/conversationId';
import { availableSlots } from '../utils/groupValidation';
import { buildChatRows, type ChatRow } from '../utils/messageRows';

const SCROLL_BUTTON_THRESHOLD = 240;

const ChatContent: React.FC<ScreenProps<'Chat'> & { me: ChatUser }> = ({ navigation, route, me }) => {
  const styles = useThemedStyles(createStyles);
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

  const title: string = isGroup ? (group?.name ?? (groupLoading ? 'Carregando...' : 'Grupo')) : (other?.name ?? 'Conversa');
  const subtitle: string = isGroup
    ? group !== null
      ? `${group.memberIds.length} integrantes${availableSlots(group.memberLimit, group.memberIds.length) === 0 ? ' · grupo cheio' : ''} · toque para ver`
      : ''
    : 'Toque para ver o perfil';

  const removed: boolean = isGroup && (groupUnavailable || (!groupLoading && group !== null && !amMember));

  const renderBody = (): React.ReactElement => {
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
        <View style={styles.padded}>
          <ErrorMessage message={error} onRetry={retry} />
        </View>
      );
    }
    if (messages.length === 0) {
      return (
        <EmptyState
          variant="messages"
          title="Nenhuma mensagem ainda"
          description={isGroup ? 'Envie a primeira mensagem para o grupo.' : `Envie a primeira mensagem para ${other?.name ?? 'esta pessoa'}.`}
        />
      );
    }
    return (
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row: ChatRow<DisplayMessage>) => row.key}
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
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        onBack={navigation.goBack}
        onTitlePress={removed ? undefined : openDetails}
        titleAccessibilityLabel={isGroup ? `Ver integrantes de ${title}` : `Ver perfil de ${title}`}
        leading={
          <Avatar
            name={title}
            uid={otherUid ?? conversationId}
            photoUrl={isGroup ? (group?.photoUrl ?? '') : (other?.photoUrl ?? '')}
            variant={isGroup ? 'group' : 'person'}
            size={layout.avatar.sm + 4}
          />
        }
      />
      {pushWarning !== null ? (
        <View style={styles.warning}>
          <Text style={styles.warningText} onPress={dismissPushWarning}>
            {pushWarning} (toque para fechar)
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>
        {renderBody()}
        {!loading && error === null && !removed && messages.length > 0 ? (
          <ScrollToLatestButton
            visible={showScrollButton}
            onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          />
        ) : null}
      </View>
      {removed ? null : (
        <View style={[styles.inputArea, { paddingBottom: keyboardVisible ? spacing.sm : insets.bottom + spacing.sm }]}>
          <ChatInput onSend={send} disabled={loading || error !== null || !amMember} members={otherMembers} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

export const ChatScreen: React.FC<ScreenProps<'Chat'>> = (props) => {
  const { user } = useAuth();
  return user === null ? null : <ChatContent {...props} me={user} />;
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.chatBackground },
    body: { flex: 1 },
    padded: { padding: spacing.md },
    listContent: { paddingHorizontal: spacing.sm + spacing.xs, paddingVertical: spacing.md },
    warning: { backgroundColor: colors.dangerSurface, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    warningText: { fontSize: 12, color: colors.dangerText },
    inputArea: {
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: layout.hairline,
      borderTopColor: colors.separator,
    },
  });

export default ChatScreen;

import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Icon } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { tabBarClearance } from '../components/TabBar';
import { UserItem } from '../components/UserItem';
import { UserItemSkeleton } from '../components/UserItemSkeleton';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, spacing, type Theme } from '../theme/theme';
import type { ConversationPreview } from '../types/chat';
import type { ChatUser } from '../types/user';
import { foldForSearch } from '../utils/chatRules';

export type ConversationsScreenProps = {
  me: ChatUser;
  contacts: readonly ChatUser[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  previews: Record<string, ConversationPreview>;
  onSelect: (user: ChatUser) => void;
  onNewChat: () => void;
};

const SKELETON_ROWS: readonly number[] = [0, 1, 2, 3, 4];

// The separator is inset by the avatar width + its gutter so it visually
// starts under the name, not under the avatar — the same rhythm most
// messaging apps use for a conversation list.
const SEPARATOR_INSET: number = layout.avatar.md + spacing.md + spacing.md;

const Separator: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.separator, { marginLeft: SEPARATOR_INSET }]} />;
};

/**
 * WhatsApp home: ONLY contacts that already have messages appear here.
 * Starting a chat with someone new goes through the "+" button.
 */
export const ConversationsScreen: React.FC<ConversationsScreenProps> = ({
  me,
  contacts,
  loading,
  error,
  reload,
  previews,
  onSelect,
  onNewChat,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>('');

  const conversations: readonly ChatUser[] = useMemo(
    () =>
      contacts
        .filter((contact: ChatUser): boolean => previews[contact.uid]?.lastMessage != null)
        .sort(
          (a: ChatUser, b: ChatUser): number =>
            (previews[b.uid]?.lastMessage?.createdAt ?? 0) -
            (previews[a.uid]?.lastMessage?.createdAt ?? 0),
        ),
    [contacts, previews],
  );

  const filteredConversations: readonly ChatUser[] = useMemo(() => {
    const needle: string = foldForSearch(query.trim());
    if (needle.length === 0) {
      return conversations;
    }
    return conversations.filter((contact: ChatUser): boolean => {
      const nameMatch: boolean = foldForSearch(contact.name).includes(needle);
      const emailMatch: boolean =
        contact.email !== null && foldForSearch(contact.email).includes(needle);
      return nameMatch || emailMatch;
    });
  }, [conversations, query]);

  const containerStyle: StyleProp<ViewStyle> = useMemo(
    () => [styles.container, { paddingTop: insets.top }],
    [styles, insets.top],
  );

  const listContentStyle: StyleProp<ViewStyle> = useMemo(
    () => ({ paddingBottom: tabBarClearance(insets.bottom) }),
    [insets.bottom],
  );

  const keyExtractor = useCallback((user: ChatUser): string => user.uid, []);

  const skeletonKeyExtractor = useCallback((item: number): string => `skeleton-${item}`, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatUser>) => (
      <UserItem
        user={item}
        meUid={me.uid}
        preview={previews[item.uid] ?? null}
        onPress={onSelect}
      />
    ),
    [me.uid, previews, onSelect],
  );

  const renderSkeletonItem = useCallback(() => <UserItemSkeleton />, []);

  const renderBody = (): React.ReactElement => {
    if (loading) {
      return (
        <FlatList
          data={SKELETON_ROWS}
          keyExtractor={skeletonKeyExtractor}
          renderItem={renderSkeletonItem}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator={false}
        />
      );
    }
    if (error !== null) {
      return (
        <View style={styles.centeredBody}>
          <ErrorMessage message={error} onRetry={reload} />
        </View>
      );
    }
    if (conversations.length === 0) {
      return (
        <EmptyState
          variant="generic"
          title="Nenhuma conversa ainda"
          description={'Toque em + no canto superior para começar uma conversa com um contato.'}
        />
      );
    }
    if (filteredConversations.length === 0) {
      return (
        <EmptyState
          variant="generic"
          title="Nenhum resultado"
          description={`Nenhuma conversa corresponde a "${query.trim()}".`}
        />
      );
    }
    return (
      <FlatList
        data={filteredConversations}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  return (
    <View style={containerStyle}>
      <View style={styles.titleBar}>
        <Text style={styles.screenTitle}>Conversas</Text>
        <Pressable
          onPress={onNewChat}
          accessibilityRole="button"
          accessibilityLabel="Nova conversa"
          android_ripple={androidRipple(colors.ripple, true)}
          hitSlop={4}
          style={({ pressed }: { pressed: boolean }) => [
            styles.newChatButton,
            pressed ? styles.newChatButtonPressed : null,
          ]}
        >
          <Icon name="plus" color={colors.onPrimary} size={18} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Pesquisar" />
      </View>

      <View style={styles.body}>{renderBody()}</View>
    </View>
  );
};

const createStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    titleBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    screenTitle: {
      ...typography.largeTitle,
    },
    // WhatsApp's compose affordance: a filled accent circle, unmistakably
    // "start something new" next to the plain-text title.
    newChatButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: colors.primary,
    },
    newChatButtonPressed: {
      opacity: 0.8,
    },
    searchWrap: {
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    body: {
      flex: 1,
    },
    centeredBody: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
    separator: {
      height: layout.hairline,
      backgroundColor: colors.separator,
    },
  });

export default ConversationsScreen;

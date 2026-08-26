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
import { UserItem } from '../components/UserItem';
import { UserItemSkeleton } from '../components/UserItemSkeleton';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, spacing, type Theme } from '../theme/theme';
import type { ChatUser } from '../types/user';
import { foldForSearch } from '../utils/chatRules';

export type NewChatScreenProps = {
  me: ChatUser;
  contacts: readonly ChatUser[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  onBack: () => void;
  onSelect: (user: ChatUser) => void;
};

const SKELETON_ROWS: readonly number[] = [0, 1, 2, 3, 4];

const SEPARATOR_INSET: number = layout.avatar.md + spacing.md + spacing.md;

const Separator: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.separator, { marginLeft: SEPARATOR_INSET }]} />;
};

/**
 * Contact picker behind the "+" button: EVERY compatible contact, sorted
 * alphabetically, whether or not a conversation already exists — picking one
 * simply opens (or resumes) the chat.
 */
export const NewChatScreen: React.FC<NewChatScreenProps> = ({
  me,
  contacts,
  loading,
  error,
  reload,
  onBack,
  onSelect,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>('');

  const filteredContacts: readonly ChatUser[] = useMemo(() => {
    const needle: string = foldForSearch(query.trim());
    const matched: ChatUser[] =
      needle.length === 0
        ? [...contacts]
        : contacts.filter((contact: ChatUser): boolean => {
            const nameMatch: boolean = foldForSearch(contact.name).includes(needle);
            const emailMatch: boolean =
              contact.email !== null && foldForSearch(contact.email).includes(needle);
            return nameMatch || emailMatch;
          });
    return matched.sort((a: ChatUser, b: ChatUser): number => a.name.localeCompare(b.name));
  }, [contacts, query]);

  const containerStyle: StyleProp<ViewStyle> = useMemo(
    () => [styles.container, { paddingTop: insets.top + spacing.sm }],
    [styles, insets.top],
  );

  const listContentStyle: StyleProp<ViewStyle> = useMemo(
    () => ({ paddingBottom: insets.bottom + spacing.md }),
    [insets.bottom],
  );

  const keyExtractor = useCallback((user: ChatUser): string => user.uid, []);

  const skeletonKeyExtractor = useCallback((item: number): string => `skeleton-${item}`, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatUser>) => (
      // No preview here on purpose: this list is a directory, so the second
      // line stays the contact's e-mail even when a conversation exists.
      <UserItem user={item} meUid={me.uid} onPress={onSelect} />
    ),
    [me.uid, onSelect],
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
    if (contacts.length === 0) {
      return (
        <EmptyState
          variant="contacts"
          title="Nenhum contato compatível disponível"
          description={
            'Neste app, contas de e-mail/senha só podem conversar com contas Google ou Apple, ' +
            'e contas Google/Apple só podem conversar com contas de e-mail/senha. ' +
            'Peça para alguém entrar com um tipo de conta diferente do seu.'
          }
        />
      );
    }
    if (filteredContacts.length === 0) {
      return (
        <EmptyState
          variant="generic"
          title="Nenhum resultado"
          description={`Nenhum contato corresponde a "${query.trim()}".`}
        />
      );
    }
    return (
      <FlatList
        data={filteredContacts}
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
      <View style={styles.header}>
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
        <Text style={styles.headerTitle}>Nova conversa</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Pesquisar contato" />
      </View>

      <Text style={styles.sectionTitle}>Contatos disponíveis</Text>

      <View style={styles.body}>{renderBody()}</View>
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
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
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    headerSpacer: {
      width: layout.touchTarget,
    },
    searchWrap: {
      marginHorizontal: spacing.md,
    },
    sectionTitle: {
      paddingHorizontal: spacing.md + spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.muted,
      textTransform: 'uppercase',
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

export default NewChatScreen;

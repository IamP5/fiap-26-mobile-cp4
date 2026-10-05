import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, type ListRenderItemInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationItem } from '../components/ConversationItem';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Icon } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { tabBarClearance } from '../components/TabBar';
import { UserItemSkeleton } from '../components/UserItemSkeleton';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, spacing, type Theme } from '../theme/theme';
import type { ConversationSummary } from '../types/chat';
import { matchesSearch } from '../utils/search';

export type ConversationsScreenProps = {
  meUid: string;
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  onOpen: (conversation: ConversationSummary) => void;
  onNewDirect: () => void;
  onNewGroup: () => void;
};

const SKELETON_ROWS: readonly number[] = [0, 1, 2, 3, 4];
const SEPARATOR_INSET: number = layout.avatar.lg - 4 + spacing.md * 2;

type Filter = 'all' | 'direct' | 'group';
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'direct', label: 'Individuais' },
  { value: 'group', label: 'Grupos' },
];

export const ConversationsScreen: React.FC<ConversationsScreenProps> = ({
  meUid,
  conversations,
  loading,
  error,
  reload,
  onOpen,
  onNewDirect,
  onNewGroup,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { byUid } = useDirectory();
  const [query, setQuery] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo<ConversationSummary[]>(
    () =>
      conversations.filter(
        (row: ConversationSummary) => (filter === 'all' || row.type === filter) && matchesSearch(row.title, query),
      ),
    [conversations, filter, query],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ConversationSummary>) => (
      <ConversationItem
        conversation={item}
        meUid={meUid}
        lastSenderName={
          item.lastMessage === null ? null : profileOrFallback(byUid, item.lastMessage.senderId).name.split(' ')[0] ?? null
        }
        onPress={onOpen}
      />
    ),
    [meUid, byUid, onOpen],
  );

  const separator = useCallback(() => <View style={[styles.separator, { marginLeft: SEPARATOR_INSET }]} />, [styles]);
  const contentStyle = useMemo(() => ({ paddingBottom: tabBarClearance(insets.bottom) }), [insets.bottom]);

  const renderBody = (): React.ReactElement => {
    if (loading) {
      return (
        <FlatList
          data={SKELETON_ROWS}
          keyExtractor={(item: number) => `skeleton-${item}`}
          renderItem={() => <UserItemSkeleton />}
          contentContainerStyle={contentStyle}
        />
      );
    }
    if (error !== null) {
      return (
        <View style={styles.padded}>
          <ErrorMessage message={error} onRetry={reload} />
        </View>
      );
    }
    if (conversations.length === 0) {
      return (
        <EmptyState
          variant="messages"
          title="Nenhuma conversa ainda"
          description="Toque em + para conversar com alguém ou no ícone de pessoas para criar um grupo."
        />
      );
    }
    if (visible.length === 0) {
      return <EmptyState title="Nenhum resultado" description="Nenhuma conversa corresponde à busca." />;
    }
    return (
      <FlatList
        data={visible}
        keyExtractor={(item: ConversationSummary) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={separator}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>Conversas</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onNewGroup}
            accessibilityRole="button"
            accessibilityLabel="Criar grupo"
            android_ripple={androidRipple(colors.ripple, true)}
            style={({ pressed }: { pressed: boolean }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
          >
            <Icon name="group" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={onNewDirect}
            accessibilityRole="button"
            accessibilityLabel="Nova conversa individual"
            android_ripple={androidRipple(colors.ripple, true)}
            style={({ pressed }: { pressed: boolean }) => [styles.primaryAction, pressed ? styles.pressed : null]}
          >
            <Icon name="plus" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </View>
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Pesquisar conversas" />
      </View>
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((option) => {
          const active: boolean = option.value === filter;
          return (
            <Pressable
              key={option.value}
              onPress={() => setFilter(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.filter, active ? styles.filterActive : null]}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.body}>{renderBody()}</View>
    </View>
  );
};

const createStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    titleBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    title: { ...typography.largeTitle },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    primaryAction: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryAction: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primarySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.8 },
    searchWrap: { marginHorizontal: spacing.md, marginTop: spacing.sm },
    filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    filter: {
      paddingHorizontal: spacing.md,
      minHeight: 32,
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: colors.surfaceSunken,
    },
    filterActive: { backgroundColor: colors.primary },
    filterText: { fontSize: 13, fontWeight: '600', color: colors.muted },
    filterTextActive: { color: colors.onPrimary },
    body: { flex: 1 },
    padded: { paddingHorizontal: spacing.md },
    separator: { height: layout.hairline, backgroundColor: colors.separator },
  });

export default ConversationsScreen;

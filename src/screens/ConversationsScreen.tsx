import { LogOut, MessageSquarePlus, SquarePen, UsersRound } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, type ListRenderItemInfo, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationItem, ROW_TEXT_INSET } from '../components/ConversationItem';
import { ListSeparator } from '../components/native/List';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconButton } from '../components/IconButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { SearchBar } from '../components/SearchBar';
import { tabBarClearance, tabBarFabOffset } from '../components/TabBar';
import { Icon } from '../components/ui/icon';
import { UserItemSkeleton } from '../components/UserItemSkeleton';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { haptics } from '../lib/haptics';
import { fadeIn, layout, listItemEnter } from '../lib/motion';
import { isMaterial } from '../lib/platform';
import { cn } from '../lib/utils';
import { useThemeColors } from '../theme/ThemeContext';
import { androidRipple } from '../theme/theme';
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

const RowSeparator: React.FC = () => <ListSeparator inset={ROW_TEXT_INSET} />;

const SKELETON_ROWS: readonly number[] = [0, 1, 2, 3, 4, 5];

type Filter = 'all' | 'unread' | 'direct' | 'group';
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'Não lidas' },
  { value: 'direct', label: 'Individuais' },
  { value: 'group', label: 'Grupos' },
];

const matchesFilter = (row: ConversationSummary, filter: Filter): boolean => {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return row.unreadCount > 0;
    default:
      return row.type === filter;
  }
};

type FilterChipsProps = {
  value: Filter;
  onChange: (filter: Filter) => void;
  unreadCount: number;
};

/**
 * Filter chips (WhatsApp "Todas / Não lidas / Grupos", Telegram folders):
 * filled capsules, the selected one tinted with the accent. The color simply
 * switches — no sliding thumb.
 */
const FilterChips: React.FC<FilterChipsProps> = ({ value, onChange, unreadCount }) => {
  const colors = useThemeColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal ScrollView grows to fill a column on web; pin it to its content.
      style={{ flexGrow: 0 }}
      contentContainerClassName="items-start gap-2 px-4 py-3"
      keyboardShouldPersistTaps="handled"
      accessibilityRole="tablist"
    >
      {FILTERS.map((option) => {
        const active: boolean = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) {
                haptics.select();
                onChange(option.value);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            android_ripple={androidRipple(colors.ripple)}
            className={cn(
              'flex-row items-center gap-1.5 overflow-hidden rounded-full px-3.5',
              isMaterial ? 'h-9' : 'h-8 ios:active:opacity-70 web:active:opacity-70',
              active ? 'bg-primary/15' : 'bg-muted',
            )}
          >
            <Text
              className={cn('text-[14px]', active ? 'text-primary font-semibold' : 'text-muted-foreground font-medium')}
            >
              {option.label}
            </Text>
            {option.value === 'unread' && unreadCount > 0 ? (
              <Text className={cn('text-[13px] tabular-nums', active ? 'text-primary' : 'text-muted-foreground')}>
                {unreadCount}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

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
  const insets = useSafeAreaInsets();
  const { byUid } = useDirectory();
  const { signOut } = useAuth();
  const [query, setQuery] = useState<string>('');

  const confirmSignOut = useCallback((): void => {
    haptics.tap();
    if (Platform.OS === 'web') {
      void signOut();
      return;
    }
    Alert.alert('Sair da conta?', 'Você deixará de receber notificações neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo<ConversationSummary[]>(
    () =>
      conversations.filter((row: ConversationSummary) => matchesFilter(row, filter) && matchesSearch(row.title, query)),
    [conversations, filter, query],
  );

  const showingList: boolean = !loading && error === null && visible.length > 0;
  // Rows cascade in only the first time the list appears; realtime updates,
  // reorders and filter switches must not replay the entrance.
  const staggerRows = useRef<boolean>(true);
  useEffect(() => {
    if (showingList) {
      staggerRows.current = false;
    }
  }, [showingList]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ConversationSummary>) => (
      <Animated.View entering={staggerRows.current ? listItemEnter(index) : undefined}>
        <ConversationItem
          conversation={item}
          meUid={meUid}
          lastSenderName={
            item.lastMessage === null
              ? null
              : (profileOrFallback(byUid, item.lastMessage.senderId).name.split(' ')[0] ?? null)
          }
          onPress={onOpen}
        />
      </Animated.View>
    ),
    [meUid, byUid, onOpen],
  );

  const unreadCount: number = useMemo(
    () => conversations.filter((row: ConversationSummary) => row.unreadCount > 0).length,
    [conversations],
  );
  const contentStyle = useMemo(() => ({ paddingBottom: tabBarClearance(insets.bottom) }), [insets.bottom]);

  const renderBody = (): React.ReactElement => {
    if (loading) {
      return (
        <View style={contentStyle}>
          {SKELETON_ROWS.map((row: number) => (
            <UserItemSkeleton key={`skeleton-${row}`} index={row} />
          ))}
        </View>
      );
    }
    if (error !== null) {
      return (
        <View className="px-4">
          <ErrorMessage message={error} onRetry={reload} />
        </View>
      );
    }
    if (conversations.length === 0) {
      return (
        <EmptyState
          variant="messages"
          title="Nenhuma conversa ainda"
          description="Comece uma conversa com alguém ou crie um grupo para falar com várias pessoas."
          action={<PrimaryButton label="Nova conversa" onPress={onNewDirect} className="px-6" />}
        />
      );
    }
    if (visible.length === 0) {
      return filter === 'unread' && query.length === 0 ? (
        <EmptyState variant="messages" title="Tudo em dia" description="Você não tem mensagens não lidas." />
      ) : (
        <EmptyState title="Nenhum resultado" description="Nenhuma conversa corresponde à busca." />
      );
    }
    return (
      // Keyed by filter: switching filters crossfades the list instead of
      // popping rows in place (search keeps the same list and just reflows).
      <Animated.View key={filter} entering={staggerRows.current ? undefined : fadeIn} className="flex-1">
        <Animated.FlatList
          data={visible}
          keyExtractor={(item: ConversationSummary) => item.id}
          renderItem={renderItem}
          itemLayoutAnimation={layout}
          ItemSeparatorComponent={RowSeparator}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
    );
  };

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
      {isMaterial ? (
        // Material 3 top app bar (WhatsApp): title left, actions right.
        <View className="h-16 flex-row items-center justify-between pl-4 pr-1">
          <Text className="text-foreground text-[22px] font-semibold" accessibilityRole="header">
            Conversas
          </Text>
          <View className="flex-row items-center">
            <IconButton icon={UsersRound} onPress={onNewGroup} accessibilityLabel="Criar grupo" />
            <IconButton icon={LogOut} onPress={confirmSignOut} accessibilityLabel="Sair da conta" />
          </View>
        </View>
      ) : (
        // iOS 26: large title with Liquid Glass actions on the same line.
        <View className="flex-row items-center justify-between pb-1 pl-5 pr-4 pt-2">
          <Text className="text-foreground text-[34px] font-bold tracking-tight" accessibilityRole="header">
            Conversas
          </Text>
          <View className="flex-row items-center gap-2">
            <IconButton icon={UsersRound} variant="glass" onPress={onNewGroup} accessibilityLabel="Criar grupo" />
            <IconButton
              icon={SquarePen}
              variant="glass"
              onPress={onNewDirect}
              accessibilityLabel="Nova conversa individual"
            />
            <IconButton icon={LogOut} variant="glass" onPress={confirmSignOut} accessibilityLabel="Sair da conta" />
          </View>
        </View>
      )}
      <View className="mx-4 mt-1">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Pesquisar" />
      </View>
      <FilterChips value={filter} onChange={setFilter} unreadCount={unreadCount} />
      <View className="flex-1">{renderBody()}</View>
      {isMaterial ? (
        // WhatsApp's "new chat" FAB, above the navigation bar.
        <Pressable
          onPress={onNewDirect}
          accessibilityRole="button"
          accessibilityLabel="Nova conversa individual"
          android_ripple={androidRipple('rgba(255,255,255,0.24)')}
          className="bg-primary absolute right-4 size-14 items-center justify-center overflow-hidden rounded-2xl"
          style={{ bottom: tabBarFabOffset(insets.bottom), elevation: 6 }}
        >
          <Icon as={MessageSquarePlus} className="text-primary-foreground size-6" />
        </Pressable>
      ) : null}
    </View>
  );
};

export default ConversationsScreen;

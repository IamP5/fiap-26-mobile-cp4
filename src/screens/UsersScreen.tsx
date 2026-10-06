import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react-native';
import { type ListRenderItemInfo, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SearchBar } from '../components/SearchBar';
import { UserItem } from '../components/UserItem';
import { UserItemSkeleton } from '../components/UserItemSkeleton';
import { Icon } from '../components/ui/icon';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { sectionTitleClassName } from '../components/native/List';
import { haptics } from '../lib/haptics';
import { cn } from '../lib/utils';
import { fadeIn, fadeOut, layout, listItemEnter, popIn, popOut } from '../lib/motion';
import type { ScreenProps } from '../types/navigation';
import type { PublicProfile } from '../types/user';
import { buildDirectConversationId } from '../utils/conversationId';
import { matchesSearch } from '../utils/search';

/**
 * Directory of registered users. Two modes:
 *  - direct: tapping someone opens (or creates) the 1:1 conversation;
 *  - pickMembers: multi-select for a group, capped by the free slots.
 * The current user is never listed, so nobody can chat with themselves.
 */
export const UsersScreen: React.FC<ScreenProps<'Users'>> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profiles, byUid, loading, error, reload } = useDirectory();
  const params = route.params;
  const meUid: string = user?.uid ?? '';
  const picking: boolean = params.mode === 'pickMembers';
  const lockedIds: string[] = params.mode === 'pickMembers' ? params.lockedIds : [];
  const maxSelectable: number = params.mode === 'pickMembers' ? params.maxSelectable : 0;

  const [query, setQuery] = useState<string>('');
  const [selected, setSelected] = useState<string[]>(params.mode === 'pickMembers' ? params.selectedIds : []);
  const [notice, setNotice] = useState<string | null>(null);

  const others = useMemo<PublicProfile[]>(
    () => profiles.filter((profile: PublicProfile) => profile.uid !== meUid && matchesSearch(profile.name, query)),
    [profiles, meUid, query],
  );
  const anyOthers: boolean = useMemo(
    () => profiles.some((profile: PublicProfile) => profile.uid !== meUid),
    [profiles, meUid],
  );

  const remaining: number = maxSelectable - selected.length;
  const selectedProfiles = useMemo<PublicProfile[]>(
    () => selected.map((uid: string) => profileOrFallback(byUid, uid)),
    [selected, byUid],
  );

  const handlePress = useCallback(
    (profile: PublicProfile): void => {
      if (profile.uid === meUid) {
        return;
      }
      if (!picking) {
        navigation.replace('Chat', {
          conversationId: buildDirectConversationId(meUid, profile.uid),
          conversationType: 'direct',
        });
        return;
      }
      setNotice(null);
      if (selected.includes(profile.uid)) {
        haptics.select();
        setSelected(selected.filter((uid: string) => uid !== profile.uid));
        return;
      }
      if (selected.length >= maxSelectable) {
        haptics.error();
        setNotice(maxSelectable === 0 ? 'O grupo não tem vagas disponíveis.' : 'Limite de integrantes atingido.');
        return;
      }
      haptics.select();
      setSelected([...selected, profile.uid]);
    },
    [meUid, picking, maxSelectable, navigation, selected],
  );

  const handleConfirm = useCallback((): void => {
    if (params.mode !== 'pickMembers') {
      return;
    }
    navigation.popTo('GroupForm', { groupId: params.groupId, pickedMemberIds: selected }, { merge: true });
  }, [navigation, params, selected]);

  const showingList: boolean = !loading && error === null && others.length > 0;
  // Rows cascade in only the first time the directory appears; searching or
  // selecting must not replay the entrance.
  const staggerRows = useRef<boolean>(true);
  useEffect(() => {
    if (showingList) {
      staggerRows.current = false;
    }
  }, [showingList]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PublicProfile>) => {
      const locked: boolean = lockedIds.includes(item.uid);
      return (
        <Animated.View entering={staggerRows.current ? listItemEnter(index) : undefined}>
          <UserItem
            user={item}
            onPress={handlePress}
            selected={picking ? locked || selected.includes(item.uid) : undefined}
            disabled={locked}
            caption={locked ? 'Já está no grupo' : undefined}
          />
        </Animated.View>
      );
    },
    [handlePress, picking, selected, lockedIds],
  );

  const renderBody = (): React.ReactElement => {
    if (loading) {
      return (
        <View className="pt-2">
          {[0, 1, 2, 3, 4].map((row: number) => (
            <UserItemSkeleton key={`s${row}`} index={row} />
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
    if (!anyOthers) {
      return (
        <EmptyState
          variant="contacts"
          title="Nenhum usuário disponível"
          description="Assim que outras pessoas criarem uma conta, elas aparecerão aqui."
        />
      );
    }
    if (others.length === 0) {
      return <EmptyState title="Nenhum resultado" description={`Ninguém encontrado para "${query.trim()}".`} />;
    }
    return (
      <Animated.FlatList
        data={others}
        keyExtractor={(item: PublicProfile) => item.uid}
        renderItem={renderItem}
        itemLayoutAnimation={layout}
        ListHeaderComponent={<Text className={cn(sectionTitleClassName, 'px-4 pb-1.5 pt-3')}>Contatos</Text>}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + (picking ? 96 : 16) }}
      />
    );
  };

  return (
    <View className="bg-background flex-1">
      <ScreenHeader
        title={picking ? 'Selecionar integrantes' : 'Nova conversa'}
        subtitle={
          picking
            ? remaining > 0
              ? `${selected.length} selecionado(s) · ${remaining} ${remaining === 1 ? 'vaga restante' : 'vagas restantes'}`
              : `${selected.length} selecionado(s) · sem vagas restantes`
            : 'Escolha com quem conversar'
        }
        onBack={navigation.goBack}
      />
      <View className="px-4 pb-1 pt-3">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nome" />
      </View>
      {picking && selectedProfiles.length > 0 ? (
        <Animated.View entering={fadeIn} exiting={fadeOut} className="border-border border-b">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-3 px-4 py-3"
          >
            {selectedProfiles.map((profile: PublicProfile) => (
              <Animated.View key={profile.uid} entering={popIn} exiting={popOut} layout={layout}>
                <Pressable
                  onPress={() => handlePress(profile)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${profile.name} da seleção`}
                  className="w-14 items-center gap-1 active:opacity-70"
                >
                  <View>
                    <Avatar name={profile.name} uid={profile.uid} photoUrl={profile.photoUrl} size={48} />
                    <View className="bg-foreground border-background absolute -right-0.5 -top-0.5 size-5 items-center justify-center rounded-full border-2">
                      <Icon as={X} strokeWidth={3} className="text-background size-2.5" />
                    </View>
                  </View>
                  <Text className="text-foreground text-[11px]" numberOfLines={1}>
                    {profile.name.split(' ')[0] ?? profile.name}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
      {notice !== null ? (
        <Animated.Text
          entering={fadeIn}
          exiting={fadeOut}
          className="text-destructive px-5 pt-2 text-[13px]"
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Animated.Text>
      ) : null}
      <View className="flex-1">{renderBody()}</View>
      {picking ? (
        <View
          className="bg-background absolute inset-x-0 bottom-0 px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <PrimaryButton
            label={selected.length === 0 ? 'Concluir' : `Concluir (${selected.length})`}
            onPress={handleConfirm}
          />
        </View>
      ) : null}
    </View>
  );
};

export default UsersScreen;

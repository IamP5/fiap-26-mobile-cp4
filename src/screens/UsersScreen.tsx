import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, type ListRenderItemInfo, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SearchBar } from '../components/SearchBar';
import { UserItem } from '../components/UserItem';
import { UserItemSkeleton } from '../components/UserItemSkeleton';
import { useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useThemedStyles } from '../theme/ThemeContext';
import { layout, spacing, type Theme } from '../theme/theme';
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
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profiles, loading, error, reload } = useDirectory();
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
        setSelected(selected.filter((uid: string) => uid !== profile.uid));
        return;
      }
      if (selected.length >= maxSelectable) {
        setNotice(maxSelectable === 0 ? 'O grupo não tem vagas disponíveis.' : 'Limite de integrantes atingido.');
        return;
      }
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

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PublicProfile>) => {
      const locked: boolean = lockedIds.includes(item.uid);
      return (
        <UserItem
          user={item}
          onPress={handlePress}
          selected={picking ? locked || selected.includes(item.uid) : undefined}
          disabled={locked}
          caption={locked ? 'Já está no grupo' : undefined}
        />
      );
    },
    [handlePress, picking, selected, lockedIds],
  );

  const renderBody = (): React.ReactElement => {
    if (loading) {
      return <FlatList data={[0, 1, 2, 3]} keyExtractor={(i: number) => `s${i}`} renderItem={() => <UserItemSkeleton />} />;
    }
    if (error !== null) {
      return (
        <View style={styles.padded}>
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
      <FlatList
        data={others}
        keyExtractor={(item: PublicProfile) => item.uid}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + (picking ? 96 : spacing.lg) }}
      />
    );
  };

  return (
    <View style={styles.container}>
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
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nome" />
      </View>
      {notice !== null ? <Text style={styles.notice}>{notice}</Text> : null}
      <View style={styles.body}>{renderBody()}</View>
      {picking ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <PrimaryButton
            label={selected.length === 0 ? 'Concluir' : `Concluir (${selected.length})`}
            onPress={handleConfirm}
          />
        </View>
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    searchWrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    notice: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, color: colors.dangerText, fontSize: 13 },
    body: { flex: 1 },
    padded: { paddingHorizontal: spacing.md },
    separator: { height: layout.hairline, marginLeft: layout.avatar.md + spacing.md * 2, backgroundColor: colors.separator },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: layout.hairline,
      borderTopColor: colors.separator,
    },
  });

export default UsersScreen;

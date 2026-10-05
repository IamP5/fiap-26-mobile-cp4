import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { ErrorMessage } from '../components/ErrorMessage';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Loading } from '../components/Loading';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useGroup } from '../hooks/useGroups';
import { policyLabel } from '../services/groupService';
import { useThemedStyles } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';
import type { ScreenProps } from '../types/navigation';
import type { PublicProfile } from '../types/user';
import { slotsLabel } from '../utils/groupValidation';

/** Opened from the group photo in the chat: every member, each leading to
 * their profile. The owner also gets the edit entry point. */
export const GroupInfoScreen: React.FC<ScreenProps<'GroupInfo'>> = ({ navigation, route }) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { byUid } = useDirectory();
  const { group, loading, error, unavailable } = useGroup(route.params.groupId);
  const meUid: string = user?.uid ?? '';

  const members = useMemo<PublicProfile[]>(() => {
    if (group === null) {
      return [];
    }
    // Owner first, then alphabetical.
    return group.memberIds
      .map((uid: string) => profileOrFallback(byUid, uid))
      .sort((a: PublicProfile, b: PublicProfile) =>
        a.uid === group.ownerId ? -1 : b.uid === group.ownerId ? 1 : a.name.localeCompare(b.name, 'pt-BR'),
      );
  }, [group, byUid]);

  const openProfile = useCallback(
    (member: PublicProfile): void => navigation.navigate('Profile', { uid: member.uid }),
    [navigation],
  );

  const body = (): React.ReactElement => {
    if (loading) {
      return <Loading label="Carregando grupo..." />;
    }
    if (error !== null || unavailable || group === null) {
      return (
        <View style={styles.padded}>
          <ErrorMessage message={error ?? 'Este grupo não está mais disponível para você.'} />
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.hero}>
          <Avatar name={group.name} uid={group.id} photoUrl={group.photoUrl} variant="group" size={112} />
          <Text style={styles.name}>{group.name}</Text>
          <Text style={styles.meta}>{slotsLabel(group.memberLimit, group.memberIds.length)}</Text>
          <Text style={styles.meta}>Notificações: {policyLabel(group.notificationPolicy)}</Text>
        </View>
        {group.ownerId === meUid ? (
          <PrimaryButton label="Editar grupo" onPress={() => navigation.navigate('GroupForm', { groupId: group.id })} />
        ) : null}
        <Text style={styles.sectionTitle}>Integrantes</Text>
        <View style={styles.card}>
          {members.map((member: PublicProfile) => (
            <GroupMemberItem
              key={member.uid}
              member={member}
              isOwner={member.uid === group.ownerId}
              isMe={member.uid === meUid}
              onPress={openProfile}
            />
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Dados do grupo" onBack={navigation.goBack} />
      {body()}
    </View>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, gap: spacing.md },
    padded: { padding: spacing.md },
    hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
    name: { marginTop: spacing.sm, fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
    meta: { fontSize: 14, color: colors.muted },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...elevation.card },
  });

export default GroupInfoScreen;

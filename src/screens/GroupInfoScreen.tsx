import React, { useCallback, useMemo } from 'react';
import { Bell, ChevronRight, Pencil, UsersRound } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { ErrorMessage } from '../components/ErrorMessage';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Loading } from '../components/Loading';
import { ListRow, ListSection, ListSeparator, listPageClassName } from '../components/native/List';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon } from '../components/ui/icon';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useGroup } from '../hooks/useGroups';
import { fadeOut, heroEnter, layout } from '../lib/motion';
import { isMaterial } from '../lib/platform';
import { cn } from '../lib/utils';
import { policyLabel } from '../services/groupService';
import type { ScreenProps } from '../types/navigation';
import type { PublicProfile } from '../types/user';
import { slotsLabel } from '../utils/groupValidation';

/** Opened from the group photo in the chat: every member, each leading to
 * their profile. The owner also gets the edit entry point. */
export const GroupInfoScreen: React.FC<ScreenProps<'GroupInfo'>> = ({ navigation, route }) => {
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
        <View className="p-4">
          <ErrorMessage message={error ?? 'Este grupo não está mais disponível para você.'} />
        </View>
      );
    }
    const memberCount: number = group.memberIds.length;
    return (
      <ScrollView
        contentContainerClassName="gap-6 pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={heroEnter} className="items-center px-5">
          <Avatar name={group.name} uid={group.id} photoUrl={group.photoUrl} variant="group" size={104} />
          <Text className="text-foreground mt-3 text-center text-[24px] font-semibold">{group.name}</Text>
          <Text className="text-muted-foreground mt-0.5 text-[15px]">
            Grupo · {memberCount} {memberCount === 1 ? 'integrante' : 'integrantes'}
          </Text>
        </Animated.View>

        <ListSection title="Detalhes">
          <ListRow icon={UsersRound} iconColor="blue" label={slotsLabel(group.memberLimit, memberCount)} />
          <ListSeparator />
          <ListRow icon={Bell} iconColor="red" label="Notificações" value={policyLabel(group.notificationPolicy)} />
          {group.ownerId === meUid ? (
            <>
              <ListSeparator />
              <ListRow
                icon={Pencil}
                iconColor="orange"
                label="Editar grupo"
                onPress={() => navigation.navigate('GroupForm', { groupId: group.id })}
                accessibilityLabel="Editar grupo"
                trailing={isMaterial ? undefined : <Icon as={ChevronRight} className="text-muted-foreground size-5" />}
              />
            </>
          ) : null}
        </ListSection>

        <ListSection title={`${memberCount} de ${group.memberLimit} integrantes`}>
          {members.map((member: PublicProfile, index: number) => (
            <Animated.View key={member.uid} exiting={fadeOut} layout={layout}>
              {index > 0 ? <ListSeparator inset={74} /> : null}
              <GroupMemberItem
                member={member}
                isOwner={member.uid === group.ownerId}
                isMe={member.uid === meUid}
                onPress={openProfile}
              />
            </Animated.View>
          ))}
        </ListSection>
      </ScrollView>
    );
  };

  return (
    <View className={cn('flex-1', listPageClassName)}>
      <ScreenHeader title="Dados do grupo" onBack={navigation.goBack} />
      {body()}
    </View>
  );
};

export default GroupInfoScreen;

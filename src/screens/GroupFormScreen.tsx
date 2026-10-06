import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react-native';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { ErrorMessage } from '../components/ErrorMessage';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Loading } from '../components/Loading';
import { PressableScale } from '../components/motion/PressableScale';
import { PhotoPicker } from '../components/PhotoPicker';
import { PrimaryButton } from '../components/PrimaryButton';
import { ListIcon, groupedCardClassName, listPageClassName, sectionTitleClassName } from '../components/native/List';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { Icon } from '../components/ui/icon';
import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { useAuth } from '../hooks/useAuth';
import { useGroup } from '../hooks/useGroups';
import {
  addMembers,
  createGroup,
  deleteGroup,
  POLICY_OPTIONS,
  removeMember,
  updateGroup,
  uploadGroupPhoto,
} from '../services/groupService';
import { haptics } from '../lib/haptics';
import { dropIn, fadeOut, layout, listItemEnter, popIn, popOut, sectionEnter } from '../lib/motion';
import { cn } from '../lib/utils';
import { useThemeColors } from '../theme/ThemeContext';
import { androidRipple } from '../theme/theme';
import type { ChatGroup, UpdateGroupInput } from '../types/group';
import { MAX_MEMBER_LIMIT } from '../types/group';
import type { ScreenProps } from '../types/navigation';
import type { NotificationPolicy } from '../types/notification';
import type { ChatUser, PickedImage, PublicProfile } from '../types/user';
import { isApiError, translateFirebaseError } from '../utils/errors';
import {
  availableSlots,
  parseMemberLimit,
  slotsLabel,
  validateGroupName,
  validateMemberCount,
  validateMemberLimit,
} from '../utils/groupValidation';

const DEFAULT_LIMIT = '10';

const confirm = (title: string, message: string, action: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });

/**
 * Creates a group, or (owner only) edits one: name, photo, member limit,
 * notification policy and members. Every change is validated here for
 * instant feedback and again by the API, which is the real guard.
 */
export const GroupFormScreen: React.FC<ScreenProps<'GroupForm'>> = (props) => {
  const { user } = useAuth();
  if (user === null) {
    return null;
  }
  return <GroupForm {...props} me={user} />;
};

const GroupForm: React.FC<ScreenProps<'GroupForm'> & { me: ChatUser }> = ({ navigation, route, me }) => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { byUid } = useDirectory();
  const groupId: string | null = route.params?.groupId ?? null;
  const pickedMemberIds: string[] | undefined = route.params?.pickedMemberIds;
  const editing: boolean = groupId !== null;
  const { group, loading: groupLoading, error: groupError, unavailable } = useGroup(groupId);

  const [name, setName] = useState<string>('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [limitText, setLimitText] = useState<string>(DEFAULT_LIMIT);
  const [policy, setPolicy] = useState<NotificationPolicy>('all_group_messages');
  const [hydrated, setHydrated] = useState<boolean>(!editing);
  const [saving, setSaving] = useState<boolean>(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Prefill once from the live document; later snapshots refresh the member
  // list (shown straight from `group`) without clobbering unsaved edits.
  useEffect(() => {
    if (editing && group !== null && !hydrated) {
      setName(group.name);
      setLimitText(String(group.memberLimit));
      setPolicy(group.notificationPolicy);
      setHydrated(true);
    }
  }, [editing, group, hydrated]);

  const currentMembers: string[] = editing ? (group?.memberIds ?? []) : [me.uid, ...memberIds];
  const memberCount: number = currentMembers.length;
  const limit: number | null = parseMemberLimit(limitText);
  const limitError: string | null = validateMemberLimit(limit, memberCount);
  const isOwner: boolean = !editing || group?.ownerId === me.uid;

  const handleError = useCallback((caught: unknown): void => {
    setSuccess(null);
    setError(
      isApiError(caught, 'GROUP_FULL')
        ? `${caught.message} Aumente o limite ou remova integrantes.`
        : translateFirebaseError(caught),
    );
  }, []);

  // Members picked in the Users screen come back through route params.
  useEffect(() => {
    if (pickedMemberIds === undefined) {
      return;
    }
    navigation.setParams({ pickedMemberIds: undefined });
    if (!editing) {
      setMemberIds(pickedMemberIds.filter((uid: string) => uid !== me.uid));
      return;
    }
    if (group === null || pickedMemberIds.length === 0) {
      return;
    }
    setError(null);
    setSaving(true);
    addMembers(group, pickedMemberIds)
      .then(() => setSuccess('Integrantes adicionados.'))
      .catch(handleError)
      .finally(() => setSaving(false));
  }, [pickedMemberIds, editing, group, me.uid, navigation, handleError]);

  const openPicker = useCallback((): void => {
    setError(null);
    if (editing) {
      if (group === null) {
        return;
      }
      const free: number = availableSlots(group.memberLimit, group.memberIds.length);
      if (free === 0) {
        setError('O grupo está cheio. Aumente o limite para adicionar mais pessoas.');
        return;
      }
      navigation.navigate('Users', {
        mode: 'pickMembers',
        groupId: group.id,
        selectedIds: [],
        lockedIds: group.memberIds.filter((uid: string) => uid !== me.uid),
        maxSelectable: free,
      });
      return;
    }
    const effectiveLimit: number = limit !== null && limit >= 2 ? Math.min(limit, MAX_MEMBER_LIMIT) : MAX_MEMBER_LIMIT;
    navigation.navigate('Users', {
      mode: 'pickMembers',
      selectedIds: memberIds,
      lockedIds: [],
      maxSelectable: effectiveLimit - 1,
    });
  }, [editing, group, limit, memberIds, me.uid, navigation]);

  const handleRemove = useCallback(
    (member: PublicProfile): void => {
      if (!editing) {
        setMemberIds((prev: string[]) => prev.filter((uid: string) => uid !== member.uid));
        return;
      }
      if (group === null) {
        return;
      }
      void confirm('Remover integrante', `Remover ${member.name} do grupo?`, 'Remover').then((ok: boolean) => {
        if (!ok) {
          return;
        }
        setError(null);
        setBusyMember(member.uid);
        removeMember(group, member.uid)
          .then(() => setSuccess(`${member.name} foi removido do grupo.`))
          .catch(handleError)
          .finally(() => setBusyMember(null));
      });
    },
    [editing, group, handleError],
  );

  const handleSubmit = useCallback((): void => {
    setError(null);
    setSuccess(null);
    const problem: string | null =
      validateGroupName(name) ?? validateMemberCount(memberCount) ?? validateMemberLimit(limit, memberCount);
    if (problem !== null || limit === null) {
      setError(problem ?? 'Limite inválido.');
      return;
    }
    setSaving(true);
    const run = async (): Promise<void> => {
      const photoUrl: string | null = photo === null ? null : await uploadGroupPhoto(me.uid, photo);
      if (!editing) {
        const created: ChatGroup = await createGroup({
          name,
          photoUrl: photoUrl ?? '',
          memberIds,
          memberLimit: limit,
          notificationPolicy: policy,
        });
        navigation.replace('Chat', { conversationId: created.id, conversationType: 'group' });
        return;
      }
      if (group === null) {
        return;
      }
      const changes: UpdateGroupInput = {};
      if (name.trim() !== group.name) {
        changes.name = name.trim();
      }
      if (limit !== group.memberLimit) {
        changes.memberLimit = limit;
      }
      if (policy !== group.notificationPolicy) {
        changes.notificationPolicy = policy;
      }
      if (photoUrl !== null) {
        changes.photoUrl = photoUrl;
      }
      if (Object.keys(changes).length > 0) {
        await updateGroup(group, changes);
      }
      setPhoto(null);
      setSuccess('Alterações salvas.');
    };
    run()
      .catch(handleError)
      .finally(() => setSaving(false));
  }, [name, memberCount, limit, photo, me.uid, editing, memberIds, policy, navigation, group, handleError]);

  const handleDelete = useCallback((): void => {
    if (group === null) {
      return;
    }
    void confirm(
      'Excluir grupo',
      'O grupo e todas as mensagens serão apagados para todos os integrantes.',
      'Excluir',
    ).then((ok: boolean) => {
      if (!ok) {
        return;
      }
      setSaving(true);
      deleteGroup(group.id)
        .then(() => navigation.popToTop())
        .catch((caught: unknown) => {
          handleError(caught);
          setSaving(false);
        });
    });
  }, [group, navigation, handleError]);

  const memberProfiles = useMemo<PublicProfile[]>(
    () =>
      currentMembers.map((uid: string) =>
        uid === me.uid ? { uid, name: me.name, photoUrl: me.photoUrl } : profileOrFallback(byUid, uid),
      ),
    [currentMembers, byUid, me],
  );
  const selectedProfiles = useMemo<PublicProfile[]>(
    () => memberProfiles.filter((member: PublicProfile) => member.uid !== me.uid),
    [memberProfiles, me.uid],
  );

  if (editing && (groupLoading || (!hydrated && group !== null))) {
    return (
      <View className={cn('flex-1', listPageClassName)}>
        <ScreenHeader title="Editar grupo" onBack={navigation.goBack} />
        <Loading label="Carregando grupo..." />
      </View>
    );
  }
  if (editing && (unavailable || group === null || !isOwner)) {
    return (
      <View className={cn('flex-1', listPageClassName)}>
        <ScreenHeader title="Editar grupo" onBack={navigation.goBack} />
        <View className="p-4">
          <ErrorMessage
            message={
              groupError ??
              (unavailable || group === null
                ? 'Este grupo não está mais disponível para você.'
                : 'Somente o proprietário pode editar o grupo.')
            }
          />
        </View>
      </View>
    );
  }

  const ownerUid: string = editing && group !== null ? group.ownerId : me.uid;
  const slotsText: string =
    limit !== null && limitError === null ? slotsLabel(limit, memberCount) : `${memberCount} integrante(s)`;
  const full: boolean = limit !== null && availableSlots(limit, memberCount) === 0;

  return (
    <View className={cn('flex-1', listPageClassName)}>
      <ScreenHeader title={editing ? 'Editar grupo' : 'Novo grupo'} onBack={navigation.goBack} />
      <ScrollView
        contentContainerClassName="gap-6 px-4 pb-6 pt-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={sectionEnter(0)} className="items-center">
          <PhotoPicker
            name={name}
            uid={groupId ?? 'novo-grupo'}
            photoUri={photo?.uri ?? group?.photoUrl ?? ''}
            variant="group"
            onPicked={setPhoto}
            onError={setError}
            disabled={saving}
            label={
              photo === null && (group?.photoUrl ?? '') === '' ? 'Adicionar foto do grupo' : 'Alterar foto do grupo'
            }
          />
        </Animated.View>

        <Animated.View entering={sectionEnter(1)} layout={layout} className="gap-4">
          <TextField
            label="Nome do grupo"
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Turma FIAP"
            autoCapitalize="sentences"
            editable={!saving}
          />
          <View className="gap-2">
            <TextField
              label={`Limite de integrantes (2 a ${MAX_MEMBER_LIMIT}, contando você)`}
              value={limitText}
              onChangeText={setLimitText}
              keyboardType="number-pad"
              editable={!saving}
              error={limitError ?? undefined}
            />
            <Animated.View
              layout={layout}
              className={cn(
                'self-start rounded-full border px-2.5 py-1',
                full ? 'border-destructive/20 bg-destructive/10' : 'border-primary/20 bg-primary/10',
              )}
            >
              <Text className={cn('text-[13px] font-medium tabular-nums', full ? 'text-destructive' : 'text-primary')}>
                {slotsText}
              </Text>
            </Animated.View>
          </View>
        </Animated.View>

        <Animated.View entering={sectionEnter(2)} layout={layout} className="gap-2">
          <Text className={sectionTitleClassName}>Notificações push</Text>
          <View className={groupedCardClassName} accessibilityRole="radiogroup">
            {POLICY_OPTIONS.map((option, index: number) => {
              const active: boolean = policy === option.value;
              return (
                <React.Fragment key={option.value}>
                  {index > 0 ? <View className="bg-border ml-12 h-px" /> : null}
                  <Pressable
                    onPress={() => {
                      if (!active) {
                        haptics.select();
                        setPolicy(option.value);
                      }
                    }}
                    disabled={saving}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${option.label}. ${option.description}`}
                    android_ripple={androidRipple(colors.ripple)}
                    className="ios:active:bg-accent web:active:bg-accent flex-row items-start gap-3 px-4 py-3.5"
                  >
                    <View
                      className={cn(
                        'mt-0.5 size-5 items-center justify-center rounded-full border-2',
                        active ? 'border-primary' : 'border-input',
                      )}
                    >
                      {active ? (
                        <Animated.View entering={popIn} exiting={popOut} className="bg-primary size-2.5 rounded-full" />
                      ) : null}
                    </View>
                    <View className="flex-1 gap-0.5">
                      <Text className="text-foreground text-[15px] font-medium">{option.label}</Text>
                      <Text className="text-muted-foreground text-[13px] leading-[18px]">{option.description}</Text>
                    </View>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={sectionEnter(3)} layout={layout} className="gap-2">
          <View className="flex-row items-center justify-between pr-1">
            <Text className={sectionTitleClassName}>Integrantes ({memberCount})</Text>
            <PressableScale
              activeScale={0.94}
              onPress={() => {
                haptics.tap();
                openPicker();
              }}
              disabled={saving || full}
              accessibilityRole="button"
              accessibilityLabel="Adicionar integrantes"
              hitSlop={6}
              className={cn(
                'border-primary/20 bg-primary/10 h-8 flex-row items-center gap-1 rounded-full border px-3 active:bg-primary/15',
                (saving || full) && 'opacity-50',
              )}
            >
              <Icon as={Plus} strokeWidth={2.5} className="text-primary size-3.5" />
              <Text className="text-primary text-[13px] font-semibold">{full ? 'Grupo cheio' : 'Adicionar'}</Text>
            </PressableScale>
          </View>
          {!editing && selectedProfiles.length > 0 ? (
            <Animated.View entering={dropIn} exiting={fadeOut} layout={layout}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="gap-2 px-1 py-1"
              >
                {selectedProfiles.map((member: PublicProfile) => (
                  <Animated.View key={member.uid} entering={popIn} exiting={popOut} layout={layout}>
                    <PressableScale
                      activeScale={0.94}
                      onPress={() => {
                        haptics.select();
                        handleRemove(member);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover ${member.name} do grupo`}
                      className="bg-card border-border active:bg-accent h-8 flex-row items-center gap-1.5 rounded-full border pl-1 pr-2"
                    >
                      <Avatar name={member.name} uid={member.uid} photoUrl={member.photoUrl} size={24} />
                      <Text className="text-foreground max-w-[120px] text-[13px] font-medium" numberOfLines={1}>
                        {member.name.split(' ')[0]}
                      </Text>
                      <Icon as={X} className="text-muted-foreground size-3.5" />
                    </PressableScale>
                  </Animated.View>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}
          <Animated.View layout={layout} className={groupedCardClassName}>
            {memberProfiles.map((member: PublicProfile, index: number) => (
              <Animated.View key={member.uid} entering={listItemEnter(index)} exiting={fadeOut} layout={layout}>
                {index > 0 ? <View className="bg-border ml-[72px] h-px" /> : null}
                <GroupMemberItem
                  member={member}
                  isOwner={member.uid === ownerUid}
                  isMe={member.uid === me.uid}
                  onPress={(profile: PublicProfile) => {
                    if (editing) {
                      navigation.navigate('Profile', { uid: profile.uid });
                    }
                  }}
                  onRemove={member.uid === ownerUid ? undefined : handleRemove}
                  removing={busyMember === member.uid}
                />
              </Animated.View>
            ))}
            {memberCount < 2 ? (
              <Animated.View entering={dropIn} exiting={fadeOut} layout={layout}>
                <View className="bg-border h-px" />
                <Text className="text-muted-foreground px-4 py-3.5 text-[13px]">
                  Adicione pelo menos uma pessoa para criar o grupo.
                </Text>
              </Animated.View>
            ) : null}
          </Animated.View>
        </Animated.View>

        {editing ? (
          <Animated.View entering={sectionEnter(4)} layout={layout} className={groupedCardClassName}>
            <PressableScale
              activeScale={0.985}
              onPress={() => {
                haptics.tap();
                handleDelete();
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Excluir grupo"
              accessibilityState={{ disabled: saving }}
              android_ripple={androidRipple(colors.ripple)}
              className={cn(
                'ios:active:bg-accent web:active:bg-accent min-h-[52px] flex-row items-center gap-3 px-4 py-3',
                saving && 'opacity-50',
              )}
            >
              <ListIcon icon={Trash2} destructive />
              <Text className="text-destructive flex-1 text-[17px]">Excluir grupo</Text>
            </PressableScale>
          </Animated.View>
        ) : null}
      </ScrollView>

      <Animated.View layout={layout} className="gap-3 px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {error !== null ? (
          <Animated.View entering={dropIn} exiting={fadeOut} layout={layout}>
            <ErrorMessage message={error} onDismiss={() => setError(null)} />
          </Animated.View>
        ) : null}
        {success !== null ? (
          <Animated.View entering={dropIn} exiting={fadeOut} layout={layout}>
            <Text className="text-success text-center text-sm" accessibilityLiveRegion="polite">
              {success}
            </Text>
          </Animated.View>
        ) : null}
        <PrimaryButton
          label={editing ? 'Salvar alterações' : 'Criar grupo'}
          onPress={handleSubmit}
          loading={saving}
          disabled={saving}
        />
      </Animated.View>
    </View>
  );
};

export default GroupFormScreen;

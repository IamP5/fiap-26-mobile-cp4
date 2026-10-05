import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorMessage } from '../components/ErrorMessage';
import { GroupMemberItem } from '../components/GroupMemberItem';
import { Icon } from '../components/Icon';
import { Loading } from '../components/Loading';
import { PhotoPicker } from '../components/PhotoPicker';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
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
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
    void confirm('Excluir grupo', 'O grupo e todas as mensagens serão apagados para todos os integrantes.', 'Excluir').then(
      (ok: boolean) => {
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
      },
    );
  }, [group, navigation, handleError]);

  const memberProfiles = useMemo<PublicProfile[]>(
    () => currentMembers.map((uid: string) => (uid === me.uid ? { uid, name: me.name, photoUrl: me.photoUrl } : profileOrFallback(byUid, uid))),
    [currentMembers, byUid, me],
  );

  if (editing && (groupLoading || (!hydrated && group !== null))) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Editar grupo" onBack={navigation.goBack} />
        <Loading label="Carregando grupo..." />
      </View>
    );
  }
  if (editing && (unavailable || group === null || !isOwner)) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Editar grupo" onBack={navigation.goBack} />
        <View style={styles.padded}>
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
  const slotsText: string = limit !== null && limitError === null ? slotsLabel(limit, memberCount) : `${memberCount} integrante(s)`;
  const full: boolean = limit !== null && availableSlots(limit, memberCount) === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title={editing ? 'Editar grupo' : 'Novo grupo'} onBack={navigation.goBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <PhotoPicker
          name={name}
          uid={groupId ?? 'novo-grupo'}
          photoUri={photo?.uri ?? group?.photoUrl ?? ''}
          variant="group"
          onPicked={setPhoto}
          onError={setError}
          disabled={saving}
          label={photo === null && (group?.photoUrl ?? '') === '' ? 'Adicionar foto do grupo' : 'Alterar foto do grupo'}
        />

        <TextField label="Nome do grupo" value={name} onChangeText={setName} placeholder="Ex.: Turma FIAP" autoCapitalize="sentences" editable={!saving} />

        <TextField
          label={`Limite de integrantes (2 a ${MAX_MEMBER_LIMIT}, contando você)`}
          value={limitText}
          onChangeText={setLimitText}
          keyboardType="number-pad"
          editable={!saving}
          error={limitError ?? undefined}
        />
        <View style={[styles.slots, full ? styles.slotsFull : null]}>
          <Text style={[styles.slotsText, full ? styles.slotsTextFull : null]}>{slotsText}</Text>
        </View>

        <Text style={styles.sectionTitle}>Notificações push</Text>
        <View style={styles.card} accessibilityRole="radiogroup">
          {POLICY_OPTIONS.map((option) => {
            const active: boolean = policy === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPolicy(option.value)}
                disabled={saving}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.label}. ${option.description}`}
                style={({ pressed }: { pressed: boolean }) => [styles.option, pressed ? styles.pressed : null]}
              >
                <View style={[styles.radio, active ? styles.radioOn : null]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.membersHeader}>
          <Text style={styles.sectionTitle}>Integrantes ({memberCount})</Text>
          <Pressable
            onPress={openPicker}
            disabled={saving || full}
            accessibilityRole="button"
            accessibilityLabel="Adicionar integrantes"
            style={({ pressed }: { pressed: boolean }) => [styles.addButton, (saving || full) ? styles.disabled : null, pressed ? styles.pressed : null]}
          >
            <Icon name="plus" size={12} color={colors.primary} />
            <Text style={styles.addText}>{full ? 'Grupo cheio' : 'Adicionar'}</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          {memberProfiles.map((member: PublicProfile) => (
            <GroupMemberItem
              key={member.uid}
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
          ))}
          {memberCount < 2 ? <Text style={styles.hint}>Adicione pelo menos uma pessoa para criar o grupo.</Text> : null}
        </View>

        {error !== null ? <ErrorMessage message={error} onDismiss={() => setError(null)} /> : null}
        {success !== null ? <Text style={styles.success}>{success}</Text> : null}

        <PrimaryButton label={editing ? 'Salvar alterações' : 'Criar grupo'} onPress={handleSubmit} loading={saving} disabled={saving} />
        {editing ? <PrimaryButton label="Excluir grupo" variant="danger" onPress={handleDelete} disabled={saving} /> : null}
      </ScrollView>
    </View>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, gap: spacing.md },
    padded: { padding: spacing.md },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...elevation.card },
    slots: { marginTop: -spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.sm + spacing.xxs, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primarySurface },
    slotsFull: { backgroundColor: colors.dangerSurface },
    slotsText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    slotsTextFull: { color: colors.dangerText },
    option: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.5 },
    radio: { marginTop: 2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    optionText: { flex: 1 },
    optionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    optionDescription: { marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.muted },
    membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm + spacing.xxs, minHeight: 32, borderRadius: radius.pill, backgroundColor: colors.primarySurface },
    addText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    hint: { padding: spacing.md, fontSize: 13, color: colors.muted },
    success: { fontSize: 14, color: colors.success, textAlign: 'center' },
  });

export default GroupFormScreen;

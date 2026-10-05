import { collection, doc, onSnapshot, query, where, type QueryDocumentSnapshot } from 'firebase/firestore';

import type { ChatGroup, CreateGroupInput, UpdateGroupInput } from '../types/group';
import type { NotificationPolicy } from '../types/notification';
import type { PickedImage } from '../types/user';
import { createAppError } from '../utils/errors';
import {
  availableSlots,
  validateGroupName,
  validateMemberCount,
  validateMemberLimit,
} from '../utils/groupValidation';
import { apiRequest } from './apiClient';
import { firestore } from './firebase';
import { uploadPhoto } from './photoService';

/**
 * Groups are READ from Firestore with live listeners (the rules allow only
 * active members) and WRITTEN through the team's API, which validates owner
 * and capacity inside a Firestore transaction and keeps the Realtime Database
 * membership mirror in sync. Validation here only gives instant feedback.
 */

const POLICIES: readonly NotificationPolicy[] = [
  'all_group_messages',
  'mentioned_members',
  'direct_messages_only',
  'disabled',
];

const isPolicy = (value: unknown): value is NotificationPolicy =>
  typeof value === 'string' && POLICIES.some((policy: NotificationPolicy) => policy === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseGroup = (id: string, value: unknown): ChatGroup | null => {
  if (!isRecord(value)) {
    return null;
  }
  const { name, photoUrl, ownerId, memberIds, memberLimit, notificationPolicy, createdAt, updatedAt } = value;
  if (
    typeof name !== 'string' ||
    typeof ownerId !== 'string' ||
    !Array.isArray(memberIds) ||
    typeof memberLimit !== 'number' ||
    !isPolicy(notificationPolicy) ||
    typeof createdAt !== 'number'
  ) {
    return null;
  }
  return {
    id,
    name,
    photoUrl: typeof photoUrl === 'string' && photoUrl.startsWith('https://') ? photoUrl : '',
    ownerId,
    memberIds: memberIds.filter((uid: unknown): uid is string => typeof uid === 'string'),
    memberLimit,
    notificationPolicy,
    notificationPolicyUpdatedBy:
      typeof value.notificationPolicyUpdatedBy === 'string' ? value.notificationPolicyUpdatedBy : ownerId,
    notificationPolicyUpdatedAt:
      typeof value.notificationPolicyUpdatedAt === 'number' ? value.notificationPolicyUpdatedAt : createdAt,
    createdAt,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : createdAt,
  };
};

export const subscribeToMyGroups = (
  meUid: string,
  onChange: (groups: ChatGroup[]) => void,
  onError: (error: unknown) => void,
): (() => void) =>
  onSnapshot(
    query(collection(firestore, 'groups'), where('memberIds', 'array-contains', meUid)),
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((entry: QueryDocumentSnapshot) => parseGroup(entry.id, entry.data()))
          .filter((group): group is ChatGroup => group !== null),
      );
    },
    onError,
  );

/** Live group document. Once the user is removed, the rules deny the read
 * and onError fires: callers treat that as "no longer a member". */
export const subscribeToGroup = (
  groupId: string,
  onChange: (group: ChatGroup | null) => void,
  onError: (error: unknown) => void,
): (() => void) =>
  onSnapshot(
    doc(firestore, 'groups', groupId),
    (snapshot) => onChange(snapshot.exists() ? parseGroup(snapshot.id, snapshot.data()) : null),
    onError,
  );

const groupFromResponse = (body: unknown): ChatGroup => {
  const group =
    isRecord(body) && isRecord(body.group) && typeof body.group.id === 'string'
      ? parseGroup(body.group.id, body.group)
      : null;
  if (group === null) {
    throw createAppError('Resposta inesperada do servidor.');
  }
  return group;
};

const ensureValid = (error: string | null): void => {
  if (error !== null) {
    throw createAppError(error);
  }
};

export const uploadGroupPhoto = (ownerUid: string, image: PickedImage): Promise<string> =>
  uploadPhoto('group-photos', ownerUid, image);

export const createGroup = async (input: CreateGroupInput): Promise<ChatGroup> => {
  ensureValid(validateGroupName(input.name));
  // +1: the owner is a member too.
  ensureValid(validateMemberCount(input.memberIds.length + 1));
  ensureValid(validateMemberLimit(input.memberLimit, input.memberIds.length + 1));
  return groupFromResponse(await apiRequest('POST', '/groups', { ...input, name: input.name.trim() }));
};

export const updateGroup = async (group: ChatGroup, changes: UpdateGroupInput): Promise<ChatGroup> => {
  if (changes.name !== undefined) {
    ensureValid(validateGroupName(changes.name));
  }
  if (changes.memberLimit !== undefined) {
    ensureValid(validateMemberLimit(changes.memberLimit, group.memberIds.length));
  }
  return groupFromResponse(await apiRequest('PATCH', `/groups/${group.id}`, changes));
};

export const setNotificationPolicy = (group: ChatGroup, policy: NotificationPolicy): Promise<ChatGroup> =>
  updateGroup(group, { notificationPolicy: policy });

export const addMembers = async (group: ChatGroup, memberIds: string[]): Promise<ChatGroup> => {
  const fresh: string[] = memberIds.filter((uid: string) => !group.memberIds.includes(uid));
  if (fresh.length === 0) {
    return group;
  }
  if (fresh.length > availableSlots(group.memberLimit, group.memberIds.length)) {
    throw createAppError('Não há vagas suficientes no grupo para todos os selecionados.');
  }
  return groupFromResponse(await apiRequest('POST', `/groups/${group.id}/members`, { memberIds: fresh }));
};

export const removeMember = async (group: ChatGroup, memberId: string): Promise<ChatGroup> => {
  if (memberId === group.ownerId) {
    throw createAppError('O proprietário não pode ser removido do grupo.');
  }
  return groupFromResponse(
    await apiRequest('DELETE', `/groups/${group.id}/members/${encodeURIComponent(memberId)}`),
  );
};

export const deleteGroup = async (groupId: string): Promise<void> => {
  await apiRequest('DELETE', `/groups/${groupId}`);
};

/** Re-syncs the RTDB membership mirror (used when a listed group cannot be read). */
export const syncGroupAccess = async (groupId: string): Promise<void> => {
  await apiRequest('POST', `/groups/${groupId}/sync`);
};

export const POLICY_OPTIONS: ReadonlyArray<{ value: NotificationPolicy; label: string; description: string }> = [
  {
    value: 'all_group_messages',
    label: 'Todas as mensagens',
    description: 'Todos os integrantes, exceto quem enviou, são notificados.',
  },
  {
    value: 'mentioned_members',
    label: 'Somente mencionados',
    description: 'Só quem for mencionado (@) ou escolhido como destinatário é notificado.',
  },
  {
    value: 'direct_messages_only',
    label: 'Só conversas individuais',
    description: 'Mensagens deste grupo não geram notificação.',
  },
  {
    value: 'disabled',
    label: 'Desativadas',
    description: 'Nenhuma mensagem deste grupo gera notificação.',
  },
];

export const policyLabel = (policy: NotificationPolicy): string =>
  POLICY_OPTIONS.find((option) => option.value === policy)?.label ?? policy;

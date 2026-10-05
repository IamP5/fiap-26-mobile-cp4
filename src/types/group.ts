import type { NotificationPolicy } from './notification';

export type ChatGroup = {
  id: string;
  name: string;
  photoUrl: string;
  ownerId: string;
  memberIds: string[];
  memberLimit: number;
  notificationPolicy: NotificationPolicy;
  notificationPolicyUpdatedBy: string;
  notificationPolicyUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateGroupInput = {
  name: string;
  photoUrl: string;
  memberIds: string[];
  memberLimit: number;
  notificationPolicy: NotificationPolicy;
};

export type UpdateGroupInput = Partial<
  Pick<ChatGroup, 'name' | 'photoUrl' | 'memberLimit' | 'notificationPolicy'>
>;

/** Must match server/internal/domain (MinGroupMembers / MaxMemberLimit). */
export const MIN_GROUP_MEMBERS = 2;
export const MAX_MEMBER_LIMIT = 50;
export const MAX_GROUP_NAME_LENGTH = 60;

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { ConversationType } from './chat';

export type UsersScreenParams =
  | { mode: 'direct' }
  | {
      mode: 'pickMembers';
      /** Group being edited; undefined while creating one. */
      groupId?: string;
      selectedIds: string[];
      /** Current members that cannot be toggled (edit mode). */
      lockedIds: string[];
      /** How many users may be selected in total (free slots). */
      maxSelectable: number;
    };

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Users: UsersScreenParams;
  GroupForm: { groupId?: string; pickedMemberIds?: string[] } | undefined;
  GroupInfo: { groupId: string };
  Chat: { conversationId: string; conversationType: ConversationType };
  Profile: { uid: string };
};

export type ScreenProps<Name extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  Name
>;

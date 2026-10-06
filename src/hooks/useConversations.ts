import { useCallback, useEffect, useMemo, useState } from 'react';

import { profileOrFallback, useDirectory } from '../contexts/DirectoryContext';
import { subscribeToDirectConversations, subscribeToMessages, subscribeToReadMark } from '../services/chatService';
import { subscribeToMyGroups } from '../services/groupService';
import type { ChatMessage, ConversationSummary, DirectConversation } from '../types/chat';
import type { ChatGroup } from '../types/group';
import type { ChatUser } from '../types/user';
import { translateFirebaseError } from '../utils/errors';

/** Messages per conversation watched by the list: enough for the preview and
 * an exact unread badge in normal use, while keeping the home screen light. */
const PREVIEW_WINDOW = 30;

type Channel = { messages: ChatMessage[]; readAt: number };

export type UseConversationsResult = {
  conversations: ConversationSummary[];
  groupsById: ReadonlyMap<string, ChatGroup>;
  loading: boolean;
  error: string | null;
  unreadTotal: number;
  reload: () => void;
};

/**
 * Direct conversations and groups of the signed-in user (Firestore listeners)
 * merged with the last message and unread count of each (Realtime Database
 * listeners). Every listener is removed when the user signs out or the set of
 * conversations changes.
 */
export const useConversations = (me: ChatUser): UseConversationsResult => {
  const { byUid } = useDirectory();
  const [directs, setDirects] = useState<DirectConversation[] | null>(null);
  const [groups, setGroups] = useState<ChatGroup[] | null>(null);
  const [channels, setChannels] = useState<Record<string, Channel>>({});
  // One slot per listener: a later good snapshot clears only its own error.
  const [directsError, setDirectsError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const error: string | null = directsError ?? groupsError;
  const [reloadToken, setReloadToken] = useState<number>(0);

  const meUid: string = me.uid;

  useEffect(() => {
    setDirectsError(null);
    setGroupsError(null);
    const stopDirects = subscribeToDirectConversations(
      meUid,
      (next: DirectConversation[]): void => {
        setDirects(next);
        setDirectsError(null);
      },
      (subscriptionError: unknown): void => setDirectsError(translateFirebaseError(subscriptionError)),
    );
    const stopGroups = subscribeToMyGroups(
      meUid,
      (next: ChatGroup[]): void => {
        setGroups(next);
        setGroupsError(null);
      },
      (subscriptionError: unknown): void => setGroupsError(translateFirebaseError(subscriptionError)),
    );
    return () => {
      stopDirects();
      stopGroups();
    };
  }, [meUid, reloadToken]);

  // Re-subscribe the message channels only when the SET of ids changes, not
  // on every snapshot (a group rename must not tear down listeners).
  const idsKey: string = useMemo(
    () =>
      [...(directs ?? []).map((d: DirectConversation) => d.id), ...(groups ?? []).map((g: ChatGroup) => g.id)]
        .sort()
        .join('|'),
    [directs, groups],
  );

  useEffect(() => {
    const ids: string[] = idsKey.length === 0 ? [] : idsKey.split('|');
    setChannels((prev: Record<string, Channel>) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => ids.includes(id))),
    );
    const unsubscribers: Array<() => void> = [];
    ids.forEach((conversationId: string) => {
      const update = (patch: Partial<Channel>): void =>
        setChannels((prev: Record<string, Channel>) => ({
          ...prev,
          [conversationId]: { messages: [], readAt: 0, ...prev[conversationId], ...patch },
        }));
      unsubscribers.push(
        subscribeToMessages(
          conversationId,
          (messages: ChatMessage[]) => update({ messages }),
          // A group just joined may not be readable until the membership
          // mirror lands; the preview simply stays empty meanwhile.
          () => undefined,
          PREVIEW_WINDOW,
        ),
        subscribeToReadMark(conversationId, meUid, (readAt: number) => update({ readAt })),
      );
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [idsKey, meUid]);

  const conversations = useMemo<ConversationSummary[]>(() => {
    const summarize = (channel: Channel | undefined): { last: ChatMessage | null; unread: number } => {
      const messages: ChatMessage[] = channel?.messages ?? [];
      const readAt: number = channel?.readAt ?? 0;
      return {
        last: messages.length > 0 ? (messages[messages.length - 1] ?? null) : null,
        unread: messages.filter((m: ChatMessage) => m.senderId !== meUid && m.createdAt > readAt).length,
      };
    };

    const directRows: ConversationSummary[] = (directs ?? []).flatMap((conversation: DirectConversation) => {
      const otherUid: string | undefined = conversation.participants.find((uid: string) => uid !== meUid);
      if (otherUid === undefined) {
        return [];
      }
      const other = profileOrFallback(byUid, otherUid);
      const { last, unread } = summarize(channels[conversation.id]);
      return [
        {
          id: conversation.id,
          type: 'direct' as const,
          title: other.name,
          photoUrl: other.photoUrl,
          otherUid,
          lastMessage: last,
          unreadCount: unread,
          activityAt: last?.createdAt ?? conversation.createdAt,
        },
      ];
    });

    const groupRows: ConversationSummary[] = (groups ?? []).map((group: ChatGroup) => {
      const { last, unread } = summarize(channels[group.id]);
      return {
        id: group.id,
        type: 'group' as const,
        title: group.name,
        photoUrl: group.photoUrl,
        otherUid: null,
        lastMessage: last,
        unreadCount: unread,
        activityAt: last?.createdAt ?? group.createdAt,
      };
    });

    return [...directRows, ...groupRows].sort(
      (a: ConversationSummary, b: ConversationSummary) => b.activityAt - a.activityAt,
    );
  }, [directs, groups, channels, byUid, meUid]);

  const groupsById = useMemo<ReadonlyMap<string, ChatGroup>>(
    () => new Map((groups ?? []).map((group: ChatGroup) => [group.id, group])),
    [groups],
  );

  const unreadTotal: number = useMemo(
    () => conversations.reduce((sum: number, row: ConversationSummary) => sum + row.unreadCount, 0),
    [conversations],
  );

  const reload = useCallback((): void => setReloadToken((prev: number) => prev + 1), []);

  return {
    conversations,
    groupsById,
    loading: (directs === null || groups === null) && error === null,
    error,
    unreadTotal,
    reload,
  };
};

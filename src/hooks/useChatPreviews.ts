import { useEffect, useState } from 'react';

import {
  markConversationDelivered,
  subscribeToReceipts,
  subscribeToRecentMessages,
} from '../services/chatService';
import type { ChatMessage, ConversationPreview, ReceiptMarks } from '../types/chat';
import type { ChatUser } from '../types/user';
import { buildConversationId } from '../utils/chatRules';

/**
 * Window per conversation: enough to show an exact unread count for normal
 * usage while keeping the home screen's data tiny. A backlog larger than the
 * window still renders a correct preview — the count just bottoms out at the
 * window size.
 */
const PREVIEW_WINDOW = 30;

type ContactChannel = {
  messages: ChatMessage[];
  marks: Record<string, ReceiptMarks>;
  /** Guards the delivered write so one slow round-trip cannot loop. */
  lastMarkedDelivered: number;
};

const buildPreview = (
  conversationId: string,
  channel: ContactChannel,
  meUid: string,
  otherUid: string,
): ConversationPreview => {
  const myMarks: ReceiptMarks = channel.marks[meUid] ?? { deliveredAt: 0, readAt: 0 };
  const otherMarks: ReceiptMarks = channel.marks[otherUid] ?? { deliveredAt: 0, readAt: 0 };
  const last: ChatMessage | null =
    channel.messages.length > 0 ? channel.messages[channel.messages.length - 1] ?? null : null;
  const unreadCount: number = channel.messages.filter(
    (m) => m.senderId === otherUid && m.createdAt > myMarks.readAt,
  ).length;
  return {
    conversationId,
    lastMessage: last,
    unreadCount,
    otherDeliveredAt: otherMarks.deliveredAt,
    otherReadAt: otherMarks.readAt,
  };
};

/**
 * Live previews for the conversations list (WhatsApp home): last message,
 * unread count and the other member's receipt watermarks, keyed by contact
 * uid. Contacts without a conversation yet simply have no entry.
 *
 * This hook is also what makes the DELIVERED (double grey) tick truthful:
 * while the app is running with the home screen mounted, any incoming message
 * newer than my delivered watermark bumps it — which is exactly WhatsApp's
 * semantics ("reached the recipient's device", not "was read").
 */
export const useChatPreviews = (
  me: ChatUser,
  contacts: readonly ChatUser[],
): Record<string, ConversationPreview> => {
  const [previews, setPreviews] = useState<Record<string, ConversationPreview>>({});

  const meUid: string = me.uid;
  // Effect key: re-subscribe only when the actual contact set changes, not on
  // every array identity change from the contacts hook.
  const contactsKey: string = contacts
    .map((c) => c.uid)
    .sort()
    .join('|');

  useEffect(() => {
    const uids: string[] = contactsKey.length === 0 ? [] : contactsKey.split('|');
    let active = true;
    setPreviews(() => ({}));

    const unsubscribers: (() => void)[] = [];

    uids.forEach((otherUid: string): void => {
      const conversationId: string = buildConversationId(meUid, otherUid);
      const channel: ContactChannel = { messages: [], marks: {}, lastMarkedDelivered: 0 };

      const publish = (): void => {
        if (!active) {
          return;
        }
        const preview: ConversationPreview = buildPreview(conversationId, channel, meUid, otherUid);
        setPreviews((prev) => ({ ...prev, [otherUid]: preview }));

        // Delivered watermark: my client has now received these messages.
        const myDeliveredAt: number = channel.marks[meUid]?.deliveredAt ?? 0;
        const latestFromOther: number = channel.messages.reduce(
          (max, m) => (m.senderId === otherUid && m.createdAt > max ? m.createdAt : max),
          0,
        );
        if (latestFromOther > Math.max(myDeliveredAt, channel.lastMarkedDelivered)) {
          channel.lastMarkedDelivered = latestFromOther;
          markConversationDelivered(conversationId, meUid).catch(() => {});
        }
      };

      // Both subscriptions error with PERMISSION_DENIED while the conversation
      // does not exist yet (the read rules key off the conversation node) —
      // that is the normal "never talked" state, not a failure.
      unsubscribers.push(
        subscribeToRecentMessages(
          conversationId,
          PREVIEW_WINDOW,
          (messages) => {
            channel.messages = messages;
            publish();
          },
          () => {},
        ),
      );
      unsubscribers.push(
        subscribeToReceipts(
          conversationId,
          (marks) => {
            channel.marks = marks;
            publish();
          },
          () => {},
        ),
      );
    });

    return (): void => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [meUid, contactsKey]);

  return previews;
};

export type ConversationType = 'direct' | 'group';

/** Firestore shape of directConversations/{id} (the id holds the pair). */
export type StoredDirectConversation = {
  participantIds: [string, string];
  createdAt: number;
};

export type DirectConversation = {
  id: string;
  type: 'direct';
  participants: [string, string];
  createdAt: number;
};

export type MessageTarget =
  | { type: 'conversation' }
  | { type: 'member'; memberId: string };

export type ChatMessage = {
  id: string;
  conversationId: string;
  conversationType: ConversationType;
  senderId: string;
  text: string;
  target: MessageTarget;
  mentionedUserIds: string[];
  createdAt: number;
};

/** Realtime Database shape of messages/{conversationId}/{messageId}. RTDB
 * cannot store empty arrays, so mentions are a { uid: true } map, omitted
 * when empty; id and conversationId are the node's keys. */
export type StoredMessage = {
  conversationType: ConversationType;
  senderId: string;
  text: string;
  target: MessageTarget;
  mentionedUserIds?: Record<string, true>;
  createdAt: number;
};

// `status` undefined === confirmed by the server. Only optimistic sends
// that are not acknowledged yet carry one.
export type MessageStatus = 'sending' | 'failed';

export type DisplayMessage = ChatMessage & {
  status?: MessageStatus;
  localId?: string;
};

export type OutgoingMessage = {
  text: string;
  target: MessageTarget;
  mentionedUserIds: string[];
};

/** One row of the conversations list (direct or group). */
export type ConversationSummary = {
  id: string;
  type: ConversationType;
  title: string;
  photoUrl: string;
  /** Direct: the other participant's uid. */
  otherUid: string | null;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  /** Sort key: last message time, or creation time when empty. */
  activityAt: number;
};

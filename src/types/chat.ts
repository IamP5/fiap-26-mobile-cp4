export type Conversation = {
  id: string;
  participants: [string, string];
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
};

export type StoredMessage = ChatMessage;

export type StoredConversation = {
  participants: Record<string, true>;
  createdAt: number;
};

// `status` undefined === confirmed by the server (a plain message read back
// from Firebase). Only optimistic, not-yet-reconciled messages carry one.
export type MessageStatus = 'sending' | 'sent' | 'failed';

export type DisplayMessage = ChatMessage & {
  status?: MessageStatus;
  localId?: string;
};

/**
 * Per-user receipt watermarks for one conversation (WhatsApp-style, but two
 * writes total instead of one write per message): a message is *delivered*
 * iff its createdAt <= the other member's deliveredAt, *read* iff
 * createdAt <= their readAt. 0 means "never".
 */
export type ReceiptMarks = {
  deliveredAt: number;
  readAt: number;
};

/** What the home screen knows about one contact's conversation. */
export type ConversationPreview = {
  conversationId: string;
  lastMessage: ChatMessage | null;
  /** Messages from the other user newer than my read watermark. */
  unreadCount: number;
  /** The OTHER member's watermarks — they drive the ticks on my own messages. */
  otherDeliveredAt: number;
  otherReadAt: number;
};

import {
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
  type DataSnapshot,
  type DatabaseReference,
} from 'firebase/database';

import { database } from './firebase';
import type {
  ChatMessage,
  Conversation,
  ReceiptMarks,
  StoredConversation,
  StoredMessage,
} from '../types/chat';
import type { ChatUser } from '../types/user';
import { buildConversationId, canChat, providerLabel } from '../utils/chatRules';
import { createAppError } from '../utils/errors';

const MESSAGES_LIMIT = 200;

/**
 * The Realtime Database SDK queues every read/write while the client is offline
 * and only settles them on a server ack — with no built-in deadline. Without an
 * explicit one the chat screen would spin forever and the send button would stay
 * disabled for good, so every round-trip below is bounded.
 */
const RTDB_TIMEOUT_MS = 12000;
const SERVER_OFFSET_TIMEOUT_MS = 2000;

const TIMEOUT_OPEN_MESSAGE =
  'Tempo esgotado ao abrir a conversa. Verifique sua conexão e tente novamente.';
const TIMEOUT_SEND_MESSAGE =
  'Tempo esgotado ao enviar a mensagem. Verifique sua conexão e tente novamente.';
const BROKEN_CONVERSATION_MESSAGE =
  'Esta conversa está com dados inválidos no banco e não pode ser aberta. ' +
  'Peça a um administrador para remover o nó desta conversa no Realtime Database.';

type Timed<T> =
  | { status: 'ok'; value: T }
  | { status: 'timeout' }
  | { status: 'failed'; error: unknown };

const runWithDeadline = <T>(operation: Promise<T>, timeoutMs: number): Promise<Timed<T>> =>
  new Promise<Timed<T>>((resolve) => {
    const timer = setTimeout((): void => {
      resolve({ status: 'timeout' });
    }, timeoutMs);
    operation.then(
      (value: T): void => {
        clearTimeout(timer);
        resolve({ status: 'ok', value });
      },
      (error: unknown): void => {
        clearTimeout(timer);
        resolve({ status: 'failed', error });
      },
    );
  });

/**
 * Difference between the server clock and this device's clock, published by the
 * SDK at `.info/serverTimeOffset`. The rules reject `createdAt > now + 60000`
 * (server time), so a device clock running fast would otherwise make every send
 * fail with PERMISSION_DENIED.
 */
const readServerTimeOffset = (): Promise<number> =>
  new Promise<number>((resolve) => {
    const state: { settled: boolean; unsubscribe: (() => void) | null } = {
      settled: false,
      unsubscribe: null,
    };

    const finish = (offset: number): void => {
      if (state.settled) {
        return;
      }
      state.settled = true;
      clearTimeout(timer);
      resolve(offset);
      if (state.unsubscribe !== null) {
        state.unsubscribe();
        state.unsubscribe = null;
      }
    };

    const timer = setTimeout((): void => {
      finish(0);
    }, SERVER_OFFSET_TIMEOUT_MS);

    const unsubscribe = onValue(
      ref(database, '.info/serverTimeOffset'),
      (snapshot: DataSnapshot): void => {
        const raw: unknown = snapshot.val();
        finish(typeof raw === 'number' ? raw : 0);
      },
      (): void => {
        finish(0);
      },
    );

    if (state.settled) {
      // `.info` listeners can fire synchronously; the subscription is already
      // resolved, so release it right away.
      unsubscribe();
    } else {
      state.unsubscribe = unsubscribe;
    }
  });

const serverAlignedNow = async (): Promise<number> => {
  const offset: number = await readServerTimeOffset();
  return Date.now() + offset;
};

const parseMessage = (value: unknown): ChatMessage | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record: Record<string, unknown> = value as Record<string, unknown>;
  const id: unknown = record.id;
  const conversationId: unknown = record.conversationId;
  const senderId: unknown = record.senderId;
  const receiverId: unknown = record.receiverId;
  const text: unknown = record.text;
  const createdAt: unknown = record.createdAt;

  if (
    typeof id !== 'string' ||
    typeof conversationId !== 'string' ||
    typeof senderId !== 'string' ||
    typeof receiverId !== 'string' ||
    typeof text !== 'string' ||
    typeof createdAt !== 'number'
  ) {
    return null;
  }

  return { id, conversationId, senderId, receiverId, text, createdAt };
};

const parseConversation = (
  id: string,
  value: unknown,
): Conversation | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record: Record<string, unknown> = value as Record<string, unknown>;
  const participants: unknown = record.participants;
  const createdAt: unknown = record.createdAt;

  if (typeof participants !== 'object' || participants === null) {
    return null;
  }
  if (typeof createdAt !== 'number') {
    return null;
  }

  const uids: string[] = Object.keys(participants as Record<string, unknown>);
  if (uids.length !== 2) {
    return null;
  }
  const sorted: string[] = [...uids].sort();
  const first: string | undefined = sorted[0];
  const second: string | undefined = sorted[1];
  if (first === undefined || second === undefined) {
    return null;
  }

  return { id, participants: [first, second], createdAt };
};

type ConversationRead =
  | { status: 'found'; conversation: Conversation }
  /** The node does not exist yet, or the membership-based read rule denied it. */
  | { status: 'absent' }
  /** The node exists but does not match the expected shape. */
  | { status: 'invalid' }
  | { status: 'timeout' };

/**
 * Reads conversations/$cid.
 *
 * The deployed read rule requires `participants/auth.uid === true` evaluated
 * against the CURRENT data, so reading a conversation that does not exist yet is
 * rejected with PERMISSION_DENIED instead of resolving an empty snapshot. A
 * failed read is therefore reported as "absent" (i.e. "not created yet") and the
 * caller falls through to the create path, which the write rule does allow.
 */
const readConversation = async (
  conversationRef: DatabaseReference,
  conversationId: string,
): Promise<ConversationRead> => {
  const result: Timed<DataSnapshot> = await runWithDeadline(
    get(conversationRef),
    RTDB_TIMEOUT_MS,
  );

  if (result.status === 'timeout') {
    return { status: 'timeout' };
  }
  if (result.status === 'failed') {
    return { status: 'absent' };
  }
  if (!result.value.exists()) {
    return { status: 'absent' };
  }

  const parsed: Conversation | null = parseConversation(conversationId, result.value.val());
  return parsed === null ? { status: 'invalid' } : { status: 'found', conversation: parsed };
};

const writeUserConversationIndex = async (
  conversation: Conversation,
  meUid: string,
  otherUid: string,
): Promise<void> => {
  await Promise.all([
    set(ref(database, `userConversations/${meUid}/${conversation.id}`), {
      otherUid,
      createdAt: conversation.createdAt,
    }),
    set(ref(database, `userConversations/${otherUid}/${conversation.id}`), {
      otherUid: meUid,
      createdAt: conversation.createdAt,
    }),
  ]);
};

export const ensureConversation = async (
  me: ChatUser,
  other: ChatUser,
): Promise<Conversation> => {
  if (me.uid === other.uid) {
    throw createAppError('Não é possível iniciar uma conversa com você mesmo.');
  }

  if (!canChat(me.provider, other.provider)) {
    throw createAppError(
      `Conversa não permitida: contas ${providerLabel(me.provider)} e ${providerLabel(
        other.provider,
      )} são do mesmo tipo. Só é possível conversar entre uma conta de e-mail/senha e uma conta social (Google ou Apple).`,
    );
  }

  const conversationId: string = buildConversationId(me.uid, other.uid);
  const conversationRef = ref(database, `conversations/${conversationId}`);

  const initial: ConversationRead = await readConversation(conversationRef, conversationId);

  if (initial.status === 'timeout') {
    throw createAppError(TIMEOUT_OPEN_MESSAGE);
  }
  if (initial.status === 'invalid') {
    // The node exists but is malformed: creating it again is guaranteed to be
    // denied by the `!data.exists()` write rule, so fail with a clear reason
    // instead of a misleading permission error.
    throw createAppError(BROKEN_CONVERSATION_MESSAGE);
  }
  if (initial.status === 'found') {
    return initial.conversation;
  }

  const createdAt: number = Date.now();
  const payload: StoredConversation = {
    participants: { [me.uid]: true, [other.uid]: true },
    createdAt,
  };

  const writeResult: Timed<void> = await runWithDeadline(
    set(conversationRef, payload),
    RTDB_TIMEOUT_MS,
  );

  if (writeResult.status === 'timeout') {
    throw createAppError(TIMEOUT_OPEN_MESSAGE);
  }

  if (writeResult.status === 'failed') {
    // The write rule only allows creation (`!data.exists()`), so a rejection
    // most likely means the other participant created the conversation first.
    // Re-read: now that we are a participant the read rule grants access.
    const afterRace: ConversationRead = await readConversation(conversationRef, conversationId);
    if (afterRace.status === 'found') {
      return afterRace.conversation;
    }
    if (afterRace.status === 'invalid') {
      throw createAppError(BROKEN_CONVERSATION_MESSAGE);
    }
    if (afterRace.status === 'timeout') {
      throw createAppError(TIMEOUT_OPEN_MESSAGE);
    }
    throw writeResult.error;
  }

  const participants: [string, string] =
    me.uid < other.uid ? [me.uid, other.uid] : [other.uid, me.uid];
  const conversation: Conversation = { id: conversationId, participants, createdAt };

  // The index is written only when the conversation is actually created: it is
  // immutable afterwards, so rewriting it on every chat open would just add two
  // round-trips in front of the first render. It is a write-only convenience
  // model, so a failure here must not block the conversation from opening.
  await runWithDeadline(
    writeUserConversationIndex(conversation, me.uid, other.uid),
    RTDB_TIMEOUT_MS,
  );

  return conversation;
};

export const subscribeToRecentMessages = (
  conversationId: string,
  limit: number,
  onChange: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
): (() => void) => {
  const messagesQuery = query(
    ref(database, `messages/${conversationId}`),
    orderByChild('createdAt'),
    limitToLast(limit),
  );

  const unsubscribe = onValue(
    messagesQuery,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((child) => {
        const parsed = parseMessage(child.val());
        if (parsed !== null) {
          messages.push(parsed);
        }
      });
      const sorted: ChatMessage[] = [...messages].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      onChange(sorted);
    },
    (error) => {
      onError(error);
    },
  );

  return (): void => {
    unsubscribe();
  };
};

export const subscribeToMessages = (
  conversationId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
): (() => void) => subscribeToRecentMessages(conversationId, MESSAGES_LIMIT, onChange, onError);

const parseMarks = (value: unknown): ReceiptMarks => {
  if (typeof value !== 'object' || value === null) {
    return { deliveredAt: 0, readAt: 0 };
  }
  const record: Record<string, unknown> = value as Record<string, unknown>;
  const deliveredAt: unknown = record.deliveredAt;
  const readAt: unknown = record.readAt;
  return {
    deliveredAt: typeof deliveredAt === 'number' ? deliveredAt : 0,
    readAt: typeof readAt === 'number' ? readAt : 0,
  };
};

/**
 * Subscribes to receipts/$cid — the per-user watermarks of BOTH members.
 * The read rule requires the conversation to exist with me as a participant,
 * so before the first message this errors with PERMISSION_DENIED; callers
 * treat that as "no receipts yet", not a failure.
 */
export const subscribeToReceipts = (
  conversationId: string,
  onChange: (marks: Record<string, ReceiptMarks>) => void,
  onError: (error: unknown) => void,
): (() => void) => {
  const unsubscribe = onValue(
    ref(database, `receipts/${conversationId}`),
    (snapshot: DataSnapshot) => {
      const marks: Record<string, ReceiptMarks> = {};
      snapshot.forEach((child) => {
        const key: string | null = child.key;
        if (key !== null) {
          marks[key] = parseMarks(child.val());
        }
      });
      onChange(marks);
    },
    (error) => {
      onError(error);
    },
  );
  return (): void => {
    unsubscribe();
  };
};

/**
 * Bumps MY delivered watermark: "my client has received the other user's
 * messages" (app running with a listener attached — WhatsApp's double grey
 * tick). One tiny write regardless of how many messages arrived.
 */
export const markConversationDelivered = async (
  conversationId: string,
  meUid: string,
): Promise<void> => {
  const deliveredAt: number = await serverAlignedNow();
  await update(ref(database, `receipts/${conversationId}/${meUid}`), { deliveredAt });
};

/**
 * Bumps MY read watermark: "I have the chat open and saw the messages"
 * (WhatsApp's double blue tick). Read implies delivered — both timestamps go
 * in the same write, so "read but never delivered" can never be observed.
 */
export const markConversationRead = async (
  conversationId: string,
  meUid: string,
): Promise<void> => {
  const readAt: number = await serverAlignedNow();
  await update(ref(database, `receipts/${conversationId}/${meUid}`), {
    deliveredAt: readAt,
    readAt,
  });
};

export const sendMessage = async (params: {
  conversation: Conversation;
  senderId: string;
  receiverId: string;
  text: string;
  /**
   * Fired synchronously with the RTDB-generated key, before any network
   * await in this function — including before the local optimistic echo
   * `subscribeToMessages` can possibly raise for this write. Callers can use
   * this to stamp the id onto their own optimistic state immediately, so
   * reconciliation never has to guess an in-flight send's identity from its
   * content.
   */
  onLocalId?: (id: string) => void;
  /**
   * When set, re-`set()`s the existing message at this id instead of
   * `push()`-ing a new one. A retry after a deadline timeout must reuse the
   * original write's location: the timed-out `set()` is NOT cancelled — it
   * stays queued in the SDK and is committed on reconnect regardless — so a
   * retry that pushed a fresh key would leave two permanent copies in the
   * database once both writes eventually land.
   */
  existingId?: string;
  /**
   * Fired if and only if this call's `set()` hits the deadline (see
   * `TIMEOUT_SEND_MESSAGE` below) AND the write later settles anyway — which
   * it will, since a timed-out write is not cancelled. `delivered` is true on
   * a late server ack, false on a late definitive rejection. Callers use this
   * to correct an optimistic "failed" bubble once the true outcome is known,
   * instead of leaving it wrong forever.
   */
  onDeadlineExceededSettled?: (delivered: boolean) => void;
}): Promise<ChatMessage> => {
  const { conversation, senderId, receiverId } = params;
  const text: string = params.text.trim();

  if (text.length === 0) {
    throw createAppError('Digite uma mensagem antes de enviar.');
  }
  if (text.length > 1000) {
    throw createAppError('A mensagem deve ter no máximo 1000 caracteres.');
  }
  if (senderId === receiverId) {
    throw createAppError('Não é possível enviar uma mensagem para você mesmo.');
  }
  if (!conversation.participants.includes(senderId)) {
    throw createAppError('Você não faz parte desta conversa.');
  }
  if (!conversation.participants.includes(receiverId)) {
    throw createAppError('O destinatário não faz parte desta conversa.');
  }

  let messageRef: DatabaseReference;
  let messageId: string;
  if (params.existingId !== undefined) {
    messageId = params.existingId;
    messageRef = ref(database, `messages/${conversation.id}/${messageId}`);
  } else {
    const pushedRef = push(ref(database, `messages/${conversation.id}`));
    const pushedKey: string | null = pushedRef.key;
    if (pushedKey === null) {
      throw createAppError('Não foi possível gerar o identificador da mensagem.');
    }
    messageId = pushedKey;
    messageRef = pushedRef;
    params.onLocalId?.(messageId);
  }

  const message: StoredMessage = {
    id: messageId,
    conversationId: conversation.id,
    senderId,
    receiverId,
    text,
    createdAt: await serverAlignedNow(),
  };

  const writePromise: Promise<void> = set(messageRef, message);
  const result: Timed<void> = await runWithDeadline(writePromise, RTDB_TIMEOUT_MS);
  if (result.status === 'timeout') {
    // The write is still outstanding — attach a second observer (promises can
    // have more than one) so its real, eventual outcome still reaches the
    // caller after this function has already thrown.
    writePromise.then(
      (): void => params.onDeadlineExceededSettled?.(true),
      (): void => params.onDeadlineExceededSettled?.(false),
    );
    throw createAppError(TIMEOUT_SEND_MESSAGE);
  }
  if (result.status === 'failed') {
    throw result.error;
  }

  return message;
};

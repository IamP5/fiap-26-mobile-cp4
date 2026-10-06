import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  limitToLast,
  onValue,
  orderByChild,
  push,
  query as rtdbQuery,
  ref,
  set,
  type DataSnapshot,
  type DatabaseReference,
} from 'firebase/database';

import type {
  ChatMessage,
  ConversationType,
  DirectConversation,
  MessageTarget,
  OutgoingMessage,
  StoredDirectConversation,
  StoredMessage,
} from '../types/chat';
import { buildDirectConversationId } from '../utils/conversationId';
import { createAppError, isApiError } from '../utils/errors';
import { apiRequest } from './apiClient';
import { database, firestore } from './firebase';

export const MAX_MESSAGE_LENGTH = 2000;
const MESSAGES_LIMIT = 200;

/**
 * The Realtime Database SDK queues writes while offline and settles them only
 * on a server ack, with no deadline. Sends are raced against one so the UI can
 * show a retryable failure instead of spinning forever.
 */
const RTDB_TIMEOUT_MS = 12000;
const SERVER_OFFSET_TIMEOUT_MS = 2000;

type Timed<T> = { status: 'ok'; value: T } | { status: 'timeout' } | { status: 'failed'; error: unknown };

const runWithDeadline = <T,>(operation: Promise<T>, timeoutMs: number): Promise<Timed<T>> =>
  new Promise<Timed<T>>((resolve) => {
    const timer = setTimeout((): void => resolve({ status: 'timeout' }), timeoutMs);
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// ---- direct conversations (Firestore) -------------------------------------

const parseDirectConversation = (id: string, value: unknown): DirectConversation | null => {
  if (!isRecord(value) || !Array.isArray(value.participantIds) || typeof value.createdAt !== 'number') {
    return null;
  }
  const [first, second] = value.participantIds;
  if (typeof first !== 'string' || typeof second !== 'string' || value.participantIds.length !== 2) {
    return null;
  }
  return { id, type: 'direct', participants: [first, second], createdAt: value.createdAt };
};

/**
 * Finds or creates the single direct conversation of a pair. The id is the
 * sorted uids, so concurrent creations by both users target the same
 * document; the rules allow only creation (never overwrite), and the loser of
 * that race simply reads the winner's document.
 */
export const ensureDirectConversation = async (meUid: string, otherUid: string): Promise<DirectConversation> => {
  if (meUid === otherUid) {
    throw createAppError('Não é possível iniciar uma conversa com você mesmo.');
  }
  const conversationId: string = buildDirectConversationId(meUid, otherUid);
  const conversationRef = doc(firestore, 'directConversations', conversationId);

  const existing = await getDoc(conversationRef);
  const parsed = existing.exists() ? parseDirectConversation(conversationId, existing.data()) : null;
  if (parsed !== null) {
    return parsed;
  }

  const participants: [string, string] = meUid < otherUid ? [meUid, otherUid] : [otherUid, meUid];
  const createdAt: number = Date.now();
  try {
    const stored: StoredDirectConversation = { participantIds: participants, createdAt };
    await setDoc(conversationRef, stored);
  } catch (error: unknown) {
    const raced = await getDoc(conversationRef);
    const winner = raced.exists() ? parseDirectConversation(conversationId, raced.data()) : null;
    if (winner === null) {
      throw error;
    }
    return winner;
  }
  return { id: conversationId, type: 'direct', participants, createdAt };
};

export const subscribeToDirectConversations = (
  meUid: string,
  onChange: (conversations: DirectConversation[]) => void,
  onError: (error: unknown) => void,
): (() => void) =>
  onSnapshot(
    query(collection(firestore, 'directConversations'), where('participantIds', 'array-contains', meUid)),
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((entry: QueryDocumentSnapshot) => parseDirectConversation(entry.id, entry.data()))
          .filter((conversation): conversation is DirectConversation => conversation !== null),
      );
    },
    onError,
  );

// ---- messages (Realtime Database) -------------------------------------------

const parseTarget = (value: unknown): MessageTarget | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === 'conversation') {
    return { type: 'conversation' };
  }
  if (value.type === 'member' && typeof value.memberId === 'string') {
    return { type: 'member', memberId: value.memberId };
  }
  return null;
};

const parseMessage = (conversationId: string, id: string, value: unknown): ChatMessage | null => {
  if (!isRecord(value)) {
    return null;
  }
  const { conversationType, senderId, text, createdAt, mentionedUserIds } = value;
  const target: MessageTarget | null = parseTarget(value.target);
  if (
    (conversationType !== 'direct' && conversationType !== 'group') ||
    typeof senderId !== 'string' ||
    typeof text !== 'string' ||
    typeof createdAt !== 'number' ||
    target === null
  ) {
    return null;
  }
  const mentions: string[] = isRecord(mentionedUserIds)
    ? Object.keys(mentionedUserIds).filter((uid: string) => mentionedUserIds[uid] === true)
    : [];
  return { id, conversationId, conversationType, senderId, text, target, mentionedUserIds: mentions, createdAt };
};

/** Live window of the latest messages. Returns the unsubscribe function,
 * which callers invoke when the screen unmounts or the conversation changes. */
export const subscribeToMessages = (
  conversationId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError: (error: unknown) => void,
  limit: number = MESSAGES_LIMIT,
): (() => void) =>
  onValue(
    rtdbQuery(ref(database, `messages/${conversationId}`), orderByChild('createdAt'), limitToLast(limit)),
    (snapshot: DataSnapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((child: DataSnapshot) => {
        const parsed = child.key === null ? null : parseMessage(conversationId, child.key, child.val());
        if (parsed !== null) {
          messages.push(parsed);
        }
      });
      onChange([...messages].sort((a, b) => a.createdAt - b.createdAt));
    },
    onError,
  );

/**
 * Server clock offset published by the SDK. The rules reject createdAt far
 * from the server's `now`, so a phone with a wrong clock would otherwise fail
 * every send.
 */
const readServerTimeOffset = (): Promise<number> =>
  new Promise<number>((resolve) => {
    const state: { settled: boolean; unsubscribe: (() => void) | null } = { settled: false, unsubscribe: null };
    const finish = (offset: number): void => {
      if (state.settled) {
        return;
      }
      state.settled = true;
      clearTimeout(timer);
      resolve(offset);
      state.unsubscribe?.();
    };
    const timer = setTimeout((): void => finish(0), SERVER_OFFSET_TIMEOUT_MS);
    const unsubscribe = onValue(
      ref(database, '.info/serverTimeOffset'),
      (snapshot: DataSnapshot): void => {
        const raw: unknown = snapshot.val();
        finish(typeof raw === 'number' ? raw : 0);
      },
      (): void => finish(0),
    );
    if (state.settled) {
      unsubscribe();
    } else {
      state.unsubscribe = unsubscribe;
    }
  });

export const serverAlignedNow = async (): Promise<number> => Date.now() + (await readServerTimeOffset());

export type SendMessageParams = {
  conversationId: string;
  conversationType: ConversationType;
  senderId: string;
  message: OutgoingMessage;
  /** Fired synchronously with the RTDB key, before any network await. */
  onLocalId?: (id: string) => void;
  /** Retry: re-set the same key instead of pushing a new one. A timed-out
   * write is not cancelled (it is committed on reconnect), so a retry with a
   * fresh key would leave two copies. */
  existingId?: string;
  /** Called if a write that hit the deadline settles later anyway. */
  onDeadlineExceededSettled?: (delivered: boolean) => void;
};

export const sendMessage = async (params: SendMessageParams): Promise<ChatMessage> => {
  const text: string = params.message.text.trim();
  if (text.length === 0) {
    throw createAppError('Digite uma mensagem antes de enviar.');
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw createAppError(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`);
  }

  let messageRef: DatabaseReference;
  let messageId: string;
  if (params.existingId !== undefined) {
    messageId = params.existingId;
    messageRef = ref(database, `messages/${params.conversationId}/${messageId}`);
  } else {
    const pushed = push(ref(database, `messages/${params.conversationId}`));
    if (pushed.key === null) {
      throw createAppError('Não foi possível gerar o identificador da mensagem.');
    }
    messageId = pushed.key;
    messageRef = pushed;
    params.onLocalId?.(messageId);
  }

  const mentions: string[] = params.message.mentionedUserIds.filter((uid: string) => uid !== params.senderId);
  const stored: StoredMessage = {
    conversationType: params.conversationType,
    senderId: params.senderId,
    text,
    target: params.message.target,
    createdAt: await serverAlignedNow(),
    ...(mentions.length > 0
      ? { mentionedUserIds: Object.fromEntries(mentions.map((uid: string) => [uid, true as const])) }
      : {}),
  };

  const write: Promise<void> = set(messageRef, stored);
  const result: Timed<void> = await runWithDeadline(write, RTDB_TIMEOUT_MS);
  if (result.status === 'timeout') {
    write.then(
      (): void => params.onDeadlineExceededSettled?.(true),
      (): void => params.onDeadlineExceededSettled?.(false),
    );
    throw createAppError('Tempo esgotado ao enviar a mensagem. Verifique sua conexão e tente novamente.');
  }
  if (result.status === 'failed') {
    throw result.error;
  }
  return {
    id: messageId,
    conversationId: params.conversationId,
    conversationType: stored.conversationType,
    senderId: stored.senderId,
    text: stored.text,
    target: stored.target,
    mentionedUserIds: mentions,
    createdAt: stored.createdAt,
  };
};

// ---- push request (team API) ---------------------------------------------------

export type PushRequestResult =
  | { status: 'sent' | 'duplicate' | 'no_recipients' | 'no_devices'; recipients: number; delivered: number }
  | { status: 'failed'; message: string };

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asks the API to push a message that is already persisted. Only ids are
 * sent: the API re-reads the message, checks the sender and computes the
 * recipients itself. The endpoint is idempotent, so network failures are
 * retried safely without ever duplicating a notification.
 */
export const requestMessagePush = async (conversationId: string, messageId: string): Promise<PushRequestResult> => {
  let lastMessage = 'Não foi possível enviar a notificação.';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const body: unknown = await apiRequest('POST', '/notifications/messages', { conversationId, messageId });
      const status: unknown = isRecord(body) ? body.status : null;
      const recipients: unknown = isRecord(body) ? body.recipients : 0;
      const delivered: unknown = isRecord(body) ? body.delivered : 0;
      if (status === 'sent' || status === 'duplicate' || status === 'no_recipients' || status === 'no_devices') {
        return {
          status,
          recipients: typeof recipients === 'number' ? recipients : 0,
          delivered: typeof delivered === 'number' ? delivered : 0,
        };
      }
      return { status: 'failed', message: lastMessage };
    } catch (error: unknown) {
      if (isApiError(error) && error.status < 500) {
        return { status: 'failed', message: error.message };
      }
      lastMessage = error instanceof Error ? error.message : lastMessage;
      await wait(800 * (attempt + 1));
    }
  }
  return { status: 'failed', message: lastMessage };
};

// ---- read marks & connectivity (Realtime Database) -------------------------------

export const markConversationRead = async (conversationId: string, meUid: string): Promise<void> => {
  await set(ref(database, `readMarks/${conversationId}/${meUid}`), await serverAlignedNow());
};

export const subscribeToReadMark = (
  conversationId: string,
  meUid: string,
  onChange: (readAt: number) => void,
): (() => void) =>
  onValue(
    ref(database, `readMarks/${conversationId}/${meUid}`),
    (snapshot: DataSnapshot) => {
      const raw: unknown = snapshot.val();
      onChange(typeof raw === 'number' ? raw : 0);
    },
    () => onChange(0),
  );

/** Realtime Database connection state, used for the offline banner. */
export const subscribeToConnection = (onChange: (connected: boolean) => void): (() => void) =>
  onValue(ref(database, '.info/connected'), (snapshot: DataSnapshot) => onChange(snapshot.val() === true));

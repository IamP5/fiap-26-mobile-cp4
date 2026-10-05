import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ensureDirectConversation,
  markConversationRead,
  requestMessagePush,
  sendMessage,
  subscribeToMessages,
  type PushRequestResult,
} from '../services/chatService';
import type { ChatMessage, ConversationType, DisplayMessage, OutgoingMessage } from '../types/chat';
import { otherParticipant } from '../utils/conversationId';
import { translateFirebaseError } from '../utils/errors';

/**
 * One optimistic send. `serverId` is stamped synchronously with the RTDB key
 * (before the write settles), and the entry is dropped only when the write
 * is acknowledged by the server — an RTDB local echo is not proof of delivery.
 */
type PendingEntry = {
  localId: string;
  message: OutgoingMessage;
  createdAt: number;
  status: 'sending' | 'failed';
  serverId?: string;
};

export type UseChatResult = {
  messages: DisplayMessage[];
  loading: boolean;
  error: string | null;
  /** The user lost access (removed from the group or group deleted). */
  accessLost: boolean;
  /** Message saved but the push request failed. Non-blocking. */
  pushWarning: string | null;
  dismissPushWarning: () => void;
  send: (message: OutgoingMessage) => void;
  resend: (localId: string) => void;
  retry: () => void;
};

const FIRST_SNAPSHOT_TIMEOUT_MS = 12000;

const isPermissionDenied = (error: unknown): boolean => {
  const text: string = error instanceof Error ? error.message : String(error);
  return /permission[_ ]denied/i.test(text);
};

/**
 * Messages of one conversation, live from the Realtime Database. The listener
 * is replaced when the conversation changes and removed on unmount. After each
 * persisted message, the API is asked to push it.
 */
export const useChat = (
  conversationId: string,
  conversationType: ConversationType,
  meUid: string,
  canSend: boolean,
): UseChatResult => {
  const [ready, setReady] = useState<boolean>(false);
  const [serverMessages, setServerMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState<boolean>(false);
  const [pushWarning, setPushWarning] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState<number>(0);

  const mountedRef = useRef<boolean>(true);
  const counterRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Direct conversations need their Firestore document (it is what the API
  // checks before pushing, and what lets both users see each other's
  // profile). Creating it is idempotent.
  useEffect(() => {
    let active = true;
    setReady(false);
    setLoading(true);
    setError(null);
    setAccessLost(false);
    setServerMessages([]);
    setPending([]);

    if (conversationType === 'group') {
      setReady(true);
      return undefined;
    }
    const otherUid: string | null = otherParticipant(conversationId, meUid);
    if (otherUid === null) {
      setError('Conversa inválida.');
      setLoading(false);
      return undefined;
    }
    ensureDirectConversation(meUid, otherUid)
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch((initError: unknown) => {
        if (active) {
          setError(translateFirebaseError(initError));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [conversationId, conversationType, meUid, retryToken]);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      if (active) {
        setError('Tempo esgotado ao carregar as mensagens. Verifique sua conexão e tente novamente.');
        setLoading(false);
      }
    }, FIRST_SNAPSHOT_TIMEOUT_MS);

    const unsubscribe = subscribeToMessages(
      conversationId,
      (next: ChatMessage[]) => {
        if (!active) {
          return;
        }
        clearTimeout(timer);
        setServerMessages(next);
        setError(null);
        setLoading(false);
      },
      (subscriptionError: unknown) => {
        if (!active) {
          return;
        }
        clearTimeout(timer);
        if (isPermissionDenied(subscriptionError)) {
          setAccessLost(true);
        } else {
          setError(translateFirebaseError(subscriptionError));
        }
        setLoading(false);
      },
    );
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [conversationId, ready]);

  // Read mark: newest message from someone else that I have now seen.
  const lastMarkedRef = useRef<number>(0);
  useEffect(() => {
    lastMarkedRef.current = 0;
  }, [conversationId]);
  useEffect(() => {
    const latestFromOthers: number = serverMessages.reduce(
      (max: number, m: ChatMessage) => (m.senderId !== meUid && m.createdAt > max ? m.createdAt : max),
      0,
    );
    if (latestFromOthers > lastMarkedRef.current) {
      lastMarkedRef.current = latestFromOthers;
      markConversationRead(conversationId, meUid).catch(() => undefined);
    }
  }, [conversationId, serverMessages, meUid]);

  const markFailed = useCallback((localId: string): void => {
    setPending((prev: PendingEntry[]) =>
      prev.map((p: PendingEntry) => (p.localId === localId ? { ...p, status: 'failed' } : p)),
    );
  }, []);

  const notifyServer = useCallback(
    (messageId: string): void => {
      void requestMessagePush(conversationId, messageId).then((result: PushRequestResult) => {
        if (mountedRef.current && result.status === 'failed') {
          setPushWarning(`Mensagem enviada, mas a notificação falhou: ${result.message}`);
        }
      });
    },
    [conversationId],
  );

  const attemptSend = useCallback(
    (localId: string, message: OutgoingMessage, existingId?: string): void => {
      sendMessage({
        conversationId,
        conversationType,
        senderId: meUid,
        message,
        existingId,
        onLocalId: (id: string) => {
          if (mountedRef.current) {
            setPending((prev: PendingEntry[]) =>
              prev.map((p: PendingEntry) => (p.localId === localId ? { ...p, serverId: id } : p)),
            );
          }
        },
        onDeadlineExceededSettled: (delivered: boolean) => {
          if (mountedRef.current && delivered) {
            setPending((prev: PendingEntry[]) => prev.filter((p: PendingEntry) => p.localId !== localId));
          }
        },
      })
        .then((saved: ChatMessage) => {
          if (!mountedRef.current) {
            return;
          }
          setPending((prev: PendingEntry[]) => prev.filter((p: PendingEntry) => p.localId !== localId));
          // Persisted first, pushed second: the API re-reads the message.
          notifyServer(saved.id);
        })
        .catch(() => {
          if (mountedRef.current) {
            markFailed(localId);
          }
        });
    },
    [conversationId, conversationType, meUid, markFailed, notifyServer],
  );

  const send = useCallback(
    (message: OutgoingMessage): void => {
      const text: string = message.text.trim();
      if (text.length === 0) {
        return;
      }
      counterRef.current += 1;
      const localId = `local-${counterRef.current}`;
      const entry: PendingEntry = {
        localId,
        message: { ...message, text },
        createdAt: Date.now(),
        status: ready && canSend ? 'sending' : 'failed',
      };
      setPending((prev: PendingEntry[]) => [...prev, entry]);
      if (ready && canSend) {
        attemptSend(localId, entry.message);
      }
    },
    [attemptSend, ready, canSend],
  );

  const resend = useCallback(
    (localId: string): void => {
      const entry: PendingEntry | undefined = pending.find((p: PendingEntry) => p.localId === localId);
      if (entry === undefined || !canSend) {
        return;
      }
      setPending((prev: PendingEntry[]) =>
        prev.map((p: PendingEntry) => (p.localId === localId ? { ...p, status: 'sending' } : p)),
      );
      attemptSend(localId, entry.message, entry.serverId);
    },
    [attemptSend, pending, canSend],
  );

  const retry = useCallback((): void => setRetryToken((prev: number) => prev + 1), []);
  const dismissPushWarning = useCallback((): void => setPushWarning(null), []);

  const messages = useMemo<DisplayMessage[]>(() => {
    // While a send is unacknowledged its pending bubble is authoritative, so
    // the RTDB local echo with the same id is hidden.
    const unacked = new Set(
      pending.map((p: PendingEntry) => p.serverId).filter((id): id is string => id !== undefined),
    );
    const confirmed: DisplayMessage[] = serverMessages.filter((m: ChatMessage) => !unacked.has(m.id));
    const optimistic: DisplayMessage[] = pending.map((p: PendingEntry) => ({
      id: p.serverId ?? p.localId,
      conversationId,
      conversationType,
      senderId: meUid,
      text: p.message.text,
      target: p.message.target,
      mentionedUserIds: p.message.mentionedUserIds,
      createdAt: p.createdAt,
      status: p.status,
      localId: p.localId,
    }));
    return [...confirmed, ...optimistic].sort((a, b) => a.createdAt - b.createdAt);
  }, [serverMessages, pending, conversationId, conversationType, meUid]);

  return {
    messages,
    loading,
    error,
    accessLost,
    pushWarning,
    dismissPushWarning,
    send,
    resend,
    retry,
  };
};


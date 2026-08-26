import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ensureConversation,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
  subscribeToReceipts,
} from '../services/chatService';
import type { ChatMessage, Conversation, DisplayMessage, ReceiptMarks } from '../types/chat';
import type { ChatUser } from '../types/user';
import { createAppError, translateFirebaseError } from '../utils/errors';

/**
 * One optimistic, not-yet-settled send. `serverId` is stamped synchronously
 * from `sendMessage`'s `onLocalId` callback — i.e. before the write's promise
 * settles, and before RTDB's own local echo of that write can possibly reach
 * `subscribeToMessages`. The entry is removed ONLY when `sendMessage` itself
 * resolves (a real server ack), never by pattern-matching the server
 * snapshot: a message appearing in that snapshot is not proof of delivery —
 * RTDB raises the local echo for a write it has queued but not yet acked, so
 * treating "present in the snapshot" as "delivered" would mark a send
 * confirmed (and delete its retry affordance) while it is still in flight or
 * about to fail.
 */
type PendingEntry = {
  localId: string;
  text: string;
  createdAt: number;
  status: 'sending' | 'failed';
  serverId?: string;
};

export type UseChatResult = {
  messages: DisplayMessage[];
  conversation: Conversation | null;
  loading: boolean;
  error: string | null;
  /** The OTHER user's receipt watermarks — drive the ticks on my messages. */
  otherDeliveredAt: number;
  otherReadAt: number;
  send: (text: string) => void;
  resend: (localId: string) => void;
  retryInit: () => void;
};

const EMPTY_MARKS: ReceiptMarks = { deliveredAt: 0, readAt: 0 };

/** Deadline for the first `onValue` payload of a conversation's messages. */
const FIRST_SNAPSHOT_TIMEOUT_MS = 12000;

const FIRST_SNAPSHOT_TIMEOUT_MESSAGE =
  'Tempo esgotado ao carregar as mensagens. Verifique sua conexão e tente novamente.';

export const useChat = (me: ChatUser, other: ChatUser): UseChatResult => {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [serverMessages, setServerMessages] = useState<ChatMessage[]>([]);
  const [marks, setMarks] = useState<Record<string, ReceiptMarks>>({});
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState<number>(0);

  const mountedRef = useRef<boolean>(true);
  // The screens rebuild `me`/`other` on every render, so the effects below key
  // off the uids while always reading the freshest objects from these refs.
  const meRef = useRef<ChatUser>(me);
  const otherRef = useRef<ChatUser>(other);
  const conversationRef = useRef<Conversation | null>(null);
  const pendingCounterRef = useRef<number>(0);

  useEffect(() => {
    meRef.current = me;
    otherRef.current = other;
  }, [me, other]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
    };
  }, []);

  const meUid: string = me.uid;
  const otherUid: string = other.uid;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setConversation(null);
    setServerMessages(() => []);
    setPending(() => []);

    ensureConversation(meRef.current, otherRef.current)
      .then((created) => {
        if (!active) {
          return;
        }
        // `loading` stays true until the first message snapshot arrives so the
        // "Nenhuma mensagem ainda" empty state is never shown for a conversation
        // that actually has history.
        setConversation(created);
      })
      .catch((initError: unknown) => {
        if (!active) {
          return;
        }
        setError(translateFirebaseError(initError));
        setLoading(false);
      });

    return (): void => {
      active = false;
    };
  }, [meUid, otherUid, retryToken, meRef, otherRef]);

  const conversationId: string | null =
    conversation === null ? null : conversation.id;

  useEffect(() => {
    if (conversationId === null) {
      return;
    }

    let active = true;

    const timer = setTimeout((): void => {
      if (!active) {
        return;
      }
      setError(translateFirebaseError(createAppError(FIRST_SNAPSHOT_TIMEOUT_MESSAGE)));
      setLoading(false);
    }, FIRST_SNAPSHOT_TIMEOUT_MS);

    const unsubscribe = subscribeToMessages(
      conversationId,
      (next) => {
        if (!active) {
          return;
        }
        clearTimeout(timer);
        setServerMessages(() => [...next]);
        setError(null);
        setLoading(false);
      },
      (subscriptionError) => {
        if (!active) {
          return;
        }
        clearTimeout(timer);
        setError(translateFirebaseError(subscriptionError));
        setLoading(false);
      },
    );

    return (): void => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [conversationId]);

  useEffect(() => {
    if (conversationId === null) {
      return;
    }
    setMarks(() => ({}));
    // Receipt errors are non-fatal by design: before the conversation node
    // exists the read rule denies this subscription, which just means "no
    // receipts yet" — ticks render as plain sent.
    const unsubscribe = subscribeToReceipts(
      conversationId,
      (next) => setMarks(() => ({ ...next })),
      () => {},
    );
    return (): void => {
      unsubscribe();
    };
  }, [conversationId]);

  // Read watermark: while this chat is open (this hook only lives while the
  // chat screen is mounted), any message from the other user newer than my
  // readAt bumps it — one write per incoming burst, guarded by the ref so a
  // slow round-trip doesn't loop.
  const lastMarkedReadRef = useRef<number>(0);
  const myReadAt: number = marks[meUid]?.readAt ?? 0;

  useEffect(() => {
    if (conversationId === null) {
      return;
    }
    const latestFromOther: number = serverMessages.reduce(
      (max, m) => (m.senderId === otherUid && m.createdAt > max ? m.createdAt : max),
      0,
    );
    if (latestFromOther > Math.max(myReadAt, lastMarkedReadRef.current)) {
      lastMarkedReadRef.current = latestFromOther;
      markConversationRead(conversationId, meUid).catch(() => {});
    }
  }, [conversationId, serverMessages, myReadAt, meUid, otherUid]);

  const attemptSend = useCallback(
    (localId: string, text: string, existingId?: string): void => {
      const conv: Conversation | null = conversationRef.current;
      if (conv === null) {
        setPending((prev) =>
          prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)),
        );
        return;
      }
      sendMessage({
        conversation: conv,
        senderId: meUid,
        receiverId: otherUid,
        text,
        // A retry reuses the original write's location instead of pushing a
        // fresh key — see the `existingId` doc in chatService.ts for why.
        existingId,
        // Stamped synchronously, before the write is even issued — see the
        // PendingEntry comment above for why this must not wait on the
        // subscription snapshot.
        onLocalId: (id) => {
          if (!mountedRef.current) {
            return;
          }
          setPending((prev) =>
            prev.map((p) => (p.localId === localId ? { ...p, serverId: id } : p)),
          );
        },
        // A `set()` that hit the 12s deadline is NOT cancelled — it is still
        // queued and will be committed on reconnect. Without this, a send
        // that times out while offline and is later flushed from RTDB's
        // queue would stay a permanent "failed" bubble forever even though
        // the recipient actually received it. Only a genuine late ack
        // retires the entry; a late definitive rejection leaves it 'failed'
        // so the retry affordance stays available.
        onDeadlineExceededSettled: (delivered) => {
          if (!mountedRef.current || !delivered) {
            return;
          }
          setPending((prev) => prev.filter((p) => p.localId !== localId));
        },
      })
        .then(() => {
          if (!mountedRef.current) {
            return;
          }
          // A real server ack — and only a real server ack — retires the
          // optimistic entry. The confirmed message then renders straight
          // from `serverMessages` (status undefined, i.e. the check glyph).
          setPending((prev) => prev.filter((p) => p.localId !== localId));
        })
        .catch(() => {
          if (!mountedRef.current) {
            return;
          }
          setPending((prev) =>
            prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)),
          );
        });
    },
    [meUid, otherUid],
  );

  const send = useCallback(
    (text: string): void => {
      const trimmed: string = text.trim();
      if (trimmed.length === 0) {
        return;
      }
      pendingCounterRef.current += 1;
      const localId = `local-${pendingCounterRef.current}`;
      const createdAt: number = Date.now();
      const conversationReady: boolean = conversationRef.current !== null;

      setPending((prev) => [
        ...prev,
        { localId, text: trimmed, createdAt, status: conversationReady ? 'sending' : 'failed' },
      ]);

      // A conversation that is not ready yet still gets a bubble — it just
      // starts (and stays) failed instead of being attempted, so the user's
      // text lives in a retryable bubble instead of a toast.
      if (conversationReady) {
        attemptSend(localId, trimmed);
      }
    },
    [attemptSend],
  );

  const resend = useCallback(
    (localId: string): void => {
      setPending((prev) => {
        const entry = prev.find((p) => p.localId === localId);
        if (entry === undefined) {
          return prev;
        }
        // Fire the retry outside the updater (state setters must stay pure),
        // reading the text and the already-stamped serverId captured above —
        // reusing it (rather than letting sendMessage push a new key) is what
        // keeps a retry from writing a second, duplicate message once the
        // original timed-out write also lands.
        const existingId = entry.serverId;
        queueMicrotask((): void => {
          attemptSend(localId, entry.text, existingId);
        });
        return prev.map((p) => (p.localId === localId ? { ...p, status: 'sending' } : p));
      });
    },
    [attemptSend],
  );

  const retryInit = useCallback((): void => {
    setRetryToken((prev) => prev + 1);
  }, []);

  const messages = useMemo<DisplayMessage[]>(() => {
    // A pending entry with a `serverId` may already have an RTDB local echo
    // sitting in `serverMessages` — that echo is not proof of delivery (see
    // the PendingEntry comment), so while the send is still unacked the
    // pending bubble stays authoritative and its server-side twin is hidden
    // to avoid rendering both.
    const unackedServerIds = new Set(
      pending.map((p) => p.serverId).filter((id): id is string => id !== undefined),
    );
    const serverPart: DisplayMessage[] = serverMessages.filter(
      (m) => !unackedServerIds.has(m.id),
    );
    const pendingPart: DisplayMessage[] = pending.map((p) => ({
      id: p.serverId ?? p.localId,
      conversationId: conversationRef.current?.id ?? '',
      senderId: meUid,
      receiverId: otherUid,
      text: p.text,
      createdAt: p.createdAt,
      status: p.status,
      localId: p.localId,
    }));
    return [...serverPart, ...pendingPart].sort((a, b) => a.createdAt - b.createdAt);
  }, [serverMessages, pending, meUid, otherUid]);

  const otherMarks: ReceiptMarks = marks[otherUid] ?? EMPTY_MARKS;

  return useMemo<UseChatResult>(
    () => ({
      messages,
      conversation,
      loading,
      error,
      otherDeliveredAt: otherMarks.deliveredAt,
      otherReadAt: otherMarks.readAt,
      send,
      resend,
      retryInit,
    }),
    [messages, conversation, loading, error, otherMarks.deliveredAt, otherMarks.readAt, send, resend, retryInit],
  );
};

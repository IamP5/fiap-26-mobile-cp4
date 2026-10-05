import type { ConversationType } from '../types/chat';

/**
 * Direct conversation id: both uids sorted and joined by '_'. The same pair
 * always produces the same id, so two users can never end up with two
 * different direct conversations. Firebase uids and Firestore auto ids are
 * alphanumeric, so only direct ids contain '_'.
 */
export const buildDirectConversationId = (uidA: string, uidB: string): string =>
  uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;

export const parseDirectConversationId = (
  conversationId: string,
): [string, string] | null => {
  const parts: string[] = conversationId.split('_');
  const first: string | undefined = parts[0];
  const second: string | undefined = parts[1];
  if (parts.length !== 2 || first === undefined || second === undefined) {
    return null;
  }
  if (first.length === 0 || second.length === 0 || first >= second) {
    return null;
  }
  return [first, second];
};

export const otherParticipant = (conversationId: string, meUid: string): string | null => {
  const pair = parseDirectConversationId(conversationId);
  if (pair === null) {
    return null;
  }
  if (pair[0] === meUid) {
    return pair[1];
  }
  return pair[1] === meUid ? pair[0] : null;
};

export const conversationTypeOf = (conversationId: string): ConversationType =>
  parseDirectConversationId(conversationId) === null ? 'group' : 'direct';

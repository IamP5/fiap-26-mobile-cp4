// Pure, generic — deliberately does NOT import from src/types/chat.ts so it
// typechecks standalone against any message shape with the fields below.

export type GroupableMessage = { id: string; senderId: string; createdAt: number };

export const GROUP_WINDOW_MS = 60000;

export type ChatRow<M> =
  | { kind: 'day'; key: string; timestamp: number; label: string }
  | { kind: 'message'; key: string; message: M; isMine: boolean; isFirstInGroup: boolean; isLastInGroup: boolean };

const startOfDayTs = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const isSameCalendarDay = (a: number, b: number): boolean => startOfDayTs(a) === startOfDayTs(b);

const WEEKDAYS: readonly string[] = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

// Local copy of the day-label rule (kept in sync with src/utils/datetime.ts)
// so this file has zero imports and stays independently typecheckable.
const dayLabelFor = (dayStartTs: number, now: number): string => {
  const today = startOfDayTs(now);
  const diffDays: number = Math.round((today - dayStartTs) / 86400000);

  if (diffDays === 0) {
    return 'HOJE';
  }
  if (diffDays === 1) {
    return 'ONTEM';
  }
  if (diffDays > 1 && diffDays <= 6) {
    const d = new Date(dayStartTs);
    const weekday: string | undefined = WEEKDAYS[d.getDay()];
    return (weekday !== undefined ? weekday : '').toUpperCase();
  }

  const d = new Date(dayStartTs);
  const day: string = pad2(d.getDate());
  const month: string = pad2(d.getMonth() + 1);
  const year: number = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const buildChatRows = <M extends GroupableMessage>(
  messages: readonly M[],
  myUid: string,
  options?: { now?: number; groupWindowMs?: number }
): ChatRow<M>[] => {
  const now: number = options?.now ?? Date.now();
  const windowMs: number = options?.groupWindowMs ?? GROUP_WINDOW_MS;
  const count: number = messages.length;

  const breaksFromOlder = (curr: M, older: M | undefined): boolean => {
    if (older === undefined) {
      return true;
    }
    if (older.senderId !== curr.senderId) {
      return true;
    }
    if (curr.createdAt - older.createdAt > windowMs) {
      return true;
    }
    if (!isSameCalendarDay(curr.createdAt, older.createdAt)) {
      return true;
    }
    return false;
  };

  // Mirror of breaksFromOlder tested against the NEWER neighbour — the time
  // window and day checks are not symmetric under naive argument-swapping
  // (curr - older vs newer - curr), so this needs its own definition rather
  // than reusing breaksFromOlder with swapped arguments.
  const breaksFromNewer = (curr: M, newer: M | undefined): boolean => {
    if (newer === undefined) {
      return true;
    }
    if (newer.senderId !== curr.senderId) {
      return true;
    }
    if (newer.createdAt - curr.createdAt > windowMs) {
      return true;
    }
    if (!isSameCalendarDay(curr.createdAt, newer.createdAt)) {
      return true;
    }
    return false;
  };

  // messages is oldest-first; build per-message flags first (order-independent
  // of the day grouping pass below), then assemble output newest-first.
  const isFirst: boolean[] = new Array<boolean>(count);
  const isLast: boolean[] = new Array<boolean>(count);
  messages.forEach((curr: M, i: number): void => {
    isFirst[i] = breaksFromOlder(curr, messages[i - 1]);
    isLast[i] = breaksFromNewer(curr, messages[i + 1]);
  });

  const rows: ChatRow<M>[] = [];
  // Walk oldest-first, emitting a day row right BEFORE the first (oldest)
  // message of each calendar day, then reverse the whole thing at the end.
  // Reversing flips "before the oldest message" into "immediately after the
  // oldest message" in the newest-first output, which is the documented
  // contract (it paints above that message on an inverted FlatList).
  messages.forEach((msg: M, i: number): void => {
    const prev = messages[i - 1];
    const dayStarts: boolean = prev === undefined || !isSameCalendarDay(msg.createdAt, prev.createdAt);
    if (dayStarts) {
      const dayStart: number = startOfDayTs(msg.createdAt);
      rows.push({
        kind: 'day',
        key: `day-${dayStart}`,
        timestamp: dayStart,
        label: dayLabelFor(dayStart, now),
      });
    }

    rows.push({
      kind: 'message',
      key: `msg-${msg.id}`,
      message: msg,
      isMine: msg.senderId === myUid,
      isFirstInGroup: isFirst[i] === true,
      isLastInGroup: isLast[i] === true,
    });
  });

  rows.reverse();
  return rows;
};

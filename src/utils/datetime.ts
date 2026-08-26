// Pure date/time formatting for pt-BR. Zero deps, no Intl/ICU — Hermes on
// Android does not ship a complete ICU data set, so weekday/month names come
// from local const arrays instead.

const WEEKDAYS: readonly string[] = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const WEEKDAYS_SHORT: readonly string[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

const startOfDay = (ts: number): Date => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const formatClock = (ts: number): string => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return '--:--';
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const isSameDay = (a: number, b: number): boolean => {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

export const formatDayLabel = (ts: number, now: number = Date.now()): string => {
  const target = startOfDay(ts);
  const today = startOfDay(now);
  const diffDays: number = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) {
    return 'HOJE';
  }
  if (diffDays === 1) {
    return 'ONTEM';
  }
  if (diffDays > 1 && diffDays <= 6) {
    const weekday: string | undefined = WEEKDAYS[target.getDay()];
    return (weekday !== undefined ? weekday : '').toUpperCase();
  }

  const day: string = pad2(target.getDate());
  const month: string = pad2(target.getMonth() + 1);
  const year: number = target.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatRelativeShort = (ts: number, now: number = Date.now()): string => {
  const target = startOfDay(ts);
  const today = startOfDay(now);
  const diffDays: number = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) {
    return formatClock(ts);
  }
  if (diffDays === 1) {
    return 'Ontem';
  }
  if (diffDays > 1 && diffDays <= 6) {
    const weekday: string | undefined = WEEKDAYS_SHORT[target.getDay()];
    return weekday !== undefined ? weekday : '';
  }

  const day: string = pad2(target.getDate());
  const month: string = pad2(target.getMonth() + 1);
  const year: string = pad2(target.getFullYear() % 100);
  return `${day}/${month}/${year}`;
};

export const formatFullDateTime = (ts: number): string => {
  const d = new Date(ts);
  const day: string = pad2(d.getDate());
  const month: string = pad2(d.getMonth() + 1);
  const year: number = d.getFullYear();
  const hours: string = pad2(d.getHours());
  const minutes: string = pad2(d.getMinutes());
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
};

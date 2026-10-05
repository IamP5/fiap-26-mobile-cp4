// Input masks and conversions for the registration form. Phone numbers are
// stored as digits with an optional leading '+'; birth dates as YYYY-MM-DD
// and shown as DD/MM/AAAA.

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** Live mask for Brazilian numbers: (11) 98765-4321. */
export const maskPhone = (value: string): string => {
  const digits: string = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) {
    return digits.length === 0 ? '' : `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/** Stored phone (E.164 with the Brazil code). */
export const normalizePhone = (masked: string): string | null => {
  const digits: string = onlyDigits(masked);
  return digits.length === 10 || digits.length === 11 ? `+55${digits}` : null;
};

export const formatPhone = (stored: string): string => {
  const digits: string = onlyDigits(stored);
  const national: string = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  return national.length >= 10 ? maskPhone(national) : stored;
};

/** Live mask: DD/MM/AAAA. */
export const maskDate = (value: string): string => {
  const digits: string = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const MIN_AGE_YEARS = 13;

/** DD/MM/AAAA -> YYYY-MM-DD, or an error message. */
export const parseBirthDate = (
  masked: string,
  now: Date = new Date(),
): { ok: true; iso: string } | { ok: false; error: string } => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (match === null) {
    return { ok: false, error: 'Informe a data de nascimento no formato DD/MM/AAAA.' };
  }
  const day: number = Number(match[1]);
  const month: number = Number(match[2]);
  const year: number = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, error: 'Data de nascimento inválida.' };
  }
  if (year < 1900 || date.getTime() > now.getTime()) {
    return { ok: false, error: 'Data de nascimento inválida.' };
  }
  const limit = new Date(Date.UTC(now.getUTCFullYear() - MIN_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()));
  if (date.getTime() > limit.getTime()) {
    return { ok: false, error: `É preciso ter pelo menos ${MIN_AGE_YEARS} anos para criar uma conta.` };
  }
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return { ok: true, iso };
};

export const formatBirthDate = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match === null ? iso : `${match[3]}/${match[2]}/${match[1]}`;
};

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

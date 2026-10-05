import {
  MAX_GROUP_NAME_LENGTH,
  MAX_MEMBER_LIMIT,
  MIN_GROUP_MEMBERS,
} from '../types/group';

// Client-side mirror of server/internal/domain. The UI validates first for
// instant feedback; the API re-validates inside a Firestore transaction, which
// is what actually guarantees the limit under concurrent requests.

export const validateGroupName = (name: string): string | null => {
  const trimmed: string = name.trim();
  if (trimmed.length === 0) {
    return 'Informe o nome do grupo.';
  }
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return `O nome do grupo deve ter no máximo ${MAX_GROUP_NAME_LENGTH} caracteres.`;
  }
  return null;
};

/** Parses the limit field: only whole numbers are accepted. */
export const parseMemberLimit = (raw: string): number | null => {
  const trimmed: string = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
};

export const validateMemberLimit = (limit: number | null, memberCount: number): string | null => {
  if (limit === null || !Number.isInteger(limit)) {
    return 'O limite deve ser um número inteiro.';
  }
  if (limit < MIN_GROUP_MEMBERS || limit > MAX_MEMBER_LIMIT) {
    return `O limite deve ficar entre ${MIN_GROUP_MEMBERS} e ${MAX_MEMBER_LIMIT} integrantes.`;
  }
  if (limit < memberCount) {
    return `O limite não pode ser menor que a quantidade atual de integrantes (${memberCount}).`;
  }
  return null;
};

export const validateMemberCount = (memberCount: number): string | null =>
  memberCount < MIN_GROUP_MEMBERS ? 'Selecione pelo menos um integrante além de você.' : null;

/** Free slots; never negative. The owner counts as a member. */
export const availableSlots = (limit: number, memberCount: number): number =>
  Math.max(limit - memberCount, 0);

export const slotsLabel = (limit: number, memberCount: number): string => {
  const free: number = availableSlots(limit, memberCount);
  if (free === 0) {
    return `${memberCount}/${limit} integrantes · grupo cheio`;
  }
  return `${memberCount}/${limit} integrantes · ${free} ${free === 1 ? 'vaga disponível' : 'vagas disponíveis'}`;
};

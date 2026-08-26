import type { AuthProvider, ChatUser } from '../types/user';

export type ProviderGroup = 'password' | 'oauth';

export const providerGroup = (provider: AuthProvider): ProviderGroup =>
  provider === 'password' ? 'password' : 'oauth';

export const canChat = (a: AuthProvider, b: AuthProvider): boolean =>
  providerGroup(a) !== providerGroup(b);

export const filterContacts = (all: readonly ChatUser[], me: ChatUser): ChatUser[] =>
  all.filter((user) => user.uid !== me.uid && canChat(me.provider, user.provider));

export const buildConversationId = (uidA: string, uidB: string): string =>
  [uidA, uidB].sort().join('_');

// Case- and diacritic-insensitive fold ("João" matches "joao"): NFD splits
// accented letters into base + combining mark, then the marks are stripped.
export const foldForSearch = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const providerLabel = (provider: AuthProvider): string => {
  switch (provider) {
    case 'password':
      return 'E-mail/Senha';
    case 'google':
      return 'Google';
    case 'apple':
      return 'Apple';
  }
};

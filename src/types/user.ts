export type AuthProvider = 'password' | 'google' | 'apple';

export type ChatUser = {
  uid: string;
  name: string;
  email: string | null;
  /** Provider profile picture (Google supplies one; Apple and e-mail/senha
   * accounts have none). null = fall back to initials. */
  photoUrl: string | null;
  provider: AuthProvider;
  createdAt: number;
};

export type StoredUser = {
  uid: string;
  name: string;
  email: string;
  photoUrl: string;
  provider: AuthProvider;
  createdAt: number;
};

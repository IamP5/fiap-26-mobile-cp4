import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '../contexts/AuthContext';

export const useAuth = (): AuthContextValue => {
  const context: AuthContextValue | null = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }

  return context;
};

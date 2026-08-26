/**
 * Error carrying a message that was authored by this app (already in pt-BR and
 * safe to show as-is). Everything else is translated through the tables below,
 * so raw English SDK strings never reach the UI.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const createAppError = (message: string): AppError => new AppError(message);

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

const NETWORK_MESSAGE = 'Falha de rede. Verifique sua conexão com a internet.';

const PERMISSION_MESSAGE =
  'Permissão negada pelo banco de dados. Verifique sua conexão, a data e a hora do ' +
  'aparelho e se você pode conversar com este contato.';

const MESSAGES: Readonly<Record<string, string>> = {
  'auth/invalid-email': 'E-mail inválido. Verifique o endereço digitado.',
  'auth/invalid-credential': 'Credenciais inválidas. Confira o e-mail e a senha.',
  'auth/invalid-login-credentials': 'Credenciais inválidas. Confira o e-mail e a senha.',
  'auth/wrong-password': 'Senha incorreta. Tente novamente.',
  'auth/user-not-found': 'Nenhuma conta encontrada com esse e-mail.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Faça login.',
  'auth/weak-password': 'A senha é muito fraca. Use pelo menos 6 caracteres.',
  'auth/missing-password': 'Informe a senha para continuar.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': NETWORK_MESSAGE,
  'auth/operation-not-allowed':
    'Este provedor de login não está habilitado no console do Firebase. Habilite-o em Authentication > Sign-in method.',
  'auth/configuration-not-found':
    'Configuração de autenticação não encontrada: o provedor não está habilitado no console do Firebase (Authentication > Sign-in method).',
  'auth/popup-closed-by-user': 'Login cancelado antes da conclusão.',
  'auth/account-exists-with-different-credential':
    'Já existe uma conta com este e-mail usando outro método de login.',
  'auth/requires-recent-login': 'Sessão expirada. Entre novamente para continuar.',
  'auth/internal-error': 'Erro interno na autenticação. Tente novamente em instantes.',
  PERMISSION_DENIED: PERMISSION_MESSAGE,
  ERR_REQUEST_CANCELED: 'Solicitação cancelada.',
  ERR_CANCELED: 'Solicitação cancelada.',
};

const extractCode = (error: unknown): string | null => {
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code: unknown = error.code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return null;
};

const extractMessage = (error: unknown): string | null => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message: unknown = error.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return null;
};

export const translateFirebaseError = (error: unknown): string => {
  // App-authored errors are already user-facing pt-BR text.
  if (error instanceof AppError) {
    return error.message;
  }

  const code = extractCode(error);
  if (code !== null) {
    const direct = MESSAGES[code];
    if (typeof direct === 'string') {
      return direct;
    }
  }

  const message = extractMessage(error);
  const haystack = `${code ?? ''} ${message ?? ''}`;

  const known = Object.keys(MESSAGES).find((key) => haystack.includes(key));
  if (typeof known === 'string') {
    const found = MESSAGES[known];
    if (typeof found === 'string') {
      return found;
    }
  }

  const lowered = haystack.toLowerCase();

  if (lowered.includes('permission_denied') || lowered.includes('permission denied')) {
    return PERMISSION_MESSAGE;
  }

  if (
    lowered.includes('network') ||
    lowered.includes('offline') ||
    lowered.includes('unavailable')
  ) {
    return NETWORK_MESSAGE;
  }

  // Unknown SDK errors are English; never surface them in a pt-BR UI.
  return GENERIC_MESSAGE;
};

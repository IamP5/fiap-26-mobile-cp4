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

/**
 * Error returned by the team's API: a stable machine `code` (used by the UI
 * to pick a state, e.g. GROUP_FULL) plus a pt-BR message authored by the
 * server and safe to display.
 */
export class ApiError extends AppError {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

const NETWORK_MESSAGE = 'Falha de rede. Verifique sua conexão com a internet.';

const PERMISSION_MESSAGE =
  'Você não tem permissão para acessar estes dados. Se foi removido de um grupo, ' +
  'ele não está mais disponível para você.';

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
    'O login por e-mail e senha não está habilitado no Firebase (Authentication > Sign-in method).',
  'auth/requires-recent-login': 'Sessão expirada. Entre novamente para continuar.',
  'auth/internal-error': 'Erro interno na autenticação. Tente novamente em instantes.',
  'auth/user-token-expired': 'Sessão expirada. Entre novamente.',
  'auth/invalid-user-token': 'Sessão expirada. Entre novamente.',
  PERMISSION_DENIED: PERMISSION_MESSAGE,
  'permission-denied': PERMISSION_MESSAGE,
  unauthenticated: 'Sessão expirada. Entre novamente.',
  unavailable: NETWORK_MESSAGE,
  'deadline-exceeded': 'O servidor demorou para responder. Tente novamente.',
  'resource-exhausted': 'Muitas solicitações em sequência. Aguarde um pouco e tente novamente.',
  'storage/unauthorized': 'Sem permissão para enviar esta imagem.',
  'storage/canceled': 'Envio da imagem cancelado.',
  'storage/retry-limit-exceeded': 'Não foi possível enviar a imagem. Verifique sua conexão.',
  'storage/quota-exceeded': 'Limite de armazenamento atingido. Tente novamente mais tarde.',
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

import { API_URL } from '../config/env';
import { ApiError, createAppError } from '../utils/errors';
import { auth } from './firebase';

/**
 * Client for the team's API. Every call carries the user's Firebase ID token
 * (the API verifies it with the Admin SDK); the SDK refreshes it when needed.
 * Cloud Run scales to zero, so the first call after a quiet period includes a
 * cold start: the timeout is generous on purpose.
 */
const API_TIMEOUT_MS = 20000;

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseApiError = (status: number, body: unknown): ApiError => {
  if (isRecord(body) && isRecord(body.error)) {
    const code: unknown = body.error.code;
    const message: unknown = body.error.message;
    if (typeof code === 'string' && typeof message === 'string') {
      return new ApiError(status, code, message);
    }
  }
  if (status >= 500) {
    return new ApiError(status, 'SERVER_ERROR', 'O servidor está indisponível no momento. Tente novamente.');
  }
  return new ApiError(status, 'HTTP_' + status, 'Não foi possível concluir a solicitação.');
};

/**
 * Sends a request and returns the parsed JSON body (unknown: each service
 * validates the shape it expects). Throws ApiError / AppError with pt-BR
 * messages.
 */
export const apiRequest = async (method: HttpMethod, path: string, body?: object): Promise<unknown> => {
  const user = auth.currentUser;
  if (user === null) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sessão expirada. Entre novamente.');
  }
  const idToken: string = await user.getIdToken();

  const controller = new AbortController();
  const timer = setTimeout((): void => controller.abort(), API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted
      ? createAppError('O servidor demorou para responder. Tente novamente.')
      : createAppError('Falha de rede ao falar com o servidor. Verifique sua conexão.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) {
    return null;
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw parseApiError(response.status, parsed);
  }
  return parsed;
};

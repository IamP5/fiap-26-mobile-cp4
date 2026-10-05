import { createAppError } from './errors';

/**
 * The Firebase SDKs queue reads/writes while offline with no deadline, so a
 * screen could spin forever. Every user-facing round-trip is raced against
 * an explicit timeout with a pt-BR message.
 */
export const withTimeout = <T,>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout((): void => {
      reject(createAppError(message));
    }, timeoutMs);
    operation.then(
      (value: T): void => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown): void => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const NETWORK_TIMEOUT_MS = 15000;

// JSON fetching for provider adapters: browser-originated, credential-free, validated.

import type { z } from 'zod';
import { ProviderError } from './types';

export interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function fetchJson<S extends z.ZodType>(
  providerId: string,
  url: string,
  schema: S,
  options: FetchJsonOptions = {},
): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted)
      throw new ProviderError(providerId, 'The provider did not respond in time.', error);
    throw new ProviderError(
      providerId,
      'The provider could not be reached (network or CORS failure).',
      error,
    );
  }
  if (!response.ok)
    throw new ProviderError(providerId, `The provider returned HTTP ${response.status}.`);
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new ProviderError(
      providerId,
      'The provider returned a response that is not valid JSON.',
      error,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError(
      providerId,
      `Unexpected response shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      parsed.error,
    );
  }
  return parsed.data;
}

/** Spaces calls to at most one per `intervalMs`, as some usage policies require. */
export function createRateGate(intervalMs: number) {
  let next = 0;
  return async (signal?: AbortSignal) => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + intervalMs;
    if (wait > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, wait);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
  };
}

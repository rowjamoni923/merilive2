/**
 * Universal API client — Layer 2 of the app-wide reliability stack.
 *
 * Wraps fetch / Supabase edge-function invokes with:
 *   - Auto session refresh on 401 (single retry)
 *   - Exponential backoff retry on network / 5xx (max 2 retries)
 *   - Timeout via AbortController (default 15s)
 *   - Unified ApiError shape so every caller handles errors the same way
 *   - "Quiet" errors for auth/session — no toast spam
 *
 * Designed to be additive: existing pages continue to work. New code (and
 * gradually-migrated pages) call `apiFetch` / `invokeEdge` / `apiQuery` and
 * automatically inherit the central behaviour.
 */
import { supabase } from '@/integrations/supabase/client';
import { triggerAuthGuard } from './authGuard';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'server'
  | 'validation'
  | 'unknown';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  quiet: boolean;
  cause?: unknown;
  constructor(kind: ApiErrorKind, message: string, opts: { status?: number; quiet?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = opts.status;
    this.quiet = opts.quiet ?? (kind === 'auth');
    this.cause = opts.cause;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'signal'> {
  /** ms before aborting. Default 15 000. Set 0 to disable. */
  timeoutMs?: number;
  /** Max retry attempts on network / 5xx. Default 2. */
  maxRetries?: number;
  /** External abort signal (composed with timeout). */
  signal?: AbortSignal;
  /** Skip auto auth refresh on 401 (for public endpoints). */
  skipAuthRetry?: boolean;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function composeSignal(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    timer = setTimeout(() => ctrl.abort(new ApiError('timeout', `Request timed out after ${timeoutMs}ms`)), timeoutMs);
  }
  if (external) {
    if (external.aborted) ctrl.abort(external.reason);
    else external.addEventListener('abort', () => ctrl.abort(external.reason), { once: true });
  }
  return { signal: ctrl.signal, cancel: () => { if (timer) clearTimeout(timer); } };
}

async function refreshSessionOnce(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Resilient fetch. Returns the raw Response on success.
 * Throws ApiError on failure after all retries / refresh attempts.
 */
export async function apiFetch(input: RequestInfo | URL, init: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT, maxRetries = DEFAULT_RETRIES, signal: externalSignal, skipAuthRetry, ...rest } = init;
  let attempt = 0;
  let authRetried = false;

  while (true) {
    const { signal, cancel } = composeSignal(externalSignal, timeoutMs);
    try {
      const res = await fetch(input, { ...rest, signal });
      cancel();

      if (res.status === 401 && !skipAuthRetry && !authRetried) {
        authRetried = true;
        const refreshed = await refreshSessionOnce();
        if (refreshed) continue;
        triggerAuthGuard('session_expired');
        throw new ApiError('auth', 'Session expired', { status: 401, quiet: true });
      }

      if (res.status >= 500 && attempt < maxRetries) {
        attempt += 1;
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }

      if (!res.ok) {
        throw new ApiError(res.status >= 500 ? 'server' : 'validation', `HTTP ${res.status}`, { status: res.status });
      }

      return res;
    } catch (err) {
      cancel();
      if (err instanceof ApiError) throw err;
      const aborted = (err as { name?: string })?.name === 'AbortError';
      if (aborted && externalSignal?.aborted) throw err;
      if (aborted) throw new ApiError('timeout', 'Request timed out');
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      throw new ApiError('network', (err as Error)?.message || 'Network error', { cause: err });
    }
  }
}

/**
 * Resilient wrapper around supabase.functions.invoke with the same guarantees.
 */
export async function invokeEdge<T = unknown>(
  name: string,
  body?: unknown,
  opts: { timeoutMs?: number; maxRetries?: number; skipAuthRetry?: boolean } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT, maxRetries = DEFAULT_RETRIES, skipAuthRetry } = opts;
  let attempt = 0;
  let authRetried = false;

  while (true) {
    const timeoutPromise = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new ApiError('timeout', `Edge function ${name} timed out`)), timeoutMs)
    );
    try {
      const result = await Promise.race([
        supabase.functions.invoke(name, body !== undefined ? { body } : undefined),
        timeoutPromise,
      ]);
      const { data, error } = result as { data: T | null; error: { message?: string; context?: { status?: number } } | null };
      if (error) {
        const status = error?.context?.status;
        if (status === 401 && !skipAuthRetry && !authRetried) {
          authRetried = true;
          const refreshed = await refreshSessionOnce();
          if (refreshed) continue;
          triggerAuthGuard('session_expired');
          throw new ApiError('auth', 'Session expired', { status: 401, quiet: true });
        }
        if ((status ?? 0) >= 500 && attempt < maxRetries) {
          attempt += 1;
          await sleep(250 * 2 ** (attempt - 1));
          continue;
        }
        throw new ApiError(
          (status ?? 0) >= 500 ? 'server' : 'validation',
          error.message || `Edge function ${name} failed`,
          { status }
        );
      }
      return data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      throw new ApiError('network', (err as Error)?.message || `Edge function ${name} failed`, { cause: err });
    }
  }
}

/** Convenience: apiFetch + JSON parse. */
export async function apiJson<T = unknown>(input: RequestInfo | URL, init?: ApiFetchOptions): Promise<T> {
  const res = await apiFetch(input, init);
  return (await res.json()) as T;
}

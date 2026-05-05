import { getAdaptiveNetworkProfile } from './connectionProfile';
import { lockAdminRealtimeTables } from './adminRealtimeMutationGuard';

const BASE_BACKOFF_MS = 300;
const MAX_CACHE_ENTRIES = 300;
const READ_NETWORK_RETRY_ATTEMPTS = 2;

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const READ_METHODS = new Set(['GET', 'HEAD']);
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_REALTIME_EVENT = 'admin-table-update';

type RouteCircuitState = {
  failures: number;
  openUntil: number;
};

type CachedResponse = {
  response: Response;
  expiresAt: number;
  staleUntil: number;
};

let inFlightRequests = 0;
let lastRequestStartedAt = 0;
let backoffUntil = 0;
let consecutiveTransientFailures = 0;

const queue: Array<() => void> = [];
const inFlightGetRequests = new Map<string, Promise<Response>>();
const getResponseCache = new Map<string, CachedResponse>();
const routeCircuits = new Map<string, RouteCircuitState>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const releaseNext = () => {
  const { maxConcurrentRequests } = getAdaptiveNetworkProfile();
  if (inFlightRequests >= maxConcurrentRequests) return;
  const next = queue.shift();
  if (!next) return;
  inFlightRequests += 1;
  next();
};

const acquireSlot = async () => {
  const { maxConcurrentRequests } = getAdaptiveNetworkProfile();
  if (inFlightRequests < maxConcurrentRequests) {
    inFlightRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    queue.push(resolve);
  });
};

const releaseSlot = () => {
  inFlightRequests = Math.max(0, inFlightRequests - 1);
  releaseNext();
};

const waitForBackoffWindow = async () => {
  const waitMs = backoffUntil - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
};

const waitForRequestGap = async () => {
  const { healthyRequestGapMs, degradedRequestGapMs } = getAdaptiveNetworkProfile();
  // Skip gap entirely for fast connections (0ms gap)
  const currentTime = Date.now();
  const targetGap = backoffUntil > currentTime ? degradedRequestGapMs : healthyRequestGapMs;
  if (targetGap <= 0) {
    lastRequestStartedAt = currentTime;
    return;
  }
  const elapsed = currentTime - lastRequestStartedAt;
  const waitMs = targetGap - elapsed;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastRequestStartedAt = Date.now();
};

const markTransientFailure = () => {
  consecutiveTransientFailures = Math.min(consecutiveTransientFailures + 1, 5);
  const { maxBackoffMs } = getAdaptiveNetworkProfile();
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** (consecutiveTransientFailures - 1), maxBackoffMs);
  backoffUntil = Math.max(backoffUntil, Date.now() + delay);
};

const markHealthy = () => {
  consecutiveTransientFailures = 0;
  backoffUntil = 0;
};

const isAbortOrNetworkError = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as { name?: string; message?: string };
  const name = err.name?.toLowerCase() ?? '';
  const message = err.message?.toLowerCase() ?? '';

  return (
    name.includes('abort') ||
    message.includes('abort') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch')
  );
};

const toUrlString = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const toMethod = (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
};

const mergeHeaders = (input: RequestInfo | URL, init?: RequestInit) => {
  const merged = new Headers();

  if (typeof Request !== 'undefined' && input instanceof Request) {
    input.headers.forEach((value, key) => merged.set(key, value));
  }

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => merged.set(key, value));
  }

  return merged;
};

const getRouteKey = (url: string) => {
  try {
    return new URL(url, typeof location !== 'undefined' ? location.origin : 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
};

const clearReadCaches = () => {
  getResponseCache.clear();
  inFlightGetRequests.clear();
};

const extractSupabaseMutationTable = (url: string) => {
  try {
    const parsed = new URL(url, typeof location !== 'undefined' ? location.origin : 'http://localhost');
    const marker = '/rest/v1/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const resourcePath = parsed.pathname.slice(markerIndex + marker.length);
    const [resource] = resourcePath.split('/');
    if (!resource || resource === 'rpc') return null;

    return decodeURIComponent(resource);
  } catch {
    return null;
  }
};

const methodToEventType = (method: string): 'INSERT' | 'UPDATE' | 'DELETE' => {
  if (method === 'POST') return 'INSERT';
  if (method === 'DELETE') return 'DELETE';
  return 'UPDATE';
};

const broadcastAdminMutation = (url: string, method: string) => {
  if (typeof window === 'undefined') return;
  if (!MUTATION_METHODS.has(method)) return;
  if (!url.includes('/rest/v1/')) return;

  const table = extractSupabaseMutationTable(url);
  window.dispatchEvent(
    new CustomEvent(ADMIN_REALTIME_EVENT, {
      detail: {
        table: table ?? '*',
        eventType: methodToEventType(method),
      },
    })
  );
};

const getRequestKey = (url: string, method: string, headers: Headers) => {
  const auth = headers.get('authorization') ?? 'anon';
  const adminToken = headers.get('x-admin-token') ?? 'no-admin';
  const prefer = headers.get('prefer') ?? '';
  const range = headers.get('range') ?? '';
  return `${method}::${url}::${auth}::${adminToken}::${prefer}::${range}`;
};

const getCachedResponse = (requestKey: string, allowStale = false) => {
  const cached = getResponseCache.get(requestKey);
  if (!cached) return null;

  const now = Date.now();
  if (cached.staleUntil <= now) {
    getResponseCache.delete(requestKey);
    return null;
  }

  if (!allowStale && cached.expiresAt <= now) {
    return null;
  }

  return cached.response.clone();
};

const getFreshCachedResponse = (requestKey: string) => getCachedResponse(requestKey, false);
const getStaleCachedResponse = (requestKey: string) => getCachedResponse(requestKey, true);

const setCachedResponse = (requestKey: string, response: Response) => {
  const { responseCacheTtlMs, staleIfErrorMs } = getAdaptiveNetworkProfile();

  getResponseCache.set(requestKey, {
    response: response.clone(),
    expiresAt: Date.now() + responseCacheTtlMs,
    staleUntil: Date.now() + staleIfErrorMs,
  });

  if (getResponseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = getResponseCache.keys().next().value;
    if (oldestKey) getResponseCache.delete(oldestKey);
  }
};

const markRouteFailure = (routeKey: string) => {
  const { routeFailureThreshold, routeCircuitOpenMs } = getAdaptiveNetworkProfile();
  const current = routeCircuits.get(routeKey) ?? { failures: 0, openUntil: 0 };
  const nextFailures = Math.min(current.failures + 1, routeFailureThreshold + 3);
  const openUntil =
    nextFailures >= routeFailureThreshold
      ? Date.now() + routeCircuitOpenMs * (1 + Math.max(0, nextFailures - routeFailureThreshold))
      : current.openUntil;

  routeCircuits.set(routeKey, {
    failures: nextFailures,
    openUntil,
  });
};

const markRouteHealthy = (routeKey: string) => {
  const current = routeCircuits.get(routeKey);
  if (!current) return;

  const nextFailures = Math.max(0, current.failures - 1);
  if (nextFailures === 0) {
    routeCircuits.delete(routeKey);
    return;
  }

  routeCircuits.set(routeKey, {
    failures: nextFailures,
    openUntil: current.openUntil,
  });
};

const isRouteCircuitOpen = (routeKey: string) => {
  const { routeFailureThreshold } = getAdaptiveNetworkProfile();
  const state = routeCircuits.get(routeKey);
  if (!state) return false;

  if (state.openUntil <= Date.now()) {
    routeCircuits.set(routeKey, {
      failures: Math.min(state.failures, routeFailureThreshold - 1),
      openUntil: 0,
    });
    return false;
  }

  return state.failures >= routeFailureThreshold;
};

const buildThrottledResponse = () =>
  new Response(
    JSON.stringify({ message: 'Temporarily throttled to protect server. Please retry shortly.' }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'x-client-throttled': '1',
      },
    }
  );

const withTimeoutSignal = (timeoutMs: number, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = init?.signal;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    init: {
      ...init,
      signal: controller.signal,
    } as RequestInit,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
};

export const createSupabaseFetchGuard = (baseFetch: typeof fetch = fetch): typeof fetch => {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrlString(input);
    const method = toMethod(input, init);
    const headers = mergeHeaders(input, init);
    const routeKey = getRouteKey(url);
    const requestKey = getRequestKey(url, method, headers);
    const isReadRequest = READ_METHODS.has(method);
    const mutationTable = !isReadRequest && url.includes('/rest/v1/') ? extractSupabaseMutationTable(url) : null;

    if (mutationTable) {
      lockAdminRealtimeTables([mutationTable]);
    }

    if (isReadRequest) {
      const cached = getFreshCachedResponse(requestKey);
      if (cached) return cached;

      const existing = inFlightGetRequests.get(requestKey);
      if (existing) {
        const sharedResponse = await existing;
        return sharedResponse.clone();
      }

      if (isRouteCircuitOpen(routeKey)) {
        const stale = getStaleCachedResponse(requestKey);
        if (stale) return stale;
        return buildThrottledResponse();
      }
    }

    const requestPromise = (async () => {
      await waitForBackoffWindow();
      await acquireSlot();

      try {
        await waitForRequestGap();
        let lastError: unknown;
        const maxAttempts = isReadRequest ? READ_NETWORK_RETRY_ATTEMPTS + 1 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const timed = withTimeoutSignal(getAdaptiveNetworkProfile().requestTimeoutMs, init);

          try {
            const response = await baseFetch(input, timed.init);

            if (TRANSIENT_STATUS_CODES.has(response.status)) {
              markTransientFailure();
              markRouteFailure(routeKey);

              if (isReadRequest && attempt < maxAttempts - 1) {
                await sleep(BASE_BACKOFF_MS * (attempt + 1));
                continue;
              }

              if (isReadRequest) {
                const stale = getStaleCachedResponse(requestKey);
                if (stale) return stale;
              }
            } else {
              markHealthy();
              markRouteHealthy(routeKey);

              if (isReadRequest && response.ok) {
                setCachedResponse(requestKey, response);
              }

              if (!isReadRequest && response.ok && url.includes('/rest/v1/')) {
                clearReadCaches();
                if (mutationTable) {
                  lockAdminRealtimeTables([mutationTable]);
                }
                broadcastAdminMutation(url, method);
              }
            }

            return response;
          } catch (error) {
            lastError = error;
            if (isAbortOrNetworkError(error)) {
              markTransientFailure();
              markRouteFailure(routeKey);

              if (isReadRequest && attempt < maxAttempts - 1) {
                await sleep(BASE_BACKOFF_MS * (attempt + 1));
                continue;
              }

              if (isReadRequest) {
                const stale = getStaleCachedResponse(requestKey);
                if (stale) return stale;
              }
            }
            throw error;
          } finally {
            timed.cleanup();
          }
        }

        throw lastError;
      } catch (error) {
        if (isAbortOrNetworkError(error)) {
          markTransientFailure();
          markRouteFailure(routeKey);

          if (isReadRequest) {
            const stale = getStaleCachedResponse(requestKey);
            if (stale) return stale;
          }
        }
        throw error;
      } finally {
        releaseSlot();
      }
    })();

    if (isReadRequest) {
      inFlightGetRequests.set(requestKey, requestPromise);
      try {
        const response = await requestPromise;
        return response.clone();
      } finally {
        inFlightGetRequests.delete(requestKey);
      }
    }

    return requestPromise;
  };
};

type InstantRestCacheOptions = {
  namespace: string;
  ttlMs?: number;
  staleWhileRevalidateMs?: number;
  maxEntries?: number;
  skipUrl?: (url: string, method: string) => boolean;
};

type CachedResponse = {
  body: string;
  headers: Record<string, string>;
  status: number;
  statusText: string;
  storedAt: number;
};

const CACHE_PREFIX = "meri:instant-rest:";
const META_PREFIX = "meri:instant-rest-meta:";
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_SWR_MS = 10 * 60_000;
const DEFAULT_MAX_ENTRIES = 180;
let invalidationInstalled = false;

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const getHeaders = (input: RequestInfo | URL, init?: RequestInit): Headers => {
  const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return headers;
};

const isRestRead = (url: string, method: string): boolean => {
  if (method !== "GET" && method !== "HEAD") return false;
  if (!url.includes("/rest/v1/")) return false;
  if (url.includes("/auth/v1/") || url.includes("/storage/v1/")) return false;
  return true;
};

const isSensitiveBalanceRead = (url: string): boolean => {
  const decoded = decodeURIComponent(url).toLowerCase();
  if (!decoded.includes("/rest/v1/profiles") && !decoded.includes("/rest/v1/agencies")) return false;
  return /select=\*|diamonds|diamonds|beans|wallet_balance|diamond_balance|pending_earnings|weekly_earnings|total_beans/.test(decoded);
};

const makeCacheKey = (namespace: string, url: string, method: string, headers: Headers): string => {
  const vary = [
    method,
    url,
    headers.get("authorization") || "",
    headers.get("x-admin-token") || "",
    headers.get("range") || "",
    headers.get("prefer") || "",
  ].join("|");
  return `${CACHE_PREFIX}${namespace}:${hashString(vary)}`;
};

const rememberKey = (namespace: string, key: string, maxEntries: number) => {
  try {
    const metaKey = `${META_PREFIX}${namespace}`;
    const list = JSON.parse(sessionStorage.getItem(metaKey) || "[]") as string[];
    const next = [key, ...list.filter((item) => item !== key)].slice(0, maxEntries);
    sessionStorage.setItem(metaKey, JSON.stringify(next));
    list.slice(maxEntries).forEach((oldKey) => sessionStorage.removeItem(oldKey));
  } catch {
    // Cache is an optimization only.
  }
};

export const clearInstantRestCache = (namespace: string) => {
  if (typeof sessionStorage === "undefined") return;
  try {
    const metaKey = `${META_PREFIX}${namespace}`;
    const list = JSON.parse(sessionStorage.getItem(metaKey) || "[]") as string[];
    list.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.removeItem(metaKey);
  } catch {
    // Cache is an optimization only.
  }
};

export const installInstantRestCacheInvalidation = (namespace: string) => {
  if (invalidationInstalled || typeof window === "undefined") return;
  invalidationInstalled = true;

  const clear = () => clearInstantRestCache(namespace);
  window.addEventListener("app-sync", clear);
  window.addEventListener("admin-table-update", clear);
  window.addEventListener("notifications:change", clear);
  window.addEventListener("own-beans-updated", clear);
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith("meri:instant-rest:")) clear();
  });
};

const readCached = (key: string): CachedResponse | null => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CachedResponse) : null;
  } catch {
    return null;
  }
};

const toResponse = (cached: CachedResponse, method: string): Response => {
  const headers = new Headers(cached.headers);
  headers.set("x-merilive-cache", "hit");
  return new Response(method === "HEAD" ? null : cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
};

const storeResponse = async (namespace: string, key: string, method: string, response: Response, maxEntries: number) => {
  if (!response.ok && response.status !== 206 && response.status !== 304) return;
  try {
    const clone = response.clone();
    const headers: Record<string, string> = {};
    clone.headers.forEach((value, headerKey) => {
      if (!headerKey.toLowerCase().startsWith("set-cookie")) headers[headerKey] = value;
    });
    const cached: CachedResponse = {
      body: method === "HEAD" ? "" : await clone.text(),
      headers,
      status: response.status,
      statusText: response.statusText,
      storedAt: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(cached));
    rememberKey(namespace, key, maxEntries);
  } catch {
    try {
      const metaKey = `${META_PREFIX}${namespace}`;
      const list = JSON.parse(sessionStorage.getItem(metaKey) || "[]") as string[];
      list.slice(Math.floor(list.length / 2)).forEach((oldKey) => sessionStorage.removeItem(oldKey));
      sessionStorage.setItem(metaKey, JSON.stringify(list.slice(0, Math.floor(list.length / 2))));
    } catch {}
  }
};

// ============= Pkg-NetFix: timeout + silent retry =============
// 3G/flaky networks routinely "hang" a TCP connection forever, which freezes
// every Supabase call (including login, balance, profile fetch) until the user
// kills the app. We cap each request at REQUEST_TIMEOUT_MS and silently retry
// once with a tiny backoff on AbortError / network failures. Mirrors what
// Chamet/Bigo do — users on bad networks see a brief pause, never a stuck UI.
const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_BACKOFF_MS = 600;

const friendlyTimeoutError = () => {
  // Surface a readable message instead of the browser's raw
  // "signal is aborted without reason" DOMException text.
  const err = new Error('Network is slow. Please check your connection and try again.');
  err.name = 'NetworkTimeoutError';
  return err;
};

const fetchWithTimeoutAndRetry = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> => {
  // Don't add a timeout to streaming/upload bodies — Supabase storage uploads
  // and edge function streams can legitimately run >12s on slow links.
  const hasStreamBody = !!(init?.body && (init.body instanceof FormData || init.body instanceof Blob || init.body instanceof ReadableStream));
  if (hasStreamBody) return fetch(input, init);

  const externalSignal = init?.signal;
  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => ctrl.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);
    try {
      return await fetch(input, { ...(init || {}), signal: ctrl.signal });
    } catch (err) {
      // Translate our own timeout-driven abort into a friendly error so
      // toasts never show "signal is aborted without reason".
      if (timedOut && !externalSignal?.aborted) throw friendlyTimeoutError();
      throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };

  try {
    return await attempt();
  } catch (err) {
    // External cancel (component unmount, navigation) — propagate as-is.
    if (externalSignal?.aborted) throw err;
    // Network-down — let caller see the failure immediately, no retry.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw err;
    // One silent retry for transient failures (timeout, dropped TCP, 5xx-ish gateway).
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    return attempt();
  }
};


export function fetchWithInstantRestCache(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: InstantRestCacheOptions,
): Promise<Response> {
  const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
  const url = getUrl(input);
  const headers = getHeaders(input, init);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleWhileRevalidateMs = options.staleWhileRevalidateMs ?? DEFAULT_SWR_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  if (
    typeof window === "undefined" ||
    typeof sessionStorage === "undefined" ||
    !isRestRead(url, method) ||
    isSensitiveBalanceRead(url) ||
    options.skipUrl?.(url, method)
  ) {
    return fetchWithTimeoutAndRetry(input, init);
  }

  const key = makeCacheKey(options.namespace, url, method, headers);
  const cached = readCached(key);
  const now = Date.now();
  if (cached) {
    const age = now - cached.storedAt;
    if (age <= ttlMs) return Promise.resolve(toResponse(cached, method));
    if (age <= ttlMs + staleWhileRevalidateMs) {
      fetchWithTimeoutAndRetry(input, init)
        .then((response) => storeResponse(options.namespace, key, method, response, maxEntries))
        .catch(() => undefined);
      return Promise.resolve(toResponse(cached, method));
    }
  }

  return fetchWithTimeoutAndRetry(input, init).then((response) => {
    void storeResponse(options.namespace, key, method, response, maxEntries);
    return response;
  });
}
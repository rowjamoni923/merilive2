/**
 * ADMIN-ONLY Supabase Client
 *
 * This client is COMPLETELY isolated from the user app's Supabase client:
 * - Uses a separate localStorage key (`merilive-admin-auth`)
 * - Does NOT persist auth in the same place as the user app
 * - Admin authentication is custom (admin_authenticate RPC), NOT via auth.users
 *
 * Server-side admin session token (issued by admin_authenticate) is sent on every
 * request as the `x-admin-token` header. Postgres RLS uses
 * `public.is_active_admin_session()` to allow writes from the admin panel.
 *
 * The user app login/logout will NEVER affect admin panel session and vice-versa.
 */
import { createClient } from '@supabase/supabase-js';
import { clearAdminSession, getAdminSession, getAdminSessionToken } from '@/utils/adminSession';
import { getAdminLinkToken, revokeAdminAccess } from '@/utils/adminAccessStorage';
import { recordAdminError } from '@/utils/adminErrorLog';
import { clearInstantRestCache, fetchWithInstantRestCache } from '@/utils/instantRestCache';

const SUPABASE_URL = "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";

// Custom storage adapter scoped to admin panel — uses a different key prefix
// so it never collides with the regular user-app supabase client.
const ADMIN_STORAGE_PREFIX = 'merilive-admin-sb-';

const adminStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ADMIN_STORAGE_PREFIX + key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_STORAGE_PREFIX + key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ADMIN_STORAGE_PREFIX + key);
  },
};

const authLockQueue = new Map<string, Promise<unknown>>();
const inProcessAuthLock = async <R,>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  const previous = authLockQueue.get(name) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  authLockQueue.set(name, run.catch(() => undefined));
  return run;
};

/**
 * Performance: cap unbounded SELECTs and dedupe identical in-flight reads.
 *
 * - REST GET requests to /rest/v1/* without ?limit= get a defensive ?limit=500.
 *   Pages that explicitly use .range() or .limit() are untouched.
 * - In-flight identical GETs are coalesced for 250ms to absorb double-renders.
 */
const SAFETY_LIMIT = 500;
const DEDUPE_MS = 250;
const ADMIN_SESSION_PREFLIGHT_TTL_MS = 5 * 60 * 1000;
const ADMIN_SESSION_PREFLIGHT_TIMEOUT_MS = 5_000;
const inflight = new Map<string, { p: Promise<Response>; t: number }>();
let adminSessionPreflightUntil = 0;
let adminSessionPreflightPromise: Promise<boolean> | null = null;
let lastInvalidAdminRedirectAt = 0;

export const markAdminSessionPreflightValid = () => {
  adminSessionPreflightUntil = Date.now() + ADMIN_SESSION_PREFLIGHT_TTL_MS;
};

if (typeof window !== 'undefined') {
  const clearAdminReadCache = () => {
    adminSessionPreflightUntil = 0;
    clearInstantRestCache('admin');
  };
  window.addEventListener('admin-table-update', clearAdminReadCache);
  window.addEventListener('admin-session-change', clearAdminReadCache);
}

function urlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function applySafetyLimit(url: string): string {
  // Only enforce on REST table endpoints; never touch RPC / auth / storage.
  if (!url.includes('/rest/v1/')) return url;
  if (url.includes('/rest/v1/rpc/')) return url;
  // Already constrained
  if (/[?&](limit|range|offset)=/.test(url)) return url;
  // HEAD count requests are tiny — still cap defensively in case
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}limit=${SAFETY_LIMIT}`;
}

const redirectToAdminAuthAfterInvalidSession = () => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastInvalidAdminRedirectAt < 2_000) return;
  lastInvalidAdminRedirectAt = now;
  const linkToken = getAdminLinkToken();
  clearAdminSession();
  revokeAdminAccess();
  window.dispatchEvent(new Event('admin-session-change'));
  if (window.location.pathname.startsWith('/admin')) {
    const target = linkToken
      ? `https://merilive.com/admin/auth?access=${encodeURIComponent(linkToken)}`
      : 'https://merilive.com/admin/auth';
    window.location.replace(target);
  }
};

const buildInvalidAdminSessionResponse = () => new Response(JSON.stringify({
  message: 'Invalid admin session — reopen the admin secret link and log in again',
}), {
  status: 401,
  headers: { 'Content-Type': 'application/json' },
});

const ensureAdminSessionDeviceBound = (token: string): Promise<boolean> => {
  if (!token || Date.now() < adminSessionPreflightUntil) return Promise.resolve(true);

  const session = getAdminSession();
  const fingerprint = session?.device_fingerprint;
  if (!session?.admin_id || !fingerprint || fingerprint.length < 16) return Promise.resolve(true);

  if (adminSessionPreflightPromise) return adminSessionPreflightPromise;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ADMIN_SESSION_PREFLIGHT_TIMEOUT_MS);

  adminSessionPreflightPromise = fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_request_device_access`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
      'x-admin-token': token,
    },
    body: JSON.stringify({
      _admin_id: session.admin_id,
      _device_fingerprint: fingerprint,
      _device_name: session.display_name || null,
      _device_info: { ua: typeof navigator !== 'undefined' ? navigator.userAgent : null },
      _ip_address: null,
      _user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }),
  })
    .then(async (resp) => {
      if (!resp.ok) return true;
      const payload = await resp.json().catch(() => null) as any;
      const row = Array.isArray(payload) ? payload[0] : payload;
      if (row?.status === 'approved' || row?.success === true) {
        const verifyResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_admin_id_from_header`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            'content-type': 'application/json',
            'x-admin-token': token,
          },
          body: '{}',
        });
        if (!verifyResp.ok) return true;
        const verifiedAdminId = await verifyResp.json().catch(() => null);
        if (String(verifiedAdminId || '') === session.admin_id) {
          adminSessionPreflightUntil = Date.now() + ADMIN_SESSION_PREFLIGHT_TTL_MS;
          return true;
        }
      }
      redirectToAdminAuthAfterInvalidSession();
      return false;
    })
    .catch((error) => {
      console.warn('[adminClient] Admin session preflight failed; request will continue', error);
      return true;
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
      adminSessionPreflightPromise = null;
    });

  return adminSessionPreflightPromise;
};

/**
 * Custom fetch wrapper that attaches the admin session token header on every request,
 * applies a safety limit on unbounded SELECTs, and dedupes identical in-flight reads.
 * RLS on admin-managed tables checks for the header via `is_active_admin_session()`.
 */
const adminFetch: typeof fetch = (input, init) => {
  const token = getAdminSessionToken();
  const opts: RequestInit = init ? { ...init } : {};
  const headers = new Headers(opts.headers || {});
  if (token) headers.set('x-admin-token', token);
  opts.headers = headers;

  let url = urlString(input);
  const method = (opts.method || 'GET').toUpperCase();
  const isAdminRest = url.includes('/rest/v1/');
  const isAdminRpc = url.includes('/rest/v1/rpc/');
  const isLoginRpc = isAdminRpc && [
    'admin_authenticate',
    'admin_request_device_access',
    'admin_check_device_status',
  ].some((name) => url.includes(`/rest/v1/rpc/${name}`));

  // Do not let protected admin reads/RPCs fire without the dedicated server
  // session token. This prevents the dashboard from flashing and spamming
  // "admin only" errors when someone opens /admin without the secret link.
  if (!token && isAdminRest && !isLoginRpc) {
    const path = url.replace(SUPABASE_URL, '').split('?')[0];
    const message = 'No admin session token — open the admin panel from the secret link and log in again';
    recordAdminError({
      kind: isAdminRpc ? 'rpc' : 'rest',
      label: `${method} ${path}`,
      status: 401,
      message,
      detail: message,
      url,
      silent: true,
    });
    // 🛡️ NO AUTO-LOGOUT POLICY (Pkg359): do NOT force logout — admin stays on
    // current page, sees the error in dev console, and can manually re-login.
    return Promise.resolve(new Response(JSON.stringify({ message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  // Apply safety limit only on simple GET reads.
  if (method === 'GET' || method === 'HEAD') {
    url = applySafetyLimit(url);
  } else {
    clearInstantRestCache('admin');
  }

  // Broadcast cross-page refresh signal AFTER successful mutations so every
  // open admin tab/page re-reads its data instantly without manual refresh.
  const broadcastMutationIfNeeded = (resp: Response) => {
    if (typeof window === 'undefined') return;
    if (!resp.ok) return;
    if (method === 'GET' || method === 'HEAD') return;
    // Skip noisy preflight RPCs
    if (isLoginRpc) return;
    try {
      window.dispatchEvent(new CustomEvent('admin-table-update', {
        detail: { url: url.replace(SUPABASE_URL, '').split('?')[0], method },
      }));
    } catch { /* no-op */ }
  };

  // Transient-failure single retry: network error or 5xx/408/429 on idempotent
  // requests (GET/HEAD/RPC reads). Mutations are NOT auto-retried to avoid
  // double-writes. This eliminates flaky "RPC fail" toasts caused by edge
  // network blips without ever risking duplicate state changes.
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const shouldRetryStatus = (s: number) => s === 408 || s === 429 || (s >= 500 && s <= 599);
  const fetchOnce = (target: string, options: RequestInit) =>
    fetchWithInstantRestCache(target, options, {
      namespace: 'admin',
      ttlMs: 3_000,
      staleWhileRevalidateMs: 0,
      maxEntries: 320,
      skipUrl: (requestUrl) => requestUrl.includes('/rest/v1/rpc/') || requestUrl.includes('/rest/v1/notifications'),
    });
  const fetchWithRetry = async (target: string, options: RequestInit): Promise<Response> => {
    try {
      const r = isIdempotent ? await fetchOnce(target, options) : await fetch(target, options);
      if (isIdempotent && shouldRetryStatus(r.status)) {
        await new Promise((res) => setTimeout(res, 350));
        try {
          const r2 = await fetch(target, options);
          return r2;
        } catch { return r; }
      }
      return r;
    } catch (err) {
      if (isIdempotent) {
        await new Promise((res) => setTimeout(res, 350));
        return fetch(target, options);
      }
      throw err;
    }
  };

  // Helper to detect+log failures uniformly
  const logIfFailed = async (resp: Response): Promise<Response> => {
    if (resp.ok || resp.status === 304) return resp;
    // Skip noisy 401 from auth refresh probes
    let bodyText = '';
    try {
      const clone = resp.clone();
      bodyText = await clone.text();
    } catch { /* ignore */ }
    let parsedMsg = bodyText;
    try {
      const j = JSON.parse(bodyText);
      parsedMsg = j.message || j.error || j.msg || bodyText;
    } catch { /* not json */ }
    const path = url.replace(SUPABASE_URL, '').split('?')[0];
    const isRpc = url.includes('/rest/v1/rpc/');
    const isEdge = url.includes('/functions/v1/');
    const kind = isRpc ? 'rpc' : isEdge ? 'edge' : 'rest';
    const isAuthStatus = [400, 401, 403].includes(resp.status);
    const sessionExpired = isAuthStatus &&
      /not authorized|unauthorized|invalid.*session|session.*expired|jwt/i.test(parsedMsg);
    const accessDenied = isAuthStatus &&
      /access denied|admin only|permission denied|forbidden|insufficient/i.test(parsedMsg);
    const missingToken = isRpc && !isLoginRpc && !token && isAuthStatus;

    // 🛡️ NO AUTO-LOGOUT POLICY (Pkg359): record the auth error silently but do
    // NOT call forceAdminLogout(). Admin keeps current view; only manual logout
    // or single-device displacement may end the session.
    if ((sessionExpired || accessDenied || missingToken) && !isLoginRpc) {
      recordAdminError({
        kind,
        label: `${method} ${path}`,
        status: resp.status,
        message: missingToken
          ? 'No admin session token — please log in again'
          : sessionExpired
            ? `Admin session expired: ${String(parsedMsg).slice(0, 160)}`
            : `Access denied: ${String(parsedMsg).slice(0, 160)}`,
        detail: bodyText.slice(0, 1000),
        url,
        silent: true,
      });
      return resp;
    }

    recordAdminError({
      kind,
      label: `${method} ${path}`,
      status: resp.status,
      message: String(parsedMsg).slice(0, 300),
      detail: bodyText.slice(0, 1000),
      url,
    });
    return resp;
  };

  const sessionPreflight = token && isAdminRest && !isLoginRpc
    ? ensureAdminSessionDeviceBound(token)
    : Promise.resolve(true);

  // Dedupe identical in-flight reads (GET only, no body).
  if (method === 'GET') {
    const key = url + '|' + (headers.get('range') || '') + '|' + (headers.get('prefer') || '');
    const now = Date.now();
    const hit = inflight.get(key);
    if (hit && now - hit.t < DEDUPE_MS) {
      return hit.p.then((r) => r.clone());
    }
    const p = sessionPreflight.then((ok) => {
      if (!ok) return buildInvalidAdminSessionResponse();
      return fetchWithRetry(url, opts);
    }).then(logIfFailed).then((r) => { broadcastMutationIfNeeded(r); return r; });
    inflight.set(key, { p, t: now });
    p.finally(() => {
      setTimeout(() => {
        const cur = inflight.get(key);
        if (cur && cur.p === p) inflight.delete(key);
      }, DEDUPE_MS);
    });
    return p.then((r) => r.clone());
  }

  return sessionPreflight
    .then((ok) => ok ? fetchWithRetry(url, opts) : buildInvalidAdminSessionResponse())
    .then(logIfFailed)
    .then((r) => { broadcastMutationIfNeeded(r); return r; });
};

/**
 * adminSupabase: dedicated Supabase client for admin panel.
 * Use this for ALL admin panel database queries.
 * Does NOT share session with the user app.
 */
export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: adminFetch,
  },
  auth: {
    storage: adminStorage,
    storageKey: 'admin-session',
    persistSession: false, // We manage admin session manually via adminSession.ts
    autoRefreshToken: false,
    detectSessionInUrl: false,
    lock: inProcessAuthLock,
  },
});

const getSyntheticAdminUser = () => {
  const session = getAdminSession();
  if (!session) return null;

  return {
    id: session.admin_id,
    email: session.email,
    role: 'authenticated',
    app_metadata: {
      provider: 'admin-session',
      providers: ['admin-session'],
      admin_role: session.role,
      is_owner: session.is_owner,
    },
    user_metadata: {
      display_name: session.display_name,
      admin_role: session.role,
      is_owner: session.is_owner,
    },
    aud: 'authenticated',
  } as any;
};

const getSyntheticAdminSession = () => {
  const session = getAdminSession();
  const user = getSyntheticAdminUser();
  if (!session || !user) return null;

  return {
    access_token: SUPABASE_PUBLISHABLE_KEY,
    refresh_token: '',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 7,
    expires_at: Math.floor((session.signed_in_at + 7 * 24 * 60 * 60 * 1000) / 1000),
    user,
  } as any;
};

(adminSupabase.auth as any).getUser = async () => ({
  data: { user: getSyntheticAdminUser() },
  error: null,
});

(adminSupabase.auth as any).getSession = async () => ({
  data: { session: getSyntheticAdminSession() },
  error: null,
});

(adminSupabase.auth as any).refreshSession = async () => ({
  data: { session: getSyntheticAdminSession(), user: getSyntheticAdminUser() },
  error: null,
});

(adminSupabase.auth as any).onAuthStateChange = (callback: (event: string, session: any) => void) => {
  const emitInitial = () => callback('INITIAL_SESSION', getSyntheticAdminSession());
  if (typeof queueMicrotask === 'function') queueMicrotask(emitInitial);
  else setTimeout(emitInitial, 0);

  const handler = () => callback('SIGNED_IN', getSyntheticAdminSession());
  if (typeof window !== 'undefined') window.addEventListener('admin-session-change', handler);

  return {
    data: {
      subscription: {
        id: 'synthetic-admin-auth',
        callback,
        unsubscribe: () => {
          if (typeof window !== 'undefined') window.removeEventListener('admin-session-change', handler);
        },
      },
    },
  };
};

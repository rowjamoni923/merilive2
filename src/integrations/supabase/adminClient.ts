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
import { getAdminSession, getAdminSessionToken } from '@/utils/adminSession';
import { recordAdminError } from '@/utils/adminErrorLog';

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
const inflight = new Map<string, { p: Promise<Response>; t: number }>();

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

  // Apply safety limit only on simple GET reads.
  if (method === 'GET' || method === 'HEAD') {
    url = applySafetyLimit(url);
  }

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
    const isRpc = url.includes('/rest/v1/rpc/');
    const path = url.replace(SUPABASE_URL, '').split('?')[0];
    recordAdminError({
      kind: isRpc ? 'rpc' : 'rest',
      label: `${method} ${path}`,
      status: resp.status,
      message: String(parsedMsg).slice(0, 300),
      detail: bodyText.slice(0, 1000),
      url,
    });
    return resp;
  };

  // Dedupe identical in-flight reads (GET only, no body).
  if (method === 'GET') {
    const key = url + '|' + (headers.get('range') || '') + '|' + (headers.get('prefer') || '');
    const now = Date.now();
    const hit = inflight.get(key);
    if (hit && now - hit.t < DEDUPE_MS) {
      return hit.p.then((r) => r.clone());
    }
    const p = fetch(url, opts).then(logIfFailed);
    inflight.set(key, { p, t: now });
    p.finally(() => {
      setTimeout(() => {
        const cur = inflight.get(key);
        if (cur && cur.p === p) inflight.delete(key);
      }, DEDUPE_MS);
    });
    return p.then((r) => r.clone());
  }

  return fetch(url, opts).then(logIfFailed);
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

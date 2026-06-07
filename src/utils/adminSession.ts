/**
 * Admin Session Manager
 * 
 * COMPLETELY independent from user app Supabase auth.
 * Admin login uses `admin_authenticate` RPC (validates against admin_users table directly).
 * Session is stored in localStorage with a dedicated key.
 * 
 * Key principles:
 * - User app login/logout does NOT affect admin session
 * - Admin login does NOT create a Supabase auth.users session
 * - Owner: skips device approval entirely
 * - Sub-admin: requires owner device approval (one-time per device, permanent)
 */

const ADMIN_SESSION_KEY = 'merilive-admin-session';
const ADMIN_SESSION_VERSION = 'v2';
const APPROVED_DEVICES_KEY = 'merilive-admin-approved-devices';
const ADMIN_TOKEN_KEY = 'merilive-admin-token';
const ADMIN_SECRET_LINK_SESSION_KEY = 'meri_admin_link_token';

const hasWindow = () => typeof window !== 'undefined';

const parseStoredAdminSession = (raw: string | null): AdminSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (parsed?.version !== ADMIN_SESSION_VERSION) return null;
    if (!parsed.admin_id || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
};

const getBestStoredAdminSession = (): AdminSession | null => {
  if (!hasWindow()) return null;
  const sessionSession = parseStoredAdminSession(window.sessionStorage.getItem(ADMIN_SESSION_KEY));
  const localSession = parseStoredAdminSession(window.localStorage.getItem(ADMIN_SESSION_KEY));
  if (sessionSession && localSession) {
    return (localSession.signed_in_at || 0) > (sessionSession.signed_in_at || 0)
      ? localSession
      : sessionSession;
  }
  return sessionSession || localSession;
};

const isAdminAuthRoute = (): boolean => {
  if (!hasWindow()) return false;
  const path = window.location.pathname;
  return path === '/admin/auth' || path === '/admin/login';
};

export interface AdminSession {
  version: string;
  admin_id: string;
  email: string;
  display_name: string | null;
  role: 'owner' | 'sub_admin';
  is_owner: boolean;
  must_change_password: boolean;
  device_fingerprint: string;
  signed_in_at: number; // unix ms
  session_token?: string; // server-side admin session token (used as x-admin-token header)
}

/**
 * Read the current admin session token (used by adminClient as x-admin-token header).
 * Returns empty string when no session — header will be omitted by the fetch wrapper.
 */
export const getAdminSessionToken = (): string => {
  if (!hasWindow()) return '';
  try {
    // The session blob is the source of truth. A standalone token key can become
    // stale after re-login, pending-device flows, tab restore, or old migrations;
    // if we prefer that stale key, every admin page sends a dead x-admin-token and
    // every RPC fails with P0001 "unauthorized". Always read the current session
    // first, then hydrate/repair the standalone key from it.
    const parsed = getBestStoredAdminSession();
    if (parsed?.session_token && parsed.session_token.length >= 16) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, parsed.session_token);
      return parsed.session_token;
    }
    const direct = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    // During admin login / device approval, the server issues a temporary token
    // before the final session blob is saved. Also allow legacy saved sessions
    // whose session blob is valid but predates the `session_token` field; the
    // admin client now server-preflights this token before protected requests.
    if (direct && direct.length >= 16 && (isAdminAuthRoute() || !!parsed)) return direct;
    return '';
  } catch {
    return '';
  }
};

export const setAdminSessionToken = (token: string | null | undefined): void => {
  if (!hasWindow()) return;
  try {
    // CRITICAL: keep the standalone token key AND the session blob's
    // session_token field in sync. `getAdminSessionToken()` prefers the blob
    // (it's the source of truth). If we only wrote ADMIN_TOKEN_KEY here, a
    // stale blob left over from a previous login would still win and every
    // following admin RPC would send a dead x-admin-token, which the server
    // rejects with "Invalid admin session" — even though the user just
    // successfully re-authenticated.
    const existing = getBestStoredAdminSession();
    if (token && token.length >= 16) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
      if (existing && existing.session_token !== token) {
        const updated: AdminSession = { ...existing, session_token: token };
        const json = JSON.stringify(updated);
        window.localStorage.setItem(ADMIN_SESSION_KEY, json);
        window.sessionStorage.setItem(ADMIN_SESSION_KEY, json);
      }
    } else {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      if (existing && existing.session_token) {
        const updated: AdminSession = { ...existing };
        delete updated.session_token;
        const json = JSON.stringify(updated);
        window.localStorage.setItem(ADMIN_SESSION_KEY, json);
        window.sessionStorage.setItem(ADMIN_SESSION_KEY, json);
      }
    }
  } catch {}
};

/**
 * Save admin session to localStorage (and sessionStorage for cross-tab).
 */
export const saveAdminSession = (session: Omit<AdminSession, 'version' | 'signed_in_at'>): AdminSession => {
  const full: AdminSession = {
    ...session,
    version: ADMIN_SESSION_VERSION,
    signed_in_at: Date.now(),
  };
  if (hasWindow()) {
    try {
      const json = JSON.stringify(full);
      window.localStorage.setItem(ADMIN_SESSION_KEY, json);
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, json);
      if (session.session_token && session.session_token.length >= 16) {
        window.localStorage.setItem(ADMIN_TOKEN_KEY, session.session_token);
      }
    } catch (e) {
      console.warn('[adminSession] Failed to save', e);
    }
  }
  return full;
};

/**
 * Load admin session from storage. Returns null if missing/invalid.
 */
export const getAdminSession = (): AdminSession | null => {
  if (!hasWindow()) return null;
  try {
    const parsed = getBestStoredAdminSession();
    if (!parsed) return null;
    if (parsed.version !== ADMIN_SESSION_VERSION) {
      clearAdminSession();
      return null;
    }
    if (!parsed.admin_id || !parsed.email) {
      clearAdminSession();
      return null;
    }
    // NO-AUTO-LOGOUT: once a real server admin session exists, do not hide it
    // just because tab-scoped secret-link storage was lost on refresh/new tab.
    // The route guard still requires secret-link access for first entry, but a
    // saved admin session must remain usable until manual logout.
    // Keep both stores aligned to the newest valid session so future RPCs never
    // fall back to an older x-admin-token from the other storage bucket.
    const json = JSON.stringify(parsed);
    window.localStorage.setItem(ADMIN_SESSION_KEY, json);
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, json);
    if (parsed.session_token && parsed.session_token.length >= 16) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, parsed.session_token);
    }
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Clear admin session entirely.
 */
export const clearAdminSession = (): void => {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
};

/**
 * Quick boolean: is there a current admin session?
 */
export const hasAdminSession = (): boolean => getAdminSession() !== null;

/**
 * Quick boolean: is the current admin session an owner?
 */
export const isAdminSessionOwner = (): boolean => {
  const s = getAdminSession();
  return !!s && s.is_owner;
};

/**
 * Get current admin id (or null).
 */
export const getCurrentAdminId = (): string | null => {
  return getAdminSession()?.admin_id ?? null;
};

/**
 * Device Approval Logic
 */
export const isDeviceApproved = (): boolean => {
  if (!hasWindow()) return false;
  return !!window.localStorage.getItem(APPROVED_DEVICES_KEY);
};

export const approveCurrentDevice = (): void => {
  if (!hasWindow()) return;
  window.localStorage.setItem(APPROVED_DEVICES_KEY, 'true');
};

export const revokeDeviceApproval = (): void => {
  if (!hasWindow()) return;
  window.localStorage.removeItem(APPROVED_DEVICES_KEY);
};

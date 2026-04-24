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
    return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setAdminSessionToken = (token: string | null | undefined): void => {
  if (!hasWindow()) return;
  try {
    if (token && token.length >= 16) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {}
};

const hasWindow = () => typeof window !== 'undefined';

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
    const raw =
      window.sessionStorage.getItem(ADMIN_SESSION_KEY) ||
      window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (parsed.version !== ADMIN_SESSION_VERSION) {
      clearAdminSession();
      return null;
    }
    if (!parsed.admin_id || !parsed.email) {
      clearAdminSession();
      return null;
    }
    // Sync to sessionStorage if only in localStorage
    if (!window.sessionStorage.getItem(ADMIN_SESSION_KEY)) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, raw);
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

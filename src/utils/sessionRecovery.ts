import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { waitForNativeAuthHydration } from '@/integrations/supabase/nativeStorage';
import { getPersistentDeviceId } from '@/utils/persistentDeviceId';
import { getSessionFromNative, saveSessionToNative } from '@/utils/nativeSessionStorage';

const DEFAULT_MIN_FRESH_MS = 2 * 60_000;

type EnsureFreshSessionOptions = {
  minFreshMs?: number;
  forceRefresh?: boolean;
  expectedUserId?: string | null;
};

let recoveryInFlight: Promise<Session | null> | null = null;

const isFreshEnough = (session: Session | null | undefined, minFreshMs: number, expectedUserId?: string | null) => {
  if (!session?.access_token || !session.user?.id) return false;
  if (expectedUserId && session.user.id !== expectedUserId) return false;
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  return !expiresAtMs || expiresAtMs - Date.now() > minFreshMs;
};

const rememberNativeSession = (session: Session | null | undefined) => {
  if (!session?.access_token || !session.refresh_token) return;
  void saveSessionToNative({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  }).catch(() => undefined);
};

const restoreNativeSession = async (minFreshMs: number, expectedUserId?: string | null) => {
  if (!Capacitor.isNativePlatform()) return null;
  const nativeSession = await getSessionFromNative();
  if (!nativeSession?.refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: nativeSession.access_token,
    refresh_token: nativeSession.refresh_token,
  });

  if (error || !isFreshEnough(data.session, minFreshMs, expectedUserId)) return null;
  rememberNativeSession(data.session);
  return data.session;
};

const recoverSessionFromDevice = async (minFreshMs: number, expectedUserId?: string | null) => {
  try {
    if (localStorage.getItem('meri_manual_logout') === 'true') return null;
  } catch {
    return null;
  }

  const deviceId = await getPersistentDeviceId();
  if (!deviceId) return null;

  const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/recover_session_by_device`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_device_id: deviceId }),
  });

  if (!rpcResponse.ok) return null;
  const accountRows = await rpcResponse.json().catch(() => null);
  if (!Array.isArray(accountRows) || accountRows.length === 0) return null;
  const account = accountRows[0] as { user_id?: string; exchange_token?: string; recovery_email?: string; recovery_password?: string };
  if (expectedUserId && account.user_id && account.user_id !== expectedUserId) return null;

  // Current secure path: RPC mints a one-time exchange token, edge function
  // consumes it and returns a fresh Supabase session. This also works after a
  // WebView/localStorage wipe because it is bound to the persistent device id.
  if (!account.exchange_token && account.recovery_email && account.recovery_password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: account.recovery_email,
      password: account.recovery_password,
    });
    if (!error && isFreshEnough(data.session, minFreshMs, expectedUserId)) {
      rememberNativeSession(data.session);
      return data.session;
    }
    return null;
  }

  if (!account.exchange_token) return null;

  const recoverResponse = await fetch(`${SUPABASE_URL}/functions/v1/device-session-recover`, {
      'Content-Type': 'application/json',
    },
  });

  const data = await recoverResponse.json().catch(() => null);
  if (!recoverResponse.ok || !data?.success || !data?.access_token || !data?.refresh_token) return null;

  const { data: setData, error: setError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });

  if (setError || !isFreshEnough(setData.session, minFreshMs, expectedUserId)) return null;
  rememberNativeSession(setData.session);
  return setData.session;
};

const recoverSession = (minFreshMs: number, expectedUserId?: string | null) => {
  if (!recoveryInFlight) {
    recoveryInFlight = (async () => {
      const nativeRestored = await restoreNativeSession(minFreshMs, expectedUserId);
      if (nativeRestored) return nativeRestored;
      return recoverSessionFromDevice(minFreshMs, expectedUserId);
    })().finally(() => {
      recoveryInFlight = null;
    });
  }
  return recoveryInFlight;
};

export const ensureFreshSupabaseSession = async (options: EnsureFreshSessionOptions = {}) => {
  const minFreshMs = options.minFreshMs ?? DEFAULT_MIN_FRESH_MS;
  const expectedUserId = options.expectedUserId ?? null;

  try { await waitForNativeAuthHydration(); } catch {}

  const { data: current } = await supabase.auth.getSession();
  if (!options.forceRefresh && isFreshEnough(current.session, minFreshMs, expectedUserId)) {
    return current.session;
  }

  try {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && isFreshEnough(refreshed.session, minFreshMs, expectedUserId)) {
      rememberNativeSession(refreshed.session);
      return refreshed.session;
    }
  } catch {
    // Continue to stronger recovery paths below.
  }

  const recovered = await recoverSession(minFreshMs, expectedUserId);
  if (recovered) return recovered;

  const { data: finalCheck } = await supabase.auth.getSession();
  return isFreshEnough(finalCheck.session, minFreshMs, expectedUserId) ? finalCheck.session : null;
};

export const isAuthSessionFailure = (error: unknown) => {
  const raw = typeof error === 'string'
    ? error
    : String((error as { message?: string; code?: string; statusCode?: string | number; status?: string | number } | null)?.message ?? error ?? '');
  const fingerprint = raw.toLowerCase();
  // Keep this intentionally strict. Supabase Storage can return HTTP 403 for
  // real RLS/policy problems; those are not expired sessions and must not be
  // shown to users as “please sign in again”. Only retry/recover for genuine
  // JWT/session-expiry signals.
  return /jwt expired|invalid jwt|jwt invalid|malformed jwt|token expired|refresh token|not authenticated|auth session missing|auth session not found|no session found|session.*expired|session.*not.*found|\b401\b/i.test(fingerprint);
};

export const sessionExpiredUploadMessage = 'Your session expired. Please sign in again and retry.';
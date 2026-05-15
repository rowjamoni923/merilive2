import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { getDeviceIdSync, getPersistentDeviceId } from '@/utils/persistentDeviceId';
import {
  recordSessionEvent,
  setCurrentChannelName,
} from '@/utils/sessionDebugBus';

const IS_NATIVE = Capacitor.isNativePlatform();
const SESSION_CHECK_MIN_INTERVAL_MS = IS_NATIVE ? 20_000 : 60_000;
// On native we run a faster safety-net check (30s) — realtime is still primary,
// but if the websocket drops the user must not be able to keep using a
// revoked session for 3 minutes.
const PERIODIC_CHECK_INTERVAL_MS = IS_NATIVE ? 30_000 : 3 * 60_000;
const SESSION_ERROR_BACKOFF_BASE_MS = 60_000;
const SESSION_ERROR_BACKOFF_MAX_MS = 10 * 60_000;
const SESSION_CHECK_JITTER_MS = 7_000;

// Generate a unique session ID for this device/tab.
// Used only as a WEB fallback. On native we replace this with the hardware
// device UUID (see resolveStableSessionId) so the same phone always gets the
// same session id — no false-positive logouts of the user's own device.
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Use localStorage on ALL platforms to prevent logout on page reload/rebuild
// Session ID only changes on explicit fresh login (forceNewSessionId)
const STORAGE_KEY = 'meri_session_id';
const USER_KEY = 'meri_session_user_id';

const getOrCreateSessionId = (): string => {
  // On native: prefer the stable hardware device id so the SAME phone keeps
  // the SAME session id across cold starts, app updates, even WebView data
  // resets. This is the core of "100% reliable single-device" on Android.
  if (IS_NATIVE) {
    const hw = getDeviceIdSync();
    if (hw && hw.startsWith('device_')) {
      try { localStorage.setItem(STORAGE_KEY, hw); } catch { /* noop */ }
      return hw;
    }
  }
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
};

const getStoredUserId = (): string | null => {
  return localStorage.getItem(USER_KEY);
};

const setStoredUserId = (userId: string) => {
  localStorage.setItem(USER_KEY, userId);
};

const forceNewSessionId = (): string => {
  // On native we DO NOT rotate the session id even on "fresh login" — a
  // physical device only ever has one session id (its hardware UUID), so
  // when the same user signs in again on the same phone the registration
  // is a no-op (same id wins by definition), and when a DIFFERENT phone
  // signs in, that other phone's hardware id replaces this one in DB →
  // this device gets logged out via realtime/periodic check.
  if (IS_NATIVE) {
    const hw = getDeviceIdSync();
    if (hw && hw.startsWith('device_')) {
      try {
        localStorage.setItem(STORAGE_KEY, hw);
        sessionStorage.setItem(STORAGE_KEY, hw);
      } catch { /* noop */ }
      return hw;
    }
  }
  const newId = generateSessionId();
  // Save to BOTH so it persists across reload
  localStorage.setItem(STORAGE_KEY, newId);
  sessionStorage.setItem(STORAGE_KEY, newId);
  return newId;
};

const clearSessionId = () => {
  // Keep the hardware-derived id on native so the next login from the same
  // phone instantly re-registers the same id. Only wipe the user link.
  if (!IS_NATIVE) {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  }
  localStorage.removeItem(USER_KEY);
};

const computeBackoffDelayMs = (attempt: number) => {
  const safeAttempt = Math.min(Math.max(attempt, 1), 6);
  const expDelay = SESSION_ERROR_BACKOFF_BASE_MS * (2 ** (safeAttempt - 1));
  const jitter = Math.floor(Math.random() * SESSION_CHECK_JITTER_MS);
  return Math.min(expDelay + jitter, SESSION_ERROR_BACKOFF_MAX_MS);
};

export const useSingleDeviceSession = (userId: string | null) => {
  const sessionId = useRef(getOrCreateSessionId());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOut = useRef(false);
  const isRegistered = useRef(false);
  const prevUserId = useRef<string | null>(null);
  const lastCheckAtRef = useRef(0);
  const errorStreakRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const lastHiddenAtRef = useRef<number | null>(null);
  
  // ✅ LOGIN GRACE PERIOD: Prevent ANY logout for 30 seconds after fresh login
  const loginGraceUntil = useRef<number>(0);
  // ✅ RECONNECT GRACE PERIOD: After airplane-mode / network drop, suppress
  // any forceLogout for 15s so stale realtime replays or a half-open RPC
  // can't kick a perfectly valid device.
  const reconnectGraceUntil = useRef<number>(0);
  const RECONNECT_GRACE_MS = 15_000;

  const isInGracePeriod = useCallback(() => {
    const now = Date.now();
    return now < loginGraceUntil.current || now < reconnectGraceUntil.current;
  }, []);

  const armReconnectGrace = useCallback((reason: string) => {
    reconnectGraceUntil.current = Date.now() + RECONNECT_GRACE_MS;
    console.log(`[SingleDevice] 🛡️ Reconnect grace armed (${reason}) for ${RECONNECT_GRACE_MS / 1000}s`);
    recordSessionEvent('grace.start', { reason, durationMs: RECONNECT_GRACE_MS });
  }, []);

  const resetErrorBackoff = useCallback(() => {
    errorStreakRef.current = 0;
    backoffUntilRef.current = 0;
  }, []);

  const applyErrorBackoff = useCallback((source: string) => {
    errorStreakRef.current += 1;
    const delayMs = computeBackoffDelayMs(errorStreakRef.current);
    backoffUntilRef.current = Date.now() + delayMs;
    console.warn(`[SingleDevice] ⏸️ Session check backoff ${Math.round(delayMs / 1000)}s (${source})`);
  }, []);

  // Register this session as active
  const registerSession = useCallback(async (forceNewId = false) => {
    if (!userId || isLoggingOut.current) return;

    // Skip session registration for admin panel routes
    if (window.location.pathname.startsWith('/admin')) {
      console.log('[SingleDevice] ⏭️ Skipping for admin panel');
      isRegistered.current = false;
      return;
    }

    // Single-device enforcement active on ALL platforms (web + native)

    // On native: make sure we are using the resolved hardware UUID, not the
    // pre-cache placeholder. This handles the cold-start race where the very
    // first paint runs before Capacitor's Device plugin has answered.
    if (IS_NATIVE) {
      try {
        const hw = await getPersistentDeviceId();
        if (hw && hw.startsWith('device_') && sessionId.current !== hw) {
          sessionId.current = hw;
          try { localStorage.setItem(STORAGE_KEY, hw); } catch { /* noop */ }
        }
      } catch { /* noop */ }
    }

    // If forceNewId (fresh login), generate a brand new session ID
    if (forceNewId) {
      const newId = forceNewSessionId();
      sessionId.current = newId;
      // ✅ Set grace period: NO logout allowed for 30 seconds
      loginGraceUntil.current = Date.now() + 30000;
      console.log('[SingleDevice] 🔑 New session ID for fresh login:', newId.substring(0, 15), '| Grace period: 30s');
    }

    try {
      const deviceInfo = {
        ua: navigator.userAgent.substring(0, 200),
        platform: IS_NATIVE ? 'native' : 'web',
        ts: new Date().toISOString(),
      };

      const { error: rpcError } = await supabase.rpc('update_active_session', {
        _session_id: sessionId.current,
        _device_info: deviceInfo as any,
      });
      if (rpcError) throw rpcError;

      console.log('[SingleDevice] ✅ Session registered:', sessionId.current.substring(0, 15));
      recordSessionEvent('register', {
        sessionId: sessionId.current,
        userId,
        forceNewId,
        platform: deviceInfo.platform,
      });
      isRegistered.current = true;
      resetErrorBackoff();
    } catch (error) {
      console.error('[SingleDevice] Failed to register session:', error);
      recordSessionEvent('register.error', { sessionId: sessionId.current }, String((error as Error)?.message || error));
      isRegistered.current = true;
      applyErrorBackoff('register');
    }
  }, [userId, resetErrorBackoff, applyErrorBackoff]);

  // Check if this session is still valid
  const checkSessionValid = useCallback(async (): Promise<boolean> => {
    if (!userId || isLoggingOut.current || !isRegistered.current) return true;
    
    // ✅ During grace period, always return valid
    if (isInGracePeriod()) {
      console.log('[SingleDevice] ⏳ In grace period — skipping check');
      return true;
    }

    const now = Date.now();

    if (now < backoffUntilRef.current) {
      return true;
    }

    if (now - lastCheckAtRef.current < SESSION_CHECK_MIN_INTERVAL_MS) {
      return true;
    }

    lastCheckAtRef.current = now;

    try {
      const { data, error } = await supabase.rpc('check_session_valid', {
        p_user_id: userId,
        p_session_id: sessionId.current,
      });

      if (error) {
        console.error('[SingleDevice] Session check error:', error);
        recordSessionEvent('check.error', { sessionId: sessionId.current }, error.message);
        applyErrorBackoff('rpc_error');
        return true;
      }

      if (data === true) {
        recordSessionEvent('check.valid');
        resetErrorBackoff();
        return true;
      }
      // ✅ Only an EXPLICIT false from the RPC means "another device won".
      // null/undefined/anything else = treat as still valid (defensive — a
      // half-open response after airplane-mode toggle must not log us out).
      if (data === false) {
        recordSessionEvent('check.invalid', { sessionId: sessionId.current, userId });
        return false;
      }
      console.warn('[SingleDevice] Unexpected check_session_valid response, treating as valid:', data);
      recordSessionEvent('check.error', { sessionId: sessionId.current }, `unexpected_response:${JSON.stringify(data)}`);
      return true;
    } catch (error) {
      console.error('[SingleDevice] Session check failed:', error);
      recordSessionEvent('check.error', { sessionId: sessionId.current }, String((error as Error)?.message || error));
      applyErrorBackoff('rpc_exception');
      return true;
    }
  }, [userId, isInGracePeriod, applyErrorBackoff, resetErrorBackoff]);

  // Force logout when another device takes over the session
  // NEW device is protected by 30s grace period — only OLD device gets logged out
  const forceLogout = useCallback(async () => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    console.log('[SingleDevice] 🔒 Forcing logout — another device logged in');
    recordSessionEvent('forceLogout', { sessionId: sessionId.current, userId });

    try {
      // Set manual logout flag so App.tsx allows the sign-out
      localStorage.setItem('meri_manual_logout', 'true');
      // Surface a clear toast so the user understands why they were kicked.
      try {
        const { toast } = await import('sonner');
        toast.error('Signed out — your account is now active on another device.', {
          duration: 6000,
        });
      } catch { /* noop */ }
      clearSessionId();
      // GLOBAL scope = invalidate refresh token server-side too, so the
      // device cannot silently re-hydrate the session after this logout.
      await supabase.auth.signOut({ scope: 'global' }).catch(async () => {
        // Fall back to local-only sign out if the global call fails (offline).
        await supabase.auth.signOut({ scope: 'local' });
      });
      // Hard redirect to /auth on native so any in-memory React state is wiped.
      try {
        window.location.replace('/auth');
      } catch { /* noop */ }
    } catch (error) {
      console.error('[SingleDevice] Force logout error:', error);
    }
  }, []);

  // When userId changes (new login), force a new session ID and register immediately
  useEffect(() => {
    if (!userId) {
      isRegistered.current = false;
      prevUserId.current = null;
      resetErrorBackoff();
      return;
    }

    // Detect ACTUAL fresh login vs page reload
    // Fresh login = userId changed AND it's different from the stored userId in localStorage
    const storedUserId = getStoredUserId();
    const isFreshLogin = prevUserId.current !== userId && storedUserId !== userId;
    prevUserId.current = userId;
    setStoredUserId(userId);

    isRegistered.current = false;
    isLoggingOut.current = false;

    const setup = async () => {
      // On fresh login, always generate new session ID so THIS device wins
      // On page reload (same userId in localStorage), just re-register the existing session
      await registerSession(isFreshLogin);
      
      // Wait for DB propagation before starting checks (+ jitter to avoid synchronized spikes)
      const startupJitterMs = Math.floor(Math.random() * 8000);
      await new Promise(resolve => setTimeout(resolve, 5000 + startupJitterMs));
      
      if (isLoggingOut.current) return;

      console.log('[SingleDevice] ✅ Starting periodic checks');
      
      checkIntervalRef.current = setInterval(async () => {
        const isValid = await checkSessionValid();
        if (!isValid) {
          console.log('[SingleDevice] ❌ This device is OLD — forcing logout');
          forceLogout();
        }
      }, PERIODIC_CHECK_INTERVAL_MS);
    };

    setup();

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [userId, registerSession, checkSessionValid, forceLogout, resetErrorBackoff]);

  // Realtime listener for session changes
  useEffect(() => {
    if (!userId) return;

    const channelName = `session-${userId}-${sessionId.current.slice(-8)}-${Math.random().toString(36).slice(2, 8)}`;
    setCurrentChannelName(channelName);
    recordSessionEvent('channel.subscribe', { channel: channelName, sessionId: sessionId.current });

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newSessionId = (payload.new as { active_session_id?: string } | null)?.active_session_id;
          recordSessionEvent('realtime.update', {
            channel: channelName,
            incomingSessionId: newSessionId,
            mySessionId: sessionId.current,
          });

          // ✅ CRITICAL: Don't react during grace period (this is the NEW device)
          if (isInGracePeriod()) {
            console.log('[SingleDevice] 🛡️ Realtime change ignored — grace period active');
            recordSessionEvent('realtime.ignored.grace', { channel: channelName });
            return;
          }

          // Don't react until this device has finished registering
          if (!isRegistered.current) {
            recordSessionEvent('realtime.ignored.unregistered', { channel: channelName });
            return;
          }

          if (newSessionId && newSessionId !== sessionId.current) {
            console.log('[SingleDevice] 🔄 Another device logged in — THIS (old) device logging out');
            forceLogout();
          }
        }
      )
      .subscribe();

    return () => {
      recordSessionEvent('channel.unsubscribe', { channel: channelName });
      setCurrentChannelName(null);
      supabase.removeChannel(channel);
    };
  }, [userId, forceLogout, isInGracePeriod]);

  // Foreground/visibility detection - check session when app resumes
  useEffect(() => {
    if (!userId) return;

    const immediateCheck = async () => {
      if (isLoggingOut.current || !isRegistered.current) return;
      
      // ✅ Skip check during grace period
      if (isInGracePeriod()) return;
      
      const isValid = await checkSessionValid();
      if (!isValid) {
        forceLogout();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === 'visible') {
        const hiddenForMs = lastHiddenAtRef.current ? Date.now() - lastHiddenAtRef.current : 0;
        // Avoid noisy checks unless app was truly backgrounded
        if (hiddenForMs >= 8000) {
          immediateCheck();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    let removeNativeListener: (() => void) | null = null;

    if (IS_NATIVE) {
      import('@capacitor/app').then(({ App: CapApp }) => {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            immediateCheck();
          }
        }).then(listener => {
          removeNativeListener = () => listener.remove();
        });
      }).catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (removeNativeListener) removeNativeListener();
    };
  }, [userId, checkSessionValid, forceLogout, isInGracePeriod]);

  return {
    sessionId: sessionId.current,
    registerSession,
    checkSessionValid,
  };
};

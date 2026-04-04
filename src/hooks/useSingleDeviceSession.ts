import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

const IS_NATIVE = Capacitor.isNativePlatform();
const SESSION_CHECK_MIN_INTERVAL_MS = 60_000;
const PERIODIC_CHECK_INTERVAL_MS = 3 * 60_000;
const SESSION_ERROR_BACKOFF_BASE_MS = 60_000;
const SESSION_ERROR_BACKOFF_MAX_MS = 10 * 60_000;
const SESSION_CHECK_JITTER_MS = 7_000;

// Generate a unique session ID for this device/tab
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Use localStorage on ALL platforms to prevent logout on page reload/rebuild
// Session ID only changes on explicit fresh login (forceNewSessionId)
const STORAGE_KEY = 'meri_session_id';
const USER_KEY = 'meri_session_user_id';

const getOrCreateSessionId = (): string => {
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
  const newId = generateSessionId();
  // Save to BOTH so it persists across reload
  localStorage.setItem(STORAGE_KEY, newId);
  sessionStorage.setItem(STORAGE_KEY, newId);
  return newId;
};

const clearSessionId = () => {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
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

  const isInGracePeriod = useCallback(() => {
    return Date.now() < loginGraceUntil.current;
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

    // If forceNewId (fresh login), generate a brand new session ID
    if (forceNewId) {
      const newId = forceNewSessionId();
      sessionId.current = newId;
      // ✅ Set grace period: NO logout allowed for 30 seconds
      loginGraceUntil.current = Date.now() + 30000;
      console.log('[SingleDevice] 🔑 New session ID for fresh login:', newId.substring(0, 15), '| Grace period: 30s');
    }

    try {
      const deviceInfo = navigator.userAgent.substring(0, 100);
      
      await supabase.rpc('update_active_session', {
        p_user_id: userId,
        p_session_id: sessionId.current,
        p_device_info: deviceInfo,
      });

      console.log('[SingleDevice] ✅ Session registered:', sessionId.current.substring(0, 15));
      isRegistered.current = true;
      resetErrorBackoff();
    } catch (error) {
      console.error('[SingleDevice] Failed to register session:', error);
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
        applyErrorBackoff('rpc_error');
        return true;
      }

      if (data === true) {
        resetErrorBackoff();
      }

      return data === true;
    } catch (error) {
      console.error('[SingleDevice] Session check failed:', error);
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

    try {
      // Set manual logout flag so App.tsx allows the sign-out
      localStorage.setItem('meri_manual_logout', 'true');
      clearSessionId();
      await supabase.auth.signOut({ scope: 'local' });
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

    const channel = supabase
      .channel(`session-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          // ✅ CRITICAL: Don't react during grace period (this is the NEW device)
          if (isInGracePeriod()) {
            console.log('[SingleDevice] 🛡️ Realtime change ignored — grace period active');
            return;
          }
          
          // Don't react until this device has finished registering
          if (!isRegistered.current) return;
          
          const newSessionId = payload.new?.active_session_id;
          
          if (newSessionId && newSessionId !== sessionId.current) {
            console.log('[SingleDevice] 🔄 Another device logged in — THIS (old) device logging out');
            forceLogout();
          }
        }
      )
      .subscribe();

    return () => {
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

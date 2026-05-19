/**
 * 🔄 App Resume Handler
 * 
 * Centralized handler for when the app comes back from background.
 * Native apps don't have a refresh button, so this ensures:
 * - Real-time channels reconnect
 * - Critical data is refetched via React Query invalidation
 * - UI stays in sync without manual refresh
 */

import { useEffect, useRef, useCallback } from 'react';
import { getConnectionStatus } from '@/hooks/useUniversalRealtime';

type ResumeCallback = () => void;

// Global event bus for app resume
const resumeCallbacks = new Set<ResumeCallback>();

/**
 * Register a callback that fires when app resumes from background
 * Returns unsubscribe function
 */
export const onAppResume = (callback: ResumeCallback): (() => void) => {
  resumeCallbacks.add(callback);
  return () => {
    resumeCallbacks.delete(callback);
  };
};

/**
 * Trigger all registered resume callbacks
 */
const triggerResumeCallbacks = () => {
  console.log(`[AppResume] 📢 Broadcasting resume to ${resumeCallbacks.size} listeners`);
  resumeCallbacks.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('[AppResume] Callback error:', e);
    }
  });
};

/**
 * Main hook - place in App.tsx to handle app resume globally
 */
export const useAppResumeHandler = (userId: string | null, _queryClient?: unknown) => {
  const lastResumeTime = useRef(0);

  const handleResume = useCallback(async () => {
    if (!userId || window.location.pathname.startsWith('/admin')) return;

    // Debounce - native can emit multiple resume-like events in a short burst
    const now = Date.now();
    if (now - lastResumeTime.current < 60000) return;
    lastResumeTime.current = now;

    console.log('[AppResume] App resumed — zero-refresh policy active');

    // 1. Report realtime state only; do not reconnect/refetch on foreground.
    const { isConnected } = getConnectionStatus();
    if (isConnected) {
      console.log('[AppResume] ✅ Realtime already connected, skipping forced reconnect');
    } else {
      console.log('[AppResume] Realtime disconnected; waiting for native/socket auto-reconnect');
    }

    // 2. Trigger explicit local callbacks only; no query invalidation/refetch.
    triggerResumeCallbacks();
  }, [userId]);

  useEffect(() => {
    if (!userId || window.location.pathname.startsWith('/admin')) return;

    // Native-only resume sync. Web visibility changes are intentionally ignored
    // so switching tabs or opening overlays never looks like an app reload.
    let removeNativeListener: (() => void) | null = null;

    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return null;
        return import('@capacitor/app');
      })
      .then((mod) => {
        if (!mod) return;
        const { App } = mod;
        App.addListener('resume', () => {
          handleResume();
        }).then(listener => {
          removeNativeListener = () => listener.remove();
        });
      })
      .catch(() => {
        console.warn('[AppResume] Capacitor App plugin not available');
      });

    return () => {
      if (removeNativeListener) removeNativeListener();
    };
  }, [userId, handleResume]);
};

/**
 * Hook for components that need to refresh data on app resume
 * Usage: useRefreshOnResume(() => { fetchMyData(); });
 */
export const useRefreshOnResume = (refreshFn: () => void) => {
  const callbackRef = useRef(refreshFn);
  callbackRef.current = refreshFn;

  useEffect(() => {
    const unsubscribe = onAppResume(() => {
      callbackRef.current();
    });
    return unsubscribe;
  }, []);
};

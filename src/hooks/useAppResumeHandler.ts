/**
 * 🔄 App Resume Handler
 * 
 * Centralized resume observer.
 * Zero-refresh policy: app foreground/resume must never refetch, invalidate,
 * refresh session, or broadcast callbacks that components use as refresh hooks.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getConnectionStatus } from '@/hooks/useUniversalRealtime';

type ResumeCallback = () => void;

// Deprecated no-op event bus kept only for import compatibility.
const resumeCallbacks = new Set<ResumeCallback>();

/**
 * Deprecated: resume callbacks are intentionally not fired. Use realtime/admin
 * push events or explicit user actions instead.
 */
export const onAppResume = (callback: ResumeCallback): (() => void) => {
  resumeCallbacks.add(callback);
  return () => {
    resumeCallbacks.delete(callback);
  };
};

/**
 * Intentionally disabled by the zero-refresh policy.
 */
const triggerResumeCallbacks = () => {
  if (resumeCallbacks.size > 0) {
    console.log(`[AppResume] Zero-refresh policy: skipped ${resumeCallbacks.size} resume callback(s)`);
  }
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

    // 2. Do not trigger refresh callbacks on foreground/resume.
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
 * Deprecated no-op. Components must use realtime/admin push or manual actions.
 */
export const useRefreshOnResume = (refreshFn: () => void) => {
  const callbackRef = useRef(refreshFn);
  callbackRef.current = refreshFn;

  useEffect(() => {
    return undefined;
  }, []);
};

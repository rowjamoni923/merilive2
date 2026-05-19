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
import { supabase } from '@/integrations/supabase/client';
import { forceReconnectChannel, getConnectionStatus } from '@/hooks/useUniversalRealtime';
import { QueryClient } from '@tanstack/react-query';

type ResumeCallback = () => void;

// Global event bus for app resume
const resumeCallbacks = new Set<ResumeCallback>();

// Reference to the app's QueryClient - set during hook initialization
let appQueryClient: QueryClient | null = null;

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
 * Critical queries to refresh immediately on resume.
 * Everything else only refreshes if cache is old, preventing refetch storms.
 */
const CRITICAL_QUERY_KEYS = new Set([
  'index-hosts-v4',
  'live-stream',
  'active-streams',
  'party-rooms',
  'conversations',
  'messages',
  'notifications',
  'user-profile',
  'host-profile',
  'agency-details',
]);

/**
 * Main hook - place in App.tsx to handle app resume globally
 */
export const useAppResumeHandler = (userId: string | null, queryClient?: QueryClient) => {
  const lastResumeTime = useRef(0);

  // Store queryClient reference for global access
  useEffect(() => {
    if (queryClient) {
      appQueryClient = queryClient;
    }
  }, [queryClient]);

  const handleResume = useCallback(async () => {
    if (!userId || window.location.pathname.startsWith('/admin')) return;

    // Debounce - native can emit multiple resume-like events in a short burst
    const now = Date.now();
    if (now - lastResumeTime.current < 60000) return;
    lastResumeTime.current = now;

    console.log('[AppResume] 🔄 App resumed from background');

    // 1. Force reconnect realtime only when disconnected (avoids reconnect storms)
    const { isConnected } = getConnectionStatus();
    if (!isConnected) {
      forceReconnectChannel();
    } else {
      console.log('[AppResume] ✅ Realtime already connected, skipping forced reconnect');
    }

    // 2. Refresh auth session (might have expired)
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[AppResume] Session refresh error:', error);
      } else if (data?.session) {
        console.log('[AppResume] ✅ Session still valid');
      }
    } catch (e) {
      console.error('[AppResume] Session check failed:', e);
    }

    // 3. Smart invalidate (critical + stale), not ALL queries
    if (appQueryClient) {
      const resumeTime = Date.now();
      console.log('[AppResume] 🔄 Smart invalidation (critical + stale caches)');
      appQueryClient.invalidateQueries({
        predicate: (query) => {
          const rootKey = String(query.queryKey?.[0] ?? '');
          if (CRITICAL_QUERY_KEYS.has(rootKey)) return true;

          // Refresh non-critical queries only if cache is old (>3 min)
          const lastUpdated = query.state.dataUpdatedAt || 0;
          return resumeTime - lastUpdated > 3 * 60 * 1000;
        },
        refetchType: 'active',
      });
    }

    // 4. Trigger all registered resume callbacks
    triggerResumeCallbacks();

    // 5. Clear stale global settings cache to force refresh
    try {
      const storedTime = localStorage.getItem('meri_global_settings_time');
      if (storedTime) {
        const elapsed = Date.now() - parseInt(storedTime, 10);
        // If settings are older than 5 minutes, clear cache
        if (elapsed > 5 * 60 * 1000) {
          localStorage.removeItem('meri_global_settings');
          localStorage.removeItem('meri_global_settings_time');
          console.log('[AppResume] 🗑️ Cleared stale settings cache');
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
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

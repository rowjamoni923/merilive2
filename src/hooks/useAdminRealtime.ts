import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * 🔄 Unified Admin Realtime System (Single Source of Truth)
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────┐
 * │  AdminLayout (ONE global subscription)          │
 * │  └── 2 chunked channels → postgres_changes      │
 * │      └── dispatchAdminTableUpdate() → window     │
 * ├─────────────────────────────────────────────────┤
 * │  Every admin page:                              │
 * │  useAdminRealtime(['table1','table2'], refresh) │
 * │  └── Listens to window events ONLY              │
 * │      └── Zero extra DB channels!                │
 * └─────────────────────────────────────────────────┘
 * 
 * Non-admin pages: Creates direct postgres_changes channels
 * only for tables NOT in global monitoring.
 */

// ============= GLOBAL EVENT DISPATCHER =============

export const ADMIN_REALTIME_EVENT = 'admin-table-update';

export interface AdminTableUpdateEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  payload?: any;
}

export function dispatchAdminTableUpdate(detail: AdminTableUpdateEvent) {
  window.dispatchEvent(new CustomEvent(ADMIN_REALTIME_EVENT, { detail }));
}

// ============= ALL MONITORED TABLES =============
// AdminLayout subscribes to these via chunked channels.
// Admin pages consume them via events — zero extra channels.

// ⚡ COST-OPTIMISED: Reduced from 90+ to ~0 global subscriptions.
// Each admin page now creates its own direct channel ONLY for the tables it needs.
// This prevents 90-table postgres_changes subscriptions from running 24/7 even
// when no admin is online. Previously this caused 525M realtime messages ($1,302/mo).
export const GLOBALLY_MONITORED_TABLES = new Set<string>([
  // EMPTY — all admin tables now use direct per-page channels
  // The useAdminRealtime hook's directTables path handles everything
]);

// ============= HOOK =============

const DEFAULT_DEBOUNCE_MS = 120;
const DEFAULT_STALE_REFRESH_MS = 45_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;

interface UseAdminRealtimeOptions {
  debounceMs?: number;
  /**
   * Disabled by default to keep admin pages strictly realtime-driven
   * (no timer-based refresh when tab becomes visible).
   */
  enableVisibilityRefresh?: boolean;
  /**
   * Disabled by default to avoid auto-refresh loops.
   * Enable only for specific legacy pages if needed.
   */
  enableStaleFallback?: boolean;
  staleRefreshMs?: number;
  healthCheckIntervalMs?: number;
}

export const useAdminRealtime = (
  tables: string[],
  onUpdate: (() => void) | (() => Promise<void>),
  channelName?: string,
  options: UseAdminRealtimeOptions = {}
) => {
  const onUpdateRef = useRef(onUpdate);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const enableVisibilityRefresh = options.enableVisibilityRefresh ?? false;
  const enableStaleFallback = options.enableStaleFallback ?? false;
  const staleRefreshMs = options.staleRefreshMs ?? DEFAULT_STALE_REFRESH_MS;
  const healthCheckIntervalMs = options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdateRef.current();
    }, debounceMs);
  }, [debounceMs]);

  // ⚡ Auth-aware: Only fetch data AFTER auth session is confirmed
  // This prevents "Failed to load data" toasts from premature RLS-blocked queries
  const authReadyRef = useRef(false);

  useEffect(() => {
    let authRefreshTimer: NodeJS.Timeout | null = null;
    let cancelled = false;

    const doInitialFetch = () => {
      if (cancelled) return;
      authReadyRef.current = true;
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
      authRefreshTimer = setTimeout(() => {
        if (!cancelled) onUpdateRef.current();
      }, 80);
    };

    // Check if session already exists (covers route navigation between admin pages)
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        doInitialFetch();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        doInitialFetch();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
    };
  }, []);

  useEffect(() => {
    const isAdminRoute =
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/admin') ||
        window.location.hash.startsWith('#/admin') ||
        window.location.hash.includes('/admin'));

    const normalizedTables = Array.from(new Set(tables));
    const eventTables = normalizedTables.filter((t) => GLOBALLY_MONITORED_TABLES.has(t));
    const directTables = normalizedTables.filter((t) => !GLOBALLY_MONITORED_TABLES.has(t));

    let lastRealtimeTouch = Date.now();

    // NO blind initial fetch — auth-aware effect above handles the first load
    const initialRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const handleGlobalEvent = (e: Event) => {
      const detail = (e as CustomEvent<AdminTableUpdateEvent>).detail;
      if (detail?.table === '*' || eventTables.includes(detail?.table)) {
        lastRealtimeTouch = Date.now();
        debouncedRefresh();
      }
    };

    if (eventTables.length > 0) {
      window.addEventListener(ADMIN_REALTIME_EVENT, handleGlobalEvent);
    }

    // Direct channel for tables outside global monitoring (admin + non-admin routes)
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (directTables.length > 0) {
      const name = channelName || `rt-${directTables.join('-')}-${Date.now()}`;
      channel = supabase.channel(name);
      for (const table of directTables) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            lastRealtimeTouch = Date.now();
            debouncedRefresh();
          }
        );
      }
      channel.subscribe();
    }

    // Optional stale fallback for exceptional cases only (disabled by default)
    const healthInterval =
      isAdminRoute && enableStaleFallback
        ? window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastRealtimeTouch > staleRefreshMs) {
              onUpdateRef.current();
            }
          }, healthCheckIntervalMs)
        : 0;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') debouncedRefresh();
    };

    if (enableVisibilityRefresh) {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearTimeout(initialRefreshTimer);
      if (eventTables.length > 0) {
        window.removeEventListener(ADMIN_REALTIME_EVENT, handleGlobalEvent);
      }
      if (channel) supabase.removeChannel(channel);
      if (healthInterval) clearInterval(healthInterval);
      if (enableVisibilityRefresh) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    tables.join('|'),
    debouncedRefresh,
    channelName,
    enableVisibilityRefresh,
    enableStaleFallback,
    staleRefreshMs,
    healthCheckIntervalMs,
  ]);
};

export default useAdminRealtime;

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { getAdminRealtimeLockRemaining } from "@/utils/adminRealtimeMutationGuard";

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

// ⚡ Global admin subscription coverage.
// IMPORTANT: Keep this ACTIONABLE-ONLY. Do not add noisy activity tables here
// (profiles, live_streams, stream_viewers, transactions, balance logs, etc.).
// Those tables can change every second and caused the whole Admin Panel to
// look like it was auto-refreshing. Admin pages load once and use manual
// refresh unless a table below is a real pending/security/notification event.
export const GLOBALLY_MONITORED_TABLES = new Set<string>([
  // Strict low-cost realtime allowlist: only tables still published server-side.
  // Everything else loads initially and uses manual refresh to prevent cost spikes.
  'support_tickets',
  'support_messages',
  'agency_withdrawals',
  'agencies',
  'face_verification_submissions',
  'notifications',
]);

// ============= HOOK =============

const DEFAULT_DEBOUNCE_MS = 120;
const DEFAULT_STALE_REFRESH_MS = 45_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;

interface UseAdminRealtimeOptions {
  debounceMs?: number;
  /**
   * Admin pages default to initial-load only to prevent noisy tables from
   * refreshing forms/lists every few seconds across the whole admin panel.
   */
  enableRealtimeRefresh?: boolean;
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
  const trackedTables = useMemo(() => Array.from(new Set(tables)), [tables.join('|')]);

  const isAdminRoute = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname.startsWith('/admin') ||
      window.location.hash.startsWith('#/admin') ||
      window.location.hash.includes('/admin')
    );
  }, []);

  const isOnAdminRoute = isAdminRoute();
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const enableRealtimeRefresh = !isOnAdminRoute && (options.enableRealtimeRefresh ?? false);
  const enableAdminDirectRealtime = isOnAdminRoute && options.enableRealtimeRefresh === true;
  const enableVisibilityRefresh = !isOnAdminRoute && (options.enableVisibilityRefresh ?? false);
  const enableStaleFallback = !isOnAdminRoute && (options.enableStaleFallback ?? false);
  const staleRefreshMs = options.staleRefreshMs ?? DEFAULT_STALE_REFRESH_MS;
  const healthCheckIntervalMs = options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const runRefresh = () => {
      const lockRemaining = getAdminRealtimeLockRemaining(trackedTables);

      if (lockRemaining > 0) {
        debounceRef.current = setTimeout(runRefresh, Math.min(lockRemaining + 60, 2000));
        return;
      }

      onUpdateRef.current();
    };

    debounceRef.current = setTimeout(runRefresh, debounceMs);
  }, [debounceMs, trackedTables]);

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

    let subscription: { unsubscribe: () => void } | null = null;

    if (isAdminRoute()) {
      if (getAdminSession()) doInitialFetch();
      const adminSessionHandler = () => {
        if (getAdminSession()) doInitialFetch();
      };
      window.addEventListener('storage', adminSessionHandler);
      window.addEventListener('admin-session-change', adminSessionHandler);
      subscription = {
        unsubscribe: () => {
          window.removeEventListener('storage', adminSessionHandler);
          window.removeEventListener('admin-session-change', adminSessionHandler);
        },
      };
    } else {
      // Non-admin fallback for any legacy usage outside /admin.
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) doInitialFetch();
      });

      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          doInitialFetch();
        }
      });
      subscription = data.subscription;
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
    };
  }, [isAdminRoute]);

  useEffect(() => {
    // 🔒 ADMIN: PUSH-ONLY refresh (Postgres realtime events).
    // No setInterval, no visibility polling, no stale-fallback timers.
    // Pages re-fetch ONLY when:
    //   1. Initial auth-aware mount (above effect), OR
    //   2. Postgres pushes a real change to a tracked table.
    if (isOnAdminRoute) {
      const eventTables = trackedTables.filter((t) => GLOBALLY_MONITORED_TABLES.has(t));
      const directTables = enableAdminDirectRealtime
        ? trackedTables.filter((t) => !GLOBALLY_MONITORED_TABLES.has(t))
        : [];

      const handleGlobalEvent = (e: Event) => {
        const detail = (e as CustomEvent<AdminTableUpdateEvent>).detail;
        if (detail?.table === '*' || eventTables.includes(detail?.table)) {
          debouncedRefresh();
        }
      };
      if (eventTables.length > 0) {
        window.addEventListener(ADMIN_REALTIME_EVENT, handleGlobalEvent);
      }

      let channel: ReturnType<typeof adminSupabase.channel> | null = null;
      if (directTables.length > 0) {
        const name = channelName || `rt-${directTables.join('-')}-${crypto.randomUUID()}`;
        channel = adminSupabase.channel(name);
        for (const table of directTables) {
          channel = channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => debouncedRefresh()
          );
        }
        channel.subscribe();
      }

      return () => {
        if (eventTables.length > 0) {
          window.removeEventListener(ADMIN_REALTIME_EVENT, handleGlobalEvent);
        }
        if (channel) adminSupabase.removeChannel(channel);
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

    // Non-admin routes — direct postgres_changes for legacy callers.
    const directTables = trackedTables.filter((t) => !GLOBALLY_MONITORED_TABLES.has(t));
    if (directTables.length === 0) {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
    const name = channelName || `rt-${directTables.join('-')}-${crypto.randomUUID()}`;
    let channel: ReturnType<typeof supabase.channel> = supabase.channel(name);
    for (const table of directTables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => debouncedRefresh()
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trackedTables.join('|'), debouncedRefresh, channelName, isOnAdminRoute]);
};

export default useAdminRealtime;

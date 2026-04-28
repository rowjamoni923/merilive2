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
  // Pending action tables (drive badge counts + toast alerts only)
  'helper_upgrade_requests',
  'helper_topup_requests',
  'helper_applications',
  'helper_message_replies',
  'helper_admin_messages',
  'helper_withdrawal_requests',
  'helper_orders',
  'support_tickets',
  'support_messages',
  'agency_withdrawals',
  'agencies',
  'host_conversion_requests',
  'host_applications',
  'payroll_requests',
  'user_reports',
  'face_verification_submissions',
  'chat_moderation_logs',
  'live_bans',
  'live_face_violations',
  'notifications',
  'admin_notices',
  'admin_notifications',

  // Admin session/security changes only
  'admin_logs',
  'admin_users',
  'admin_allowed_devices',
  'admin_section_permissions',

  // Pending finance/content approvals
  'rating_reward_claims',
  'leaderboard_reward_history',
  'agency_earnings_transfers',
  'coin_transfers',

  // Moderation/security queues
  'banned_devices',
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
    // Admin route: ALWAYS subscribe to window events for tables in the
    // global monitor set (Package 7 — global subscriber dispatches them).
    // Direct postgres_changes only used for tables outside the global set
    // or non-admin routes.
    const eventTables = isOnAdminRoute
      ? trackedTables.filter((t) => GLOBALLY_MONITORED_TABLES.has(t))
      : [];
    const directTables = isOnAdminRoute
      ? trackedTables.filter((t) => !GLOBALLY_MONITORED_TABLES.has(t))
      : trackedTables.filter((t) => !GLOBALLY_MONITORED_TABLES.has(t));

    if (isOnAdminRoute && eventTables.length === 0 && directTables.length === 0) {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

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
    let channel: ReturnType<typeof supabase.channel> | ReturnType<typeof adminSupabase.channel> | null = null;
    if (directTables.length > 0) {
      const realtimeClient = isOnAdminRoute ? adminSupabase : supabase;
      const name = channelName || `rt-${directTables.join('-')}-${crypto.randomUUID()}`;
      channel = realtimeClient.channel(name);
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
        isOnAdminRoute && enableStaleFallback
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
      if (channel) (isOnAdminRoute ? adminSupabase : supabase).removeChannel(channel as any);
      if (healthInterval) clearInterval(healthInterval);
      if (enableVisibilityRefresh) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
      trackedTables.join('|'),
    debouncedRefresh,
    channelName,
    enableRealtimeRefresh,
    enableVisibilityRefresh,
    enableStaleFallback,
    staleRefreshMs,
    healthCheckIntervalMs,
    isAdminRoute,
  ]);
};

export default useAdminRealtime;

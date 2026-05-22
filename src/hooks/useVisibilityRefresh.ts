import { useEffect, useRef } from "react";

/**
 * Pkg181a — Supabase-Realtime replacement for non-room feed pages.
 *
 * Strategy (professional pattern used by Instagram / TikTok feeds):
 *   1. Initial mount fetch (caller does this)
 *   2. Refetch when tab returns visible after `staleAfterMs` since last fetch
 *   3. Soft interval poll every `pollMs` ONLY while document is visible
 *   4. Pull-to-refresh (caller-owned) remains untouched
 *
 * Result: ZERO Supabase Realtime channel for these pages → kills the
 * per-row-change billing bleed on hot tables (profiles, gift_transactions,
 * party_room_participants, etc.).
 *
 * Polling cost = small fixed REST calls/min/user (covered by Supabase plan),
 * NOT per-row egress over Realtime.
 */
export function useVisibilityRefresh(
  refetch: () => void,
  opts: {
    pollMs?: number;        // default 60s while visible
    staleAfterMs?: number;  // default 25s — refetch on focus if stale
    enabled?: boolean;
  } = {}
) {
  const { pollMs = 60_000, staleAfterMs = 25_000, enabled = true } = opts;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const lastFetchRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const fire = () => {
      lastFetchRef.current = Date.now();
      try {
        refetchRef.current();
      } catch {
        /* swallow */
      }
    };

    // Soft poll while visible — pause when hidden.
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") fire();
      }, pollMs);
    };
    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const age = Date.now() - lastFetchRef.current;
        if (age >= staleAfterMs) fire();
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      stopInterval();
    };
  }, [enabled, pollMs, staleAfterMs]);
}

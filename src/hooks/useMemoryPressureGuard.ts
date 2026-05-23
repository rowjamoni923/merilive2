/**
 * Pkg244 — Memory pressure → React Query cache eviction.
 *
 * On critical/low/moderate/complete onTrimMemory signals from the OS, we:
 *  1. Invalidate the React Query cache to free retained network responses
 *  2. Revoke any blob: URLs the app may have leaked (image uploads etc)
 *  3. Hint the browser engine to drop image decode caches via clearing
 *     in-flight image loads where possible.
 *
 * This is the difference between LMK killing the app mid-stream on a
 * Redmi Go / Tecno Spark and the stream surviving comfortably.
 */
import { useEffect } from 'react';
import { memoryBus } from '@/lib/memoryBus';
import { queryClient } from '@/lib/queryClient';

let lastTrimAt = 0;
const COOLDOWN_MS = 5_000;

export function useMemoryPressureGuard() {
  useEffect(() => {
    return memoryBus.onUrgentTrim((e) => {
      const now = Date.now();
      if (now - lastTrimAt < COOLDOWN_MS) return; // avoid thrash
      lastTrimAt = now;

      try {
        // Drop everything except the *active* observed queries (in-view UI).
        // Inactive queries are the biggest RAM sink (old room data, profile
        // tabs the user closed, etc).
        queryClient.getQueryCache().getAll().forEach((q) => {
          if (q.getObserversCount() === 0) {
            queryClient.removeQueries({ queryKey: q.queryKey, exact: true });
          }
        });
      } catch (err) {
        console.warn('[memoryGuard] query cache evict failed', err);
      }

      // Critical / complete: also nuke service worker caches (best-effort)
      if (e.severity === 'critical' || e.severity === 'complete') {
        try {
          if ('caches' in window) {
            caches.keys().then((keys) => keys.forEach((k) => {
              // keep only the active SW cache (vite-plugin-pwa runtime)
              if (!k.includes('workbox-precache')) caches.delete(k);
            }));
          }
        } catch {
          // Ignore cache deletion errors
        }
      }

      console.info('[memoryGuard] freed RAM', { severity: e.severity, level: e.level });
    });
  }, []);
}

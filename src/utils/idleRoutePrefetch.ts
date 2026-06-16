/**
 * Idle-time route warm-up.
 * After the app's first paint we silently import the chunks for the most-visited
 * pages so the user's first navigation to any of them is instant (0 ms chunk fetch).
 *
 * - Runs once per session
 * - Uses requestIdleCallback (falls back to setTimeout) so it never competes with
 *   first-paint or user input
 * - Each import is wrapped in .catch(()=>{}) so a single 404 never breaks the chain
 */

let started = false;

const ric = (cb: () => void, timeout = 4000) => {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(cb, { timeout });
  else setTimeout(cb, 1500);
};

export function startIdleRoutePrefetch() {
  if (started || typeof window === 'undefined') return;
  // Native Android already has touch/pointer prefetch for the exact next route.
  // Bulk-importing dozens of chunks after launch competes with REST/realtime/media
  // traffic and makes the whole WebView feel slow on real devices.
  if ((window as any).Capacitor?.isNativePlatform?.()) return;
  started = true;

  const warmSequentially = (imports: Array<() => Promise<unknown>>, gap = 800) => {
    imports.forEach((load, index) => {
      window.setTimeout(() => load().catch(() => {}), index * gap);
    });
  };

  ric(() => {
    // Tier 1 — most opened from home / bottom nav
    warmSequentially([
      () => import('@/pages/Chat'),
      () => import('@/pages/ProfileDetail'),
      () => import('@/pages/LiveStream'),
      () => import('@/pages/PartyRoom'),
    ]);
  }, 2000);
}

/**
 * PKG434 Pass 10 — Idle-time route prefetch
 *
 * When the app is idle (requestIdleCallback / setTimeout fallback) and the
 * network looks healthy, silently fetch the JS chunks for routes the user is
 * very likely to visit next. The dynamic import() warms the browser module
 * cache; when the user actually navigates, the lazy chunk is already there
 * and the route paints instantly — no blank "loading…" flash.
 *
 * Skipped when:
 *   - save-data / 2g / 3g (cost-aware)
 *   - tab hidden (don't waste battery in background)
 *   - reduce-motion / low-end class on <html> (slow devices)
 *
 * Each chunk is fetched at most once per session (dedupe Set).
 * Errors are swallowed — prefetch is best-effort, never user-visible.
 */

const TOP_ROUTES: Array<() => Promise<unknown>> = [
  () => import("@/pages/Profile"),
  () => import("@/pages/Chat"),
  () => import("@/pages/Discover"),
  () => import("@/pages/Reels"),
  () => import("@/pages/Recharge"),
  () => import("@/pages/Tasks"),
  () => import("@/pages/Shop"),
  () => import("@/pages/SearchUsers"),
  () => import("@/pages/FollowingList"),
  () => import("@/pages/Settings"),
];

const fetched = new WeakSet<() => Promise<unknown>>();
let installed = false;

function isSlowNetwork(): boolean {
  try {
    const conn = (navigator as any).connection;
    if (!conn) return false;
    if (conn.saveData) return true;
    const t: string = conn.effectiveType || "";
    return t === "slow-2g" || t === "2g" || t === "3g";
  } catch {
    return false;
  }
}

function isLowEnd(): boolean {
  try {
    return document.documentElement.classList.contains("reduce-motion");
  } catch {
    return false;
  }
}

function schedule(cb: () => void, timeout = 4000) {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  if (typeof ric === "function") ric(cb, { timeout });
  else window.setTimeout(cb, timeout);
}

function prefetchOne(loader: () => Promise<unknown>) {
  if (fetched.has(loader)) return;
  fetched.add(loader);
  // Fire and forget; never throw.
  loader().catch(() => {
    /* network/chunk error — ignore, real nav will retry via lazyRetry */
  });
}

function runPrefetchPass() {
  if (document.visibilityState !== "visible") return;
  if (isSlowNetwork()) return;
  if (isLowEnd()) return;
  // Spread loads over multiple idle slots so we never block the main thread.
  TOP_ROUTES.forEach((loader, i) => {
    schedule(() => prefetchOne(loader), 1500 + i * 400);
  });
}

export function installRoutePrefetch() {
  if (installed) return;
  installed = true;
  // Initial pass after first paint settles.
  schedule(runPrefetchPass, 3500);
  // Re-attempt when user comes back to the tab (might have skipped before).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(runPrefetchPass, 1500);
  });
}

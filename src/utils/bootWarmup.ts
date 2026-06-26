/**
 * Boot Warmup — Phase 5
 *
 * Single network-aware, idle-deferred orchestrator that primes the assets
 * needed for zero-latency feel across gift / live / party / chat / profile
 * AFTER the user has authenticated and the first screen has painted.
 *
 * It does NOT replace per-panel prefetching — it only ensures the very first
 * panel open / first gift tap / first profile visit is already warm.
 *
 * Why this is safe (vs the egress concern that originally disabled boot
 * prewarm in App.tsx):
 *   - Skips entirely on `saveData`, `2g`, `slow-2g`.
 *   - Defers behind `requestIdleCallback` (5s timeout) — never competes with
 *     first-paint, route hydrate, or in-call traffic.
 *   - Reuses the same shared caches as runtime panels (gift IDB cache, VAP
 *     Cache API, SVGA Cache API), so nothing is fetched twice.
 *   - Runs ONCE per browser session (sessionStorage guard).
 *   - Top-N only (12 gifts / 8 VAPs / 12 SVGAs), hard byte budget enforced
 *     downstream by `vapWarmup` & `svgaPrewarm`.
 */

import { prefetchGifts } from '@/hooks/useGiftPrefetch';
import { ensureCachedIconUrl } from '@/utils/giftIconCache';

const SESSION_KEY = 'meri_boot_warmup_done_v1';
const TOP_ICON_COUNT = 24;

type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
};

function getConnection(): ConnectionLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as any).connection ?? (navigator as any).mozConnection ?? null;
}

function shouldSkipForNetwork(): boolean {
  const c = getConnection();
  if (!c) return false;
  if (c.saveData) return true;
  if (c.effectiveType && /2g|slow-2g/i.test(c.effectiveType)) return true;
  return false;
}

function idle(cb: () => void, timeout = 5000): number {
  if (typeof window === 'undefined') return 0;
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) return ric(cb, { timeout });
  return window.setTimeout(cb, 1500) as unknown as number;
}

let started = false;

/**
 * Kick off boot warmup. Call once after auth confirms the user has a session.
 * Idempotent across the session via sessionStorage.
 */
export function startBootWarmup(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  try {
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;
  } catch { /* ignore */ }

  if (shouldSkipForNetwork()) {
    return;
  }

  idle(() => {
    void runBootWarmup().catch(() => {});
  }, 5000);
}

async function runBootWarmup(): Promise<void> {
  // 1. Prime gift catalog + (top-8 icons + top-12 VAP composites — already
  //    handled inside prefetchGifts). This is the heaviest single win.
  const gifts = await prefetchGifts().catch(() => [] as any[]);

  // 2. Persist the top-N icon thumbnails into IndexedDB so SmartGiftIcon
  //    paints from local storage on the very first panel open (no network).
  const iconCandidates = gifts
    .slice(0, TOP_ICON_COUNT)
    .map((g) => g?.icon_url as string | null | undefined)
    .filter((u): u is string => Boolean(u))
    // Skip animated icons — SmartGiftIcon intentionally bypasses those.
    .filter((u) => !/\.(svga|json|mp4|webm|mov|m4v)(\?|$)/i.test(u));

  // Cap parallel IDB writes to avoid storage thrash on weak devices.
  const CONCURRENCY = 4;
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < iconCandidates.length) {
      const url = iconCandidates[cursor++];
      try { await ensureCachedIconUrl(url); } catch { /* ignore */ }
    }
  });
  await Promise.all(workers);

  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
}

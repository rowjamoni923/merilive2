/**
 * Lazy import with automatic retry on chunk load failure.
 * 
 * When a new deployment ships, JS chunk filenames change (new hashes).
 * If a user has the old index.html cached, dynamic imports for the OLD
 * chunk hashes will return 404 ("Failed to fetch dynamically imported module").
 * 
 * Strategy:
 *  1. Retry the same lazy import inline with short backoff for transient hiccups.
 *  2. Clear stale runtime asset caches and reload ONCE per module per session.
 *  3. If the same module still fails after that reload, throw to ErrorBoundary.
 */
export const isChunkLoadError = (error: any) =>
  error?.message?.includes('Failed to fetch dynamically imported module') ||
  error?.message?.includes('Loading chunk') ||
  error?.message?.includes('Importing a module script failed') ||
  error?.message?.includes('dynamically imported module') ||
  error?.name === 'ChunkLoadError';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare global {
  interface Window {
    __meriChunkRecoveryScheduled?: boolean;
  }
}

const RELOAD_KEY_PREFIX = 'meri_lazy_chunk_reload_v2:';

const getModuleKey = (source: string) => {
  const match = source.match(/import\(["'`](.*?)["'`]\)/);
  const raw = match?.[1] || source || 'unknown-module';
  return raw.replace(/[^a-z0-9._/-]+/gi, '_').slice(0, 120);
};

async function clearStaleRuntimeCaches() {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => /^(meri-assets-|workbox-|vite-|precache-|runtime-)/i.test(key))
        .map((key) => caches.delete(key)));
    }
  } catch {
    // best-effort only
  }

  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'MERI_CLEAR_APP_ASSET_CACHE' });
  } catch {
    // best-effort only
  }

  // Pkg54: aggressively unregister stale SWs that may still be serving old index.html.
  // Without this, every reload re-fetches the same broken HTML from the SW cache and
  // we get stuck in the "Updating MeriLive" loop forever.
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // best-effort only
  }
}

// Pkg54: allow up to 3 reload attempts per module per session.
// 1st: simple reload. 2nd+: cache-bust query string so CDN/browser fetches fresh index.html.
const MAX_RELOADS_PER_MODULE = 3;

export async function scheduleChunkLoadRecovery(error: any, source = ''): Promise<boolean> {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false;
  if (window.__meriChunkRecoveryScheduled) return true;

  const moduleKey = getModuleKey(source || error?.message || String(error));
  const reloadKey = `${RELOAD_KEY_PREFIX}${moduleKey}`;

  let attempts = 0;
  try {
    attempts = parseInt(sessionStorage.getItem(reloadKey) || '0', 10) || 0;
    if (attempts >= MAX_RELOADS_PER_MODULE) return false;
    sessionStorage.setItem(reloadKey, String(attempts + 1));
  } catch {
    // If storage is blocked, still try one in-memory recovery.
  }

  window.__meriChunkRecoveryScheduled = true;
  console.warn(`[LazyRetry] Recovering stale chunk (attempt ${attempts + 1}/${MAX_RELOADS_PER_MODULE}):`, moduleKey);
  await clearStaleRuntimeCaches();

  setTimeout(() => {
    try {
      // From attempt #2 onward: append cache-bust query param so we force-fetch
      // a fresh index.html (bypasses Cloudflare/browser HTML cache).
      if (attempts >= 1) {
        const url = new URL(window.location.href);
        url.searchParams.set('_cb', String(Date.now()));
        window.location.replace(url.toString());
      } else {
        window.location.reload();
      }
    } catch {
      window.location.href = window.location.href;
    }
  }, 80);

  return true;
}

/** Pkg54: called from ErrorBoundary "Try Again" — wipe per-module reload counters
 *  so a fresh recovery cycle can run. */
export function resetChunkRecoveryMarkers() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(RELOAD_KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // best-effort
  }
  try {
    if (typeof window !== 'undefined') window.__meriChunkRecoveryScheduled = false;
  } catch {}
}

export function lazyRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return async () => {
    // Inline retries first (handles transient network / dev-server hiccups
    // without a full page reload). Backoff: 250ms, 750ms, 1500ms.
    const delays = [250, 750, 1500];
    let lastError: unknown;
    try {
      return await importFn();
    } catch (e) {
      lastError = e;
      if (!isChunkLoadError(e)) throw e;
    }
    for (const d of delays) {
      await sleep(d);
      try {
        return await importFn();
      } catch (e) {
        lastError = e;
        if (!isChunkLoadError(e)) throw e;
      }
    }

    if (await scheduleChunkLoadRecovery(lastError, String(importFn))) {
      return new Promise(() => {}) as Promise<{ default: T }>;
    }

    console.error('[LazyRetry] Chunk failed after inline retries:', lastError);
    throw lastError;
  };
}

export function lazyRetryOptional<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback: React.ComponentType<any>,
): () => Promise<{ default: React.ComponentType<any> }> {
  const load = lazyRetry(importFn);

  return async () => {
    try {
      return await load();
    } catch (error) {
      console.error('[LazyRetry] Optional module failed, continuing without it:', error);
      return { default: fallback };
    }
  };
}

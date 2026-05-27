/**
 * Lazy import with automatic retry on chunk load failure.
 *
 * Post-deploy stale-chunk recovery: when index.html references chunk hashes
 * that no longer exist on the CDN, we wipe every cache layer (CacheStorage,
 * Service Workers, asset cache markers) and do a cache-busting reload so the
 * browser fetches a fresh index.html with the new hashes.
 */
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || '');
const getErrorName = (error: unknown) => error instanceof Error ? error.name : '';

export const isChunkLoadError = (error: unknown) => {
  const message = getErrorMessage(error);
  return message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('Importing a module script failed') ||
    message.includes('dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    getErrorName(error) === 'ChunkLoadError';
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare global {
  interface Window {
    __meriChunkRecoveryScheduled?: boolean;
  }
}

const RECOVERY_KEY_PREFIX = 'meri_lazy_chunk_recovery_v3:';
const GLOBAL_RELOAD_KEY = 'meri_chunk_auto_reload_v2';
const MAX_GLOBAL_RELOADS = 3;

const getModuleKey = (source: string) => {
  const match = source.match(/import\(["'`](.*?)["'`]\)/);
  const raw = match?.[1] || source || 'unknown-module';
  return raw.replace(/[^a-z0-9._/-]+/gi, '_').slice(0, 120);
};

export async function nukeAllAppCaches() {
  // 1) CacheStorage (workbox/vite/runtime)
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch { /* best-effort */ }

  // 2) Service Workers — unregister every one, otherwise they keep serving
  //    the stale index.html and we loop forever on the error screen.
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch { /* best-effort */ }

  // 3) Ask any controller still alive to drop its in-memory asset cache
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'MERI_CLEAR_APP_ASSET_CACHE' });
  } catch { /* best-effort */ }
}

export async function scheduleChunkLoadRecovery(error: unknown, source = ''): Promise<boolean> {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false;
  if (window.__meriChunkRecoveryScheduled) return true;

  window.__meriChunkRecoveryScheduled = true;
  const moduleKey = getModuleKey(source || getErrorMessage(error));
  console.warn('[LazyRetry] Stale chunk detected — nuking caches:', moduleKey);
  await nukeAllAppCaches();
  window.__meriChunkRecoveryScheduled = false;
  return false;
}

/** Reset all recovery markers so a fresh recovery cycle can run on next failure. */
export function resetChunkRecoveryMarkers() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith(RECOVERY_KEY_PREFIX) || k === GLOBAL_RELOAD_KEY)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch { /* best-effort */ }
  try {
    if (typeof window !== 'undefined') window.__meriChunkRecoveryScheduled = false;
  } catch { /* best-effort */ }
}

/**
 * Full recovery: nuke caches + SWs + cache-busting reload.
 * Bounded to MAX_GLOBAL_RELOADS per session to avoid infinite reload loops
 * when the CDN itself is broken. After the budget, the error boundary shows
 * a friendly retry button (which calls resetChunkRecoveryMarkers + this fn).
 */
export async function performChunkRecoveryReload(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  let count = 0;
  try {
    count = parseInt(sessionStorage.getItem(GLOBAL_RELOAD_KEY) || '0', 10) || 0;
  } catch { /* best-effort */ }
  if (count >= MAX_GLOBAL_RELOADS) {
    console.warn('[LazyRetry] Reload budget exhausted, surfacing manual retry.');
    return false;
  }
  try {
    sessionStorage.setItem(GLOBAL_RELOAD_KEY, String(count + 1));
  } catch { /* best-effort */ }

  await nukeAllAppCaches();

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

export function lazyRetry<T>(
  importFn: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return async () => {
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

    // Stale chunk after retries — let the ErrorBoundary do the heavy recovery
    // (nuke + reload). Throw so the boundary can react.
    console.error('[LazyRetry] Chunk failed after inline retries:', lastError);
    throw lastError;
  };
}

export function lazyRetryOptional<T>(
  importFn: () => Promise<{ default: T }>,
  fallback: T,
): () => Promise<{ default: T }> {
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

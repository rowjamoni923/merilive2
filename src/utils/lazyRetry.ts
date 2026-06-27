/**
 * Lazy import with automatic retry on chunk load failure.
 * 
 * Lazy import recovery.
 * Retries dynamic imports inline and clears stale runtime caches; persistent
 * stale chunks can trigger a bounded cache-busting boot so WebView never stays
 * on a blank screen.
 */
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || '');
const getErrorName = (error: unknown) => error instanceof Error ? error.name : '';

export const isChunkLoadError = (error: unknown) => {
  const message = getErrorMessage(error);
  return message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('Importing a module script failed') ||
    message.includes('dynamically imported module') ||
    message.includes('vite_preloadError') ||
    // Stale/empty module → `.then(m => ({ default: m.X }))` throws this when
    // the chunk resolved to undefined after a deploy. Treat as chunk error so
    // recovery (cache wipe + hard reload) runs instead of blank-screening.
    /Cannot read properties of undefined \(reading ['"`]/.test(message) ||
    /undefined is not an object \(evaluating /.test(message) ||
    getErrorName(error) === 'ChunkLoadError';
};

const assertLazyModule = <T,>(module: { default: T } | undefined | null, source: string): { default: T } => {
  if (!module || typeof module !== 'object' || !('default' in module) || module.default == null) {
    const error = new Error(`Lazy module resolved without a default export: ${getModuleKey(source)}`);
    error.name = 'ChunkLoadError';
    throw error;
  }
  return module;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare global {
  interface Window {
    __meriChunkRecoveryScheduled?: boolean;
    __meriChunkHardReloading?: boolean;
  }
}

const RECOVERY_KEY_PREFIX = 'meri_lazy_chunk_recovery_v3:';

const getModuleKey = (source: string) => {
  const match = source.match(/import\(["'`](.*?)["'`]\)/);
  const raw = match?.[1] || source || 'unknown-module';
  return raw.replace(/[^a-z0-9._/-]+/gi, '_').slice(0, 120);
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | undefined> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = window.setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

async function clearStaleRuntimeCaches() {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await withTimeout(caches.keys(), 600) || [];
      await withTimeout(Promise.all(keys.map((key) => caches.delete(key))), 900);
    }
  } catch {
    // best-effort only
  }

  try {
    if (typeof localStorage !== 'undefined') {
      // Clear specific cache keys but preserve auth
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('cache') || key.includes('query') || key.includes('vite'))) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {}

  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'MERI_CLEAR_APP_ASSET_CACHE' });
  } catch {
    // best-effort only
  }

  // CRITICAL: after a deploy the cached app-shell `index.html` references
  // chunk hashes that no longer exist on origin. Asset-cache wipe alone is
  // not enough — the navigation cache and the SW itself keep serving the
  // stale shell, looping the chunk-load error forever. Unregister every SW
  // so the next reload fetches a fresh index from origin directly.
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await withTimeout(navigator.serviceWorker.getRegistrations(), 700) || [];
      await withTimeout(Promise.all(regs.map((reg) => reg.unregister().catch(() => false))), 900);
    }
  } catch {
    // best-effort only
  }
}

/**
 * Force a clean reload that cannot be satisfied by any HTTP / SW cache layer.
 * Appends a cache-busting query so the origin must return a fresh index.html
 * with the current asset manifest.
 */
export function hardReloadForChunkRecovery() {
  if (typeof window === 'undefined') return;
  if (window.__meriChunkHardReloading) return;
  window.__meriChunkHardReloading = true;
  try {
    // Navigate to root with a cache-buster instead of reloading the current
    // path. The current route is the one whose lazy chunk just 404'd — a
    // same-URL reload immediately re-requests that dead chunk and loops the
    // error screen forever. Root is statically routed and forces the browser
    // to fetch the fresh index.html + new asset manifest from origin.
    const u = new URL(window.location.origin + '/');
    u.searchParams.set('_cb', String(Date.now()));
    window.location.replace(u.toString());
  } catch {
    try { window.location.replace('/'); } catch { /* noop */ }
  }
}

const MAX_RECOVERIES_PER_MODULE = 1;

export async function scheduleChunkLoadRecovery(error: unknown, source = ''): Promise<boolean> {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false;
  if (window.__meriChunkRecoveryScheduled) return true;

  const moduleKey = getModuleKey(source || getErrorMessage(error));
  const recoveryKey = `${RECOVERY_KEY_PREFIX}${moduleKey}`;

  let attempts = 0;
  try {
    attempts = parseInt(sessionStorage.getItem(recoveryKey) || '0', 10) || 0;
    if (attempts >= MAX_RECOVERIES_PER_MODULE) return false;
    sessionStorage.setItem(recoveryKey, String(attempts + 1));
  } catch {
    // If storage is blocked, still try one in-memory recovery.
  }

  window.__meriChunkRecoveryScheduled = true;
  console.warn(`[LazyRetry] Recovering stale chunk without reload (attempt ${attempts + 1}/${MAX_RECOVERIES_PER_MODULE}):`, moduleKey);
  await clearStaleRuntimeCaches();
  window.__meriChunkRecoveryScheduled = false;

  return true;
}

/** Called from ErrorBoundary "Try Again" — wipe per-module recovery counters
 *  so a fresh recovery cycle can run. */
export function resetChunkRecoveryMarkers() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(RECOVERY_KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // best-effort
  }
  try {
    if (typeof window !== 'undefined') window.__meriChunkRecoveryScheduled = false;
  } catch {
    // best-effort
  }
}

export function lazyRetry<T>(
  importFn: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return async () => {
    // Inline retries first (handles transient network / dev-server hiccups
    // without a full page reload). Backoff: 250ms, 750ms, 1500ms.
    const delays = [250, 750, 1500];
    let lastError: unknown;
    const source = String(importFn);
    try {
      return assertLazyModule(await importFn(), source);
    } catch (e) {
      lastError = e;
      if (!isChunkLoadError(e)) throw e;
    }
    for (const d of delays) {
      await sleep(d);
      try {
        return assertLazyModule(await importFn(), source);
      } catch (e) {
        lastError = e;
        if (!isChunkLoadError(e)) throw e;
      }
    }

    // Attempt cache-clearing recovery, then retry one final time so we never
    // leave a Suspense boundary stuck on a forever-pending promise (which
    // would render a blank screen with no recovery affordance).
    const recovered = await scheduleChunkLoadRecovery(lastError, source);
    if (recovered) {
      await sleep(400);
      try {
        return assertLazyModule(await importFn(), source);
      } catch (e) {
        lastError = e;
      }
    }

    console.error('[LazyRetry] Chunk failed after inline retries:', lastError);
    // Last resort — the in-memory importFn has the dead chunk URL baked in,
    // so no further retry can succeed in this session. Force a clean reload
    // from origin so the browser picks up the fresh asset manifest.
    if (isChunkLoadError(lastError)) {
      hardReloadForChunkRecovery();
      // Return a never-resolving promise so React doesn't render an error
      // flash before the navigation kicks in.
      await new Promise(() => {});
    }
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

export async function resilientImport<T>(
  importFn: () => Promise<T>,
  source = 'side-effect-import',
): Promise<T | undefined> {
  const delays = [250, 750, 1500];
  let lastError: unknown;

  try {
    return await importFn();
  } catch (error) {
    lastError = error;
    if (!isChunkLoadError(error)) throw error;
  }

  for (const delay of delays) {
    await sleep(delay);
    try {
      return await importFn();
    } catch (error) {
      lastError = error;
      if (!isChunkLoadError(error)) throw error;
    }
  }

  const recovered = await scheduleChunkLoadRecovery(lastError, source);
  if (recovered) {
    await sleep(300);
    try {
      return await importFn();
    } catch (error) {
      lastError = error;
    }
  }

  console.error('[LazyRetry] Side-effect import failed after retries:', source, lastError);
  return undefined;
}

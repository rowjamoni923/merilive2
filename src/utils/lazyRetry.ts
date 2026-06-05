/**
 * Lazy import with automatic retry on chunk load failure.
 * 
 * Zero-refresh lazy import recovery.
 * Retries dynamic imports inline and clears stale runtime caches, but never
 * calls window.location.reload/replace/href. The user explicitly requires no
 * automatic app reloads.
 */
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || '');
const getErrorName = (error: unknown) => error instanceof Error ? error.name : '';

export const isChunkLoadError = (error: unknown) => {
  const message = getErrorMessage(error);
  return message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('Importing a module script failed') ||
    message.includes('dynamically imported module') ||
    getErrorName(error) === 'ChunkLoadError';
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare global {
  interface Window {
    __meriChunkRecoveryScheduled?: boolean;
  }
}

const RECOVERY_KEY_PREFIX = 'meri_lazy_chunk_recovery_v3:';

const getModuleKey = (source: string) => {
  const match = source.match(/import\(["'`](.*?)["'`]\)/);
  const raw = match?.[1] || source || 'unknown-module';
  return raw.replace(/[^a-z0-9._/-]+/gi, '_').slice(0, 120);
};

async function clearStaleRuntimeCaches() {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
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

    // Attempt cache-clearing recovery, then retry one final time so we never
    // leave a Suspense boundary stuck on a forever-pending promise (which
    // would render a blank screen with no recovery affordance).
    const recovered = await scheduleChunkLoadRecovery(lastError, String(importFn));
    if (recovered) {
      await sleep(400);
      try {
        return await importFn();
      } catch (e) {
        lastError = e;
      }
    }

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

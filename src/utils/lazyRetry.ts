/**
 * Lazy import with automatic retry on chunk load failure.
 * 
 * When a new deployment ships, JS chunk filenames change (new hashes).
 * If a user has the old index.html cached, dynamic imports for the OLD
 * chunk hashes will return 404 ("Failed to fetch dynamically imported module").
 * 
 * Strategy:
 *  1. Retry the same lazy import inline with short backoff for transient
 *     network / dev-server hiccups.
 *  2. If it still fails, throw the error to the route ErrorBoundary.
 *
 * IMPORTANT: no hard page refresh here. The native app keeps data fresh through
 * realtime/query invalidation during normal use.
 */
const isChunkLoadError = (error: any) =>
  error?.message?.includes('Failed to fetch dynamically imported module') ||
  error?.message?.includes('Loading chunk') ||
  error?.message?.includes('Importing a module script failed') ||
  error?.name === 'ChunkLoadError';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

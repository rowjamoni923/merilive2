/**
 * Lazy import with automatic retry on chunk load failure.
 * 
 * When a new deployment ships, JS chunk filenames change (new hashes).
 * If a user has the old index.html cached, dynamic imports for the OLD
 * chunk hashes will return 404 ("Failed to fetch dynamically imported module").
 * 
 * Strategy:
 *  1. On first failure for a given module → reload the page once (gets fresh
 *     index.html with new chunk hashes). Tracked in sessionStorage so the
 *     reload only happens ONCE per module per session — no infinite loops.
 *  2. On second failure for the same module → throw the error so the
 *     ErrorBoundary can show its fallback UI.
 * 
 * This works on ALL routes including /admin — admin pages have no unsaved
 * client state worth preserving across a chunk-404 (the page literally hasn't
 * loaded yet), and stranding the admin on an error screen is far worse than
 * a clean reload.
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

    // Inline retries exhausted — likely a stale deploy. Reload once per module.
    const moduleKey = 'chunk-retry-' + importFn.toString().slice(0, 80);
    const hasRetried = sessionStorage.getItem(moduleKey);
    if (!hasRetried) {
      sessionStorage.setItem(moduleKey, '1');
      console.warn('[LazyRetry] Reloading to fetch fresh chunks...', lastError);
      window.location.reload();
      return new Promise<{ default: T }>(() => {});
    }
    sessionStorage.removeItem(moduleKey);
    console.error('[LazyRetry] Chunk still failing after reload:', lastError);
    throw lastError;
  };
}

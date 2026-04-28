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
export function lazyRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return () =>
    importFn().catch((error) => {
      // Identify the specific module so each chunk gets its own retry budget
      const moduleKey = 'chunk-retry-' + importFn.toString().slice(0, 80);
      const hasRetried = sessionStorage.getItem(moduleKey);

      const isChunkLoadError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Importing a module script failed') ||
        error?.name === 'ChunkLoadError';

      if (!isChunkLoadError) {
        // Real bug, not a stale-deploy issue — surface immediately
        throw error;
      }

      if (!hasRetried) {
        sessionStorage.setItem(moduleKey, '1');
        console.warn(
          '[LazyRetry] Stale chunk detected (likely after a new deploy). Reloading once to fetch fresh assets...',
          error,
        );
        // Hard reload — bypasses HTTP cache for index.html
        window.location.reload();
        // Suspend the failing import while the page reloads
        return new Promise<{ default: T }>(() => {});
      }

      // Already retried this module once this session — reload didn't help.
      // Clear the flag so a future navigation can try again, then surface the error.
      sessionStorage.removeItem(moduleKey);
      console.error('[LazyRetry] Chunk still failing after reload:', error);
      throw error;
    });
}

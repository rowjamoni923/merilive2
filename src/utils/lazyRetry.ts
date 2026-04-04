/**
 * Lazy import with automatic retry on chunk load failure.
 * When a new deployment changes chunk hashes, cached pages may fail to load.
 * This retries once with a cache-busting reload.
 */
export function lazyRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return () =>
    importFn().catch((error) => {
      // Only retry once per session per module
      const key = 'chunk-retry-' + importFn.toString().slice(0, 50);
      const hasRetried = sessionStorage.getItem(key);
      
      if (!hasRetried) {
        sessionStorage.setItem(key, '1');
        console.warn('[LazyRetry] Chunk load failed, reloading page...', error);
        window.location.reload();
        // Return a never-resolving promise while page reloads
        return new Promise(() => {});
      }
      
      // Already retried, throw the error
      sessionStorage.removeItem(key);
      throw error;
    });
}

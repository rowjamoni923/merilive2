import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { getAdaptiveNetworkProfile } from '@/utils/connectionProfile';
import { maybeTriggerAuthGuardFromError } from '@/lib/authGuard';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => { maybeTriggerAuthGuardFromError(err); },
  }),
  mutationCache: new MutationCache({
  }),
  defaultOptions: {
    queries: {
      // Instant app-wide loading: prefer persisted/cache data on navigation.
      // Realtime bridges + explicit invalidations keep active screens fresh
      // without refetching every page every time it mounts.
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 120,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: (failureCount: number) => {
        const { queryRetryCount } = getAdaptiveNetworkProfile();
        return failureCount < queryRetryCount;
      },
      retryDelay: (attemptIndex: number) => {
        const { queryRetryBaseDelayMs, queryRetryMaxDelayMs } = getAdaptiveNetworkProfile();
        return Math.min(queryRetryBaseDelayMs * 2 ** Math.max(0, attemptIndex - 1), queryRetryMaxDelayMs);
      },
      placeholderData: (prev: any) => prev,
      networkMode: 'offlineFirst',
    },
  },
});

export const queryPersister = (() => {
  try {
    if (typeof window === 'undefined') return undefined;
    const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: 'merilive-rq-cache-v1',
      // localStorage persistence is synchronous; writing a dehydrated cache a few
      // seconds after login was visible as WebView jank. Keep instant in-memory
      // React Query behavior, but persist less aggressively in the background.
      throttleTime: isNative ? 120000 : 60000,
    });
  } catch {
    return undefined;
  }
})();

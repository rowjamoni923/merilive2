import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { getAdaptiveNetworkProfile } from '@/utils/connectionProfile';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 300,
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
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: 'merilive-rq-cache-v1',
      throttleTime: 1000,
    });
  } catch {
    return undefined;
  }
})();

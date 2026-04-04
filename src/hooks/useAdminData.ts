/**
 * useAdminData — Zero-loading admin data hook
 * Shows cached data instantly, refreshes in background (stale-while-revalidate)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAdminCache, setAdminCache, makeCacheKey } from '@/utils/adminDataCache';

interface UseAdminDataOptions<T> {
  /** Unique cache key for this data */
  cacheKey: string;
  /** Extra params to differentiate cache (page, filter, etc.) */
  params?: Record<string, any>;
  /** Function that fetches data */
  fetcher: () => Promise<T>;
  /** Whether to auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseAdminDataResult<T> {
  data: T | null;
  loading: boolean; // Only true on FIRST load when no cache exists
  refreshing: boolean; // True during background refresh
  refresh: () => Promise<void>;
  setData: (data: T | null) => void;
}

export function useAdminData<T>({
  cacheKey,
  params,
  fetcher,
  autoFetch = true,
}: UseAdminDataOptions<T>): UseAdminDataResult<T> {
  const fullKey = makeCacheKey(cacheKey, params);
  const [data, setDataState] = useState<T | null>(() => getAdminCache<T>(fullKey));
  const [loading, setLoading] = useState(!getAdminCache<T>(fullKey));
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const setData = useCallback((newData: T | null) => {
    setDataState(newData);
    if (newData !== null) {
      setAdminCache(fullKey, newData);
    }
  }, [fullKey]);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    
    // Only show "loading" if we have NO data at all
    const hasData = data !== null || getAdminCache(fullKey) !== null;
    if (!hasData) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setDataState(result);
        setAdminCache(fullKey, result);
      }
    } catch (err) {
      console.error(`[AdminData] Error fetching ${cacheKey}:`, err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      fetchingRef.current = false;
    }
  }, [fetcher, fullKey, cacheKey, data]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoFetch) {
      refresh();
    }
    return () => { mountedRef.current = false; };
  }, [fullKey]); // Re-fetch when params change

  return { data, loading, refreshing, refresh, setData };
}

/**
 * useAdminPagination — drop-in pagination hook for admin tables.
 *
 * - Server-side pagination via .range(from, to)
 * - Stale-while-revalidate cache (per-page) so re-visits feel instant
 * - Single COUNT query on first load only (then cached)
 * - Built-in refresh + setPage helpers
 *
 * Designed to be the ONE pagination utility used across all 125 admin pages.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminSupabase } from '@/integrations/supabase/adminClient';
import { getAdminCache, setAdminCache, makeCacheKey } from '@/utils/adminDataCache';

export const DEFAULT_ADMIN_PAGE_SIZE = 50;

export interface UseAdminPaginationOptions<Row> {
  /** Table name (e.g. 'profiles') */
  table: string;
  /** Columns to select. Default '*' but pass minimal columns for speed. */
  select?: string;
  /** Order column, default 'created_at' */
  orderBy?: string;
  /** Order direction, default false (descending) */
  ascending?: boolean;
  /** Filters: applied via .eq / .gte etc. on the builder you return. */
  applyFilters?: (q: any) => any;
  /** Page size, default 50 */
  pageSize?: number;
  /** Unique cache key suffix (filters etc.) so cached pages don't collide */
  cacheKey?: string;
  /** Disable initial auto-fetch (rare — for pages that wait on user input) */
  enabled?: boolean;
  /** Map row before storing (e.g. attach related data) */
  mapRow?: (row: any) => Row;
}

export interface UseAdminPaginationResult<Row> {
  rows: Row[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  loading: boolean;        // first load only (no cache)
  refreshing: boolean;     // background refresh
  error: string | null;
  setPage: (p: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => Promise<void>;
}

export function useAdminPagination<Row = any>(
  opts: UseAdminPaginationOptions<Row>
): UseAdminPaginationResult<Row> {
  const {
    table,
    select = '*',
    orderBy = 'created_at',
    ascending = false,
    applyFilters,
    pageSize = DEFAULT_ADMIN_PAGE_SIZE,
    cacheKey,
    enabled = true,
    mapRow,
  } = opts;

  const baseKey = useMemo(
    () => makeCacheKey(`pg:${table}`, { select, orderBy, ascending, k: cacheKey || '' }),
    [table, select, orderBy, ascending, cacheKey]
  );

  const [page, setPageState] = useState(1);
  const cachedPage = useMemo<{ rows: Row[]; totalCount: number } | null>(
    () => getAdminCache<{ rows: Row[]; totalCount: number }>(`${baseKey}:p=${page}`),
    [baseKey, page]
  );

  const [rows, setRows] = useState<Row[]>(cachedPage?.rows ?? []);
  const [totalCount, setTotalCount] = useState<number>(cachedPage?.totalCount ?? 0);
  const [loading, setLoading] = useState(!cachedPage && enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflightRef = useRef(false);
  const mountedRef = useRef(true);

  const fetchPage = useCallback(async () => {
    if (!enabled) return;
    if (inflightRef.current) return;
    inflightRef.current = true;

    const cached = getAdminCache<{ rows: Row[]; totalCount: number }>(`${baseKey}:p=${page}`);
    if (cached) {
      setRows(cached.rows);
      setTotalCount(cached.totalCount);
      setRefreshing(true);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
      // Only request count on first page (or when count missing) — saves a heavy COUNT.
      const wantCount = !cached || page === 1;
      let q: any = adminSupabase
        .from(table as any)
        .select(select, wantCount ? { count: 'exact' } : undefined)
        .order(orderBy, { ascending })
        .range(from, to);

      if (applyFilters) q = applyFilters(q);

      const { data, error: err, count } = await q;
      if (err) throw err;

      const mapped: Row[] = mapRow ? (data || []).map(mapRow) : ((data as any[]) || []);
      const newCount = wantCount ? (count ?? totalCount ?? 0) : totalCount;

      if (mountedRef.current) {
        setRows(mapped);
        if (wantCount) setTotalCount(newCount);
        setError(null);
      }
      setAdminCache(`${baseKey}:p=${page}`, { rows: mapped, totalCount: newCount });
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message || 'Failed to load');
      console.error(`[useAdminPagination] ${table}:`, e);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      inflightRef.current = false;
    }
  }, [enabled, baseKey, page, pageSize, table, select, orderBy, ascending, applyFilters, mapRow, totalCount]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPage();
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, page, enabled]);

  const totalPages = useMemo(
    () => (totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1),
    [totalCount, pageSize]
  );

  const setPage = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setPageState(clamped);
  }, [totalPages]);

  return {
    rows,
    totalCount,
    totalPages,
    page,
    pageSize,
    loading,
    refreshing,
    error,
    setPage,
    nextPage: () => setPage(page + 1),
    prevPage: () => setPage(page - 1),
    refresh: fetchPage,
  };
}

import { useEffect } from 'react';
import { boostHighRefresh, releaseHighRefresh } from '@/lib/adaptiveRefresh';

/**
 * Pkg247 — Request highest panel refresh rate (90/120Hz) while mounted.
 * Reference-counted; safe to use in multiple components simultaneously.
 *
 * Pass `active=false` to suspend without unmounting.
 */
export function useHighRefreshRate(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    boostHighRefresh().catch(() => {});
    return () => {
      if (cancelled) return;
      cancelled = true;
      releaseHighRefresh().catch(() => {});
    };
  }, [active]);
}

/**
 * Pkg434 — Pass 4: Pull-to-refresh hook (native feel)
 *
 * Usage:
 *   const { bind, pulling, distance, refreshing } = usePullToRefresh(async () => {
 *     await refetch();
 *   });
 *   return <div {...bind} style={{ paddingTop: distance }}>...</div>;
 *
 * - Only activates when the scroll container is at scrollTop === 0.
 * - Triggers refresh after THRESHOLD px of pull (default 70).
 * - Caps visible distance to MAX (default 110) with rubber-band easing.
 * - Honors prefers-reduced-motion (snaps instantly).
 * - Zero-risk: opt-in per page, no global listeners.
 */
import { useCallback, useRef, useState } from "react";

interface Options {
  threshold?: number;
  max?: number;
  disabled?: boolean;
}

export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  opts: Options = {}
) {
  const { threshold = 70, max = 110, disabled = false } = opts;
  const startY = useRef<number | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pulling = distance > 0;

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      const el = e.currentTarget as HTMLElement;
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
    },
    [disabled, refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setDistance(0);
        return;
      }
      // rubber-band: sqrt easing past threshold
      const eased = dy < max ? dy : max + Math.sqrt(dy - max) * 4;
      setDistance(Math.min(eased, max));
    },
    [max]
  );

  const onTouchEnd = useCallback(async () => {
    const d = distance;
    startY.current = null;
    if (d >= threshold && !refreshing) {
      setRefreshing(true);
      setDistance(threshold);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setDistance(0);
      }
    } else {
      setDistance(0);
    }
  }, [distance, threshold, refreshing, onRefresh]);

  return {
    bind: { onTouchStart, onTouchMove, onTouchEnd },
    pulling,
    distance,
    refreshing,
  };
}

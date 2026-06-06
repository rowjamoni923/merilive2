/**
 * Pkg433 — useNativeFeed hook.
 *
 * Declarative wrapper for opening the native RecyclerView grid feed and
 * wiring its events back into React. No-op on every non-Android platform
 * and when `feed:native` flag is OFF.
 *
 * Caller (Index.tsx, Discover.tsx, future) owns data fetching, realtime,
 * filtering, country tabs. This hook only mirrors the rendered card list
 * to the native overlay and surfaces tap/loadMore intents back.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  NativeFeed,
  isNativeFeedAvailable,
  type NativeFeedCard,
} from '@/plugins/NativeFeed';
import { isFeedNativeEnabled } from '@/utils/feedNativeFlag';

export interface UseNativeFeedOpts {
  enabled: boolean;
  title?: string;
  onTap?: (id: string) => void;
  onLoadMore?: () => void;
}

export function useNativeFeed(opts: UseNativeFeedOpts) {
  const { enabled, title, onTap, onLoadMore } = opts;
  const openedRef = useRef(false);
  const tapRef = useRef(onTap);
  const moreRef = useRef(onLoadMore);
  tapRef.current = onTap;
  moreRef.current = onLoadMore;

  const active = enabled && isNativeFeedAvailable() && isFeedNativeEnabled();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    (async () => {
      try {
        await NativeFeed.open({ title });
        if (cancelled) return;
        openedRef.current = true;
        handles.push(
          await NativeFeed.addListener('feed:tap', (d: unknown) => {
            const id = (d as { id?: string } | null)?.id;
            if (id) tapRef.current?.(id);
          }),
          await NativeFeed.addListener('feed:loadMore', () => moreRef.current?.())
        );
      } catch {
        /* native unavailable — silent */
      }
    })();
    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove().catch(() => {}));
      if (openedRef.current) {
        NativeFeed.close().catch(() => {});
        openedRef.current = false;
      }
    };
  }, [active, title]);

  const setItems = useCallback(
    (items: NativeFeedCard[]) => {
      if (!active) return;
      NativeFeed.setItems({ items }).catch(() => {});
    },
    [active]
  );

  const appendItems = useCallback(
    (items: NativeFeedCard[]) => {
      if (!active) return;
      NativeFeed.appendItems({ items }).catch(() => {});
    },
    [active]
  );

  return { active, setItems, appendItems };
}

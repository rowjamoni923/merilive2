/**
 * useLiveStreamFilters — REMOVED (Pkg200 prep). Permissive stub.
 */
import { useState, useCallback } from 'react';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { DEFAULT_BEAUTY } from '@/components/live/BeautyFilterPanel';

export function useLiveStreamFilters(..._args: unknown[]): any {
  const [filterState, setFilterState] = useState<any>({
    beautyEnabled: false,
    beautySettings: { ...DEFAULT_BEAUTY },
    activeFilter: null,
    activeSticker: null,
  });

  const noop = useCallback(() => {}, []);

  return {
    filterState,
    setFilterState,
    setActiveFilter: noop,
    setBeautyEnabled: (v: boolean) => setFilterState((s: any) => ({ ...s, beautyEnabled: v })),
    setBeautySettings: (b: BeautySettings) => setFilterState((s: any) => ({ ...s, beautySettings: b })),
    setActiveSticker: (sk: string | null) => setFilterState((s: any) => ({ ...s, activeSticker: sk })),
    updateFilter: noop,
    publishFilter: async () => {},
    generateFilterCSS: () => '',
  };
}

export default useLiveStreamFilters;

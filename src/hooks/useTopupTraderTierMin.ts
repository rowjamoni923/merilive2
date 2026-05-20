/**
 * Pkg70 — React hook for admin-configurable trader tier-min wallet thresholds.
 *
 * Reads `app_settings.topup_trader_tier_min_wallet` via the existing
 * global-settings cache (real-time synced, no extra network calls).
 */

import { useMemo } from 'react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import {
  DEFAULT_TIER_MIN,
  TIER_MIN_SETTING_KEY,
  parseTierMinSetting,
  getTierMin,
  type TierMinMap,
} from '@/lib/topupTraderTierMin';

export function useTopupTraderTierMin(): {
  tierMin: TierMinMap;
  getMin: (level: number | null | undefined) => number;
  isDefault: boolean;
  loading: boolean;
} {
  const { settings } = useGlobalSettings();
  const raw = (settings.rawAppSettings ?? {})[TIER_MIN_SETTING_KEY];

  const tierMin = useMemo(() => parseTierMinSetting(raw), [raw]);

  const isDefault = useMemo(
    () => (Object.keys(DEFAULT_TIER_MIN) as unknown as number[]).every(
      (k) => tierMin[Number(k)] === DEFAULT_TIER_MIN[Number(k)],
    ),
    [tierMin],
  );

  return {
    tierMin,
    getMin: (lvl) => getTierMin(tierMin, lvl),
    isDefault,
    loading: settings.isLoading,
  };
}

export default useTopupTraderTierMin;

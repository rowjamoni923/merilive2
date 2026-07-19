/**
 * =====================================================
 * GLOBAL APP SETTINGS HOOK
 * =====================================================
 * 
 * Centralized hook for ALL admin-configurable settings
 * with REAL-TIME synchronization across the app.
 * 
 * Any settings changed from Admin Panel will be 
 * instantly updated across the entire app.
 * 
 * Usage:
 * const { callRates, giftCommission, partyLimits, loading } = useGlobalAppSettings();
 * =====================================================
 */

import { useCallback, useMemo } from 'react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

// ========== TYPE DEFINITIONS ==========

export interface CallRates {
  default_rate: number;
  min_rate: number;
  max_rate: number;
  host_commission_percent: number;
  call_timeout_seconds: number;
  first_minute_grace_seconds: number;
  level_rates?: Array<{ level: number; rate: number }>;
  min_level_for_custom_rate?: number;
}

export interface GiftCommission {
  host_percent: number;
  company_percent: number;
}

export interface PartyRoomLimits {
  max_video_participants: number;
  max_audio_participants: number;
  max_game_participants: number;
}

export interface LevelThresholds {
  levels: Array<{
    level: number;
    min_exp: number;
    max_exp: number;
  }>;
}

export interface WithdrawalSettings {
  min_amount: number;
  max_amount: number;
  fee_percent: number;
  processing_days: number;
}

export interface DiamondExchangeSettings {
  beans_per_diamond: number;
  min_exchange: number;
}

export interface GlobalAppSettings {
  callRates: CallRates | null;
  giftCommission: GiftCommission | null;
  partyLimits: PartyRoomLimits | null;
  levelThresholds: LevelThresholds | null;
  withdrawalSettings: WithdrawalSettings | null;
  diamondExchange: DiamondExchangeSettings | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

// ========== MAIN HOOK ==========
export function useGlobalAppSettings(): GlobalAppSettings {
  const { settings, refresh } = useGlobalSettings();

  const raw = settings.rawAppSettings ?? {};

  const callRates = useMemo<CallRates | null>(() => {
    const value = raw.call_rates;
    if (!value && !settings.callRates) return null;

    return {
      default_rate: Number(value?.default_rate ?? value?.per_minute_rate ?? settings.callRates?.default_rate ?? 0),
      min_rate: Number(value?.min_rate ?? settings.callRates?.min_rate ?? 0),
      max_rate: Number(value?.max_rate ?? settings.callRates?.max_rate ?? 0),
      host_commission_percent: Number(value?.host_commission_percent ?? settings.callRates?.host_commission_percent ?? 0),
      call_timeout_seconds: Number(value?.call_timeout_seconds ?? 0),
      first_minute_grace_seconds: Number(value?.first_minute_grace_seconds ?? 0),
      level_rates: Array.isArray(value?.level_rates) ? value.level_rates : (settings.callRates?.level_rates ?? []),
      min_level_for_custom_rate: Number(value?.min_level_for_custom_rate ?? settings.callRates?.min_level_for_custom_rate ?? 0),
    };
  }, [raw, settings.callRates]);

  const giftCommission = useMemo<GiftCommission | null>(() => {
    const value = raw.gift_commission;
    if (!value && settings.hostCommissionPercent === undefined) return null;

    const hostPercent = Number(value?.host_percent ?? value?.hostPercent ?? settings.hostCommissionPercent ?? 0);
    return {
      host_percent: hostPercent,
      company_percent: Number(value?.company_percent ?? (100 - hostPercent)),
    };
  }, [raw, settings.hostCommissionPercent]);

  const partyLimits = useMemo<PartyRoomLimits | null>(() => {
    const value = raw.party_room_limits;
    if (!value) return null;

    return {
      max_video_participants: Number(value.max_video_participants ?? 0),
      max_audio_participants: Number(value.max_audio_participants ?? 0),
      max_game_participants: Number(value.max_game_participants ?? 0),
    };
  }, [raw]);

  const levelThresholds = useMemo<LevelThresholds | null>(() => {
    const value = raw.level_thresholds;
    if (!value) return null;

    return {
      levels: Array.isArray(value.levels) ? value.levels : [],
    };
  }, [raw]);

  const withdrawalSettings = useMemo<WithdrawalSettings | null>(() => {
    const value = raw.withdrawal_settings;
    if (!value && settings.minWithdrawalDollars === undefined) return null;

    return {
      min_amount: Number(value?.min_amount ?? settings.minWithdrawalDollars ?? 0),
      max_amount: Number(value?.max_amount ?? 0),
      fee_percent: Number(value?.fee_percent ?? settings.withdrawalPlatformFeePercent ?? 0),
      processing_days: Number(value?.processing_days ?? 0),
    };
  }, [raw, settings.minWithdrawalDollars, settings.withdrawalPlatformFeePercent]);

  const diamondExchange = useMemo<DiamondExchangeSettings | null>(() => {
    const value = raw.diamond_exchange;
    if (!value) return null;

    return {
      beans_per_diamond: Number(value.beans_per_diamond ?? 0),
      min_exchange: Number(value.min_exchange ?? 0),
    };
  }, [raw]);

  const refetch = useCallback(async () => {
    await refresh();
  }, [refresh]);
  
  return {
    callRates,
    giftCommission,
    partyLimits,
    levelThresholds,
    withdrawalSettings,
    diamondExchange,
    loading: settings.isLoading,
    refetch,
  };
}

// ========== INDIVIDUAL SETTING HOOKS ==========

/**
 * Hook for call rates only - lightweight
 */
export function useCallRatesSettings() {
  const { callRates, loading, refetch } = useGlobalAppSettings();
  return { callRates, loading, refetch };
}

/**
 * Hook for gift commission only - lightweight
 */
export function useGiftCommissionSettings() {
  const { giftCommission, loading, refetch } = useGlobalAppSettings();
  return { giftCommission, loading, refetch };
}

/**
 * Hook for party limits only - lightweight
 */
export function usePartyLimitsSettings() {
  const { partyLimits, loading, refetch } = useGlobalAppSettings();
  return { partyLimits, loading, refetch };
}

export default useGlobalAppSettings;

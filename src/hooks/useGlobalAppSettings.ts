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

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

// ========== DEFAULT VALUES ==========
// NO DEFAULTS - Everything comes from admin panel database
// Values are null until fetched from app_settings table

// ========== GLOBAL STATE (Shared across components) ==========
let globalCallRates: CallRates | null = null;
let globalGiftCommission: GiftCommission | null = null;
let globalPartyLimits: PartyRoomLimits | null = null;
let globalLevelThresholds: LevelThresholds | null = null;
let globalWithdrawal: WithdrawalSettings | null = null;
let globalDiamondExchange: DiamondExchangeSettings | null = null;
let initialized = false;

const subscribers = new Set<() => void>();

const notifySubscribers = () => {
  subscribers.forEach(callback => callback());
};

// ========== FETCH FUNCTIONS ==========
const fetchAllSettings = async () => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('setting_key, setting_value');
    
    if (error) {
      console.error('[GlobalSettings] Error fetching settings:', error);
      return;
    }
    
    if (data) {
      data.forEach((setting) => {
        const value = setting.setting_value as any;
        
        switch (setting.setting_key) {
          case 'call_rates':
            globalCallRates = {
              default_rate: value.default_rate ?? 0,
              min_rate: value.min_rate ?? 0,
              max_rate: value.max_rate ?? 0,
              host_commission_percent: value.host_commission_percent ?? 0,
              call_timeout_seconds: value.call_timeout_seconds ?? 0,
              first_minute_grace_seconds: value.first_minute_grace_seconds ?? 0,
              level_rates: value.level_rates ?? [],
              min_level_for_custom_rate: value.min_level_for_custom_rate ?? 0,
            };
            break;
          
          case 'gift_commission':
            const hostPercent = value.host_percent ?? value.hostPercent ?? 0;
            globalGiftCommission = {
              host_percent: hostPercent,
              company_percent: 100 - hostPercent,
            };
            break;
          
          case 'party_room_limits':
            globalPartyLimits = {
              max_video_participants: value.max_video_participants ?? 0,
              max_audio_participants: value.max_audio_participants ?? 0,
              max_game_participants: value.max_game_participants ?? 0,
            };
            break;
          
          case 'level_thresholds':
            globalLevelThresholds = {
              levels: value.levels ?? [],
            };
            break;
          
          case 'withdrawal_settings':
            globalWithdrawal = {
              min_amount: value.min_amount ?? 0,
              max_amount: value.max_amount ?? 0,
              fee_percent: value.fee_percent ?? 0,
              processing_days: value.processing_days ?? 0,
            };
            break;
          
          case 'coin_exchange':
            globalDiamondExchange = {
              beans_per_diamond: value.beans_per_diamond ?? 0,
              min_exchange: value.min_exchange ?? 0,
            };
            break;
        }
      });
      
      console.log('[GlobalSettings] ✅ All settings loaded:', {
        callRates: globalCallRates,
        giftCommission: globalGiftCommission,
        partyLimits: globalPartyLimits,
      });
    }
    
    initialized = true;
    notifySubscribers();
  } catch (err) {
    console.error('[GlobalSettings] Exception fetching settings:', err);
  }
};

// ========== REALTIME SUBSCRIPTION ==========
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

const initializeRealtime = () => {
  // No-op: useGlobalSettings.ts already subscribes to app_settings changes.
  // Removed duplicate realtime channel to reduce DB connection pressure.
};

// ========== MAIN HOOK ==========
export function useGlobalAppSettings(): GlobalAppSettings {
  const [, forceUpdate] = useState({});
  const [loading, setLoading] = useState(!initialized);
  
  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchAllSettings();
    setLoading(false);
  }, []);
  
  useEffect(() => {
    // Initialize on first mount
    if (!initialized) {
      fetchAllSettings().then(() => setLoading(false));
    } else {
      setLoading(false);
    }
    
    initializeRealtime();
    
    // Subscribe to updates
    const update = () => forceUpdate({});
    subscribers.add(update);
    
    return () => {
      subscribers.delete(update);
    };
  }, []);
  
  return {
    callRates: globalCallRates,
    giftCommission: globalGiftCommission,
    partyLimits: globalPartyLimits,
    levelThresholds: globalLevelThresholds,
    withdrawalSettings: globalWithdrawal,
    diamondExchange: globalDiamondExchange,
    loading,
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

// Deferred: only fetch when first hook mounts (not on import)
// This prevents blocking the boot path with eager network requests.

export default useGlobalAppSettings;

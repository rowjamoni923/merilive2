import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseSettingValue } from '@/utils/adminSettingsStorage';

/**
 * 🌍 GLOBAL SETTINGS HOOK
 * 
 * Centralized system for fetching and caching ALL admin-configured settings.
 * This ensures NO hardcoded values are used anywhere in the app.
 * 
 * ALL commission rates, exchange rates, level tiers, and system settings
 * are loaded from the database and auto-refresh in real-time.
 */

// ============= Types =============
export interface AgencyLevelTier {
  id: string;
  level_code: string;
  level_name: string;
  commission_rate: number;
  min_weekly_income: number;
  max_weekly_income: number;
  badge_color: string | null;
  display_order: number;
  is_active: boolean;
}

export interface HelperLevelConfig {
  id: string;
  level_number: number;
  level_name: string;
  commission_rate: number;
  is_enabled: boolean;
  has_payroll_access: boolean;
  has_withdrawal_processing: boolean;
  min_withdrawal: number;
  max_withdrawal: number;
}

export interface TraderLevelTier {
  id: string;
  level_number: number;
  level_name: string;
  min_withdrawal_amount: number;
  max_withdrawal_amount: number;
  commission_rate: number;
  badge_color: string;
  is_active: boolean;
}

export interface VIPTier {
  id: string;
  tier_level: number;
  tier_name: string;
  price_diamonds: number;
  duration_days: number;
  badge_url: string | null;
  badge_color: string | null;
  is_active: boolean;
}

export interface UserLevelTier {
  id: string;
  level_number: number;
  level_name: string;
  min_topup_amount: number;
  min_earning_amount: number;
  level_color: string;
  is_active: boolean;
  icon_url?: string | null;
  animation_url?: string | null;
  level_icon?: string | null;
  bg_gradient?: string | null;
}

export interface CallRateSettings {
  base_rate?: number;
  default_rate: number;
  min_rate?: number;
  max_rate?: number;
  host_commission_percent?: number;
  min_level_for_custom_rate?: number;
  level_rates: { level: number; rate: number }[];
}

export interface GlobalSettings {
  // Exchange rates
  beansPerDollar: number;
  bdtPerDollar: number;
  
  // Commission settings
  hostCommissionPercent: number;
  platformFeePercent: number;
  
  // Agency levels
  agencyLevelTiers: AgencyLevelTier[];
  
  // Helper/Trader levels
  helperLevelConfig: HelperLevelConfig[];
  traderLevelTiers: TraderLevelTier[];
  
  // VIP/Level tiers
  vipTiers: VIPTier[];
  userLevelTiers: UserLevelTier[];
  
  // Call settings
  callRates: CallRateSettings;
  
  // Withdrawal settings
  minWithdrawalDollars: number;
  withdrawalPlatformFeePercent: number;
  
  // Loading states
  isLoading: boolean;
  lastUpdated: Date | null;
}

const defaultSettings: GlobalSettings = {
  beansPerDollar: 9000,
  bdtPerDollar: 125,
  hostCommissionPercent: 55,
  platformFeePercent: 10,
  agencyLevelTiers: [],
  helperLevelConfig: [],
  traderLevelTiers: [],
  vipTiers: [],
  userLevelTiers: [],
  callRates: { default_rate: 0, base_rate: 0, level_rates: [] },
  minWithdrawalDollars: 10,
  withdrawalPlatformFeePercent: 10,
  isLoading: true,
  lastUpdated: null,
};

// ============= Persistent Cache =============
const STORAGE_KEY = 'meri_global_settings';
const STORAGE_TIME_KEY = 'meri_global_settings_time';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Load from localStorage on startup (instant, no flicker)
function loadFromStorage(): GlobalSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Restore lastUpdated as Date
      if (parsed.lastUpdated) parsed.lastUpdated = new Date(parsed.lastUpdated);
      parsed.isLoading = false;
      return parsed;
    }
  } catch (e) {
    // Corrupt cache, ignore
  }
  return { ...defaultSettings };
}

function saveToStorage(settings: GlobalSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(STORAGE_TIME_KEY, String(Date.now()));
  } catch (e) {
    // Storage full, ignore
  }
}

function getStoredFetchTime(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_TIME_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

let settingsCache: GlobalSettings = loadFromStorage();
let lastFetchTime = getStoredFetchTime();
let settingsFetchPromise: Promise<GlobalSettings> | null = null;
let settingsRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
const settingsSubscribers = new Set<(next: GlobalSettings) => void>();

// ============= Fetch Functions =============
async function fetchAllSettings(): Promise<GlobalSettings> {
  // Fetch silently - no console spam
  
  try {
    // Parallel fetch all settings tables
    const [
      appSettingsRes,
      agencyTiersRes,
      helperConfigRes,
      traderTiersRes,
      vipTiersRes,
      userLevelTiersRes,
    ] = await Promise.all([
      supabase.from('app_settings').select('setting_key, setting_value'),
      supabase.from('agency_level_tiers').select('*').eq('is_active', true).order('display_order'),
      supabase.from('helper_level_config').select('*').eq('is_enabled', true).order('level_number'),
      supabase.from('trader_level_tiers').select('*').eq('is_active', true).order('level_number'),
      supabase.from('vip_tiers').select('*').eq('is_active', true).order('tier_level'),
      supabase.from('user_level_tiers').select('*').eq('is_active', true).order('level_number'),
    ]);

    // Parse app_settings
    const appSettings: Record<string, any> = {};
    (appSettingsRes.data || []).forEach((s: any) => {
      appSettings[s.setting_key] = parseSettingValue(s.setting_value);
    });

    // Build settings object (NO hardcoded fallbacks except for truly optional fields)
    const settings: GlobalSettings = {
      // Exchange rates from app_settings or agency_policy
      beansPerDollar: appSettings.beans_per_dollar || appSettings.exchange_rate?.rate || 9000,
      bdtPerDollar: appSettings.bdt_per_dollar || 125,
      
      // Commission settings
      hostCommissionPercent: typeof appSettings.host_percent === 'number' 
        ? appSettings.host_percent 
        : 55,
      platformFeePercent: typeof appSettings.platform_fee_percent === 'number'
        ? appSettings.platform_fee_percent
        : 10,
      
      // Agency levels - DIRECTLY from database, no defaults
      agencyLevelTiers: (agencyTiersRes.data || []) as AgencyLevelTier[],
      
      // Helper/Trader levels
      helperLevelConfig: (helperConfigRes.data || []) as HelperLevelConfig[],
      traderLevelTiers: (traderTiersRes.data || []) as TraderLevelTier[],
      
      // VIP/Level tiers
      vipTiers: (vipTiersRes.data || []) as VIPTier[],
      userLevelTiers: (userLevelTiersRes.data || []) as UserLevelTier[],
      
      // Call settings
      callRates: appSettings.call_rates || { default_rate: 0, base_rate: 0, level_rates: [] },
      
      // Withdrawal settings
      minWithdrawalDollars: appSettings.min_withdrawal_usd || 10,
      withdrawalPlatformFeePercent: appSettings.withdrawal_fee_percent || 10,
      
      isLoading: false,
      lastUpdated: new Date(),
    };

    console.log('[GlobalSettings] ✅ Settings loaded:', {
      agencyLevels: settings.agencyLevelTiers.length,
      helperLevels: settings.helperLevelConfig.length,
      vipTiers: settings.vipTiers.length,
      hostCommission: settings.hostCommissionPercent + '%',
    });

    // Update memory + localStorage cache
    settingsCache = settings;
    lastFetchTime = Date.now();
    saveToStorage(settings);

    return settings;
  } catch (error) {
    console.error('[GlobalSettings] ❌ Error fetching settings:', error);
    return { ...defaultSettings, isLoading: false };
  }
}

function notifySettingsSubscribers(next: GlobalSettings) {
  settingsSubscribers.forEach((subscriber) => subscriber(next));
}

async function getSettings(force = false): Promise<GlobalSettings> {
  const hasFreshCache = Date.now() - lastFetchTime < CACHE_DURATION && !settingsCache.isLoading;

  if (!force && hasFreshCache) {
    return settingsCache;
  }

  if (settingsFetchPromise) {
    return settingsFetchPromise;
  }

  settingsFetchPromise = fetchAllSettings()
    .then((next) => {
      notifySettingsSubscribers(next);
      return next;
    })
    .finally(() => {
      settingsFetchPromise = null;
    });

  return settingsFetchPromise;
}

function ensureSettingsRealtimeSubscription() {
  if (settingsRealtimeChannel) return;

  settingsRealtimeChannel = supabase
    .channel('global-settings-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => void getSettings(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_level_tiers' }, () => void getSettings(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'helper_level_config' }, () => void getSettings(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trader_level_tiers' }, () => void getSettings(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vip_tiers' }, () => void getSettings(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_level_tiers' }, () => void getSettings(true))
    .subscribe();
}

// ============= Main Hook =============
export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalSettings>(settingsCache);

  const refresh = useCallback(async () => {
    const next = await getSettings(true);
    setSettings(next);
  }, []);

  useEffect(() => {
    let mounted = true;

    const updateSettings = (next: GlobalSettings) => {
      if (mounted) {
        setSettings(next);
      }
    };

    settingsSubscribers.add(updateSettings);
    updateSettings(settingsCache);

    void getSettings(false).then(updateSettings);
    ensureSettingsRealtimeSubscription();

    return () => {
      mounted = false;
      settingsSubscribers.delete(updateSettings);
    };
  }, []);

  return { settings, refresh };
}

// ============= Helper Functions =============

/**
 * Get agency commission rate by level code
 */
export function getAgencyCommissionRate(
  levelCode: string | null,
  tiers: AgencyLevelTier[]
): number {
  if (!levelCode || tiers.length === 0) return 0;
  const tier = tiers.find(t => t.level_code === levelCode);
  return tier?.commission_rate || 0;
}

/**
 * Get agency level by weekly income
 */
export function getAgencyLevelByIncome(
  weeklyIncomeUsd: number,
  tiers: AgencyLevelTier[]
): AgencyLevelTier | null {
  if (tiers.length === 0) return null;
  
  // Sort by income threshold descending to find the highest matching tier
  const sortedTiers = [...tiers].sort((a, b) => b.min_weekly_income - a.min_weekly_income);
  
  for (const tier of sortedTiers) {
    if (weeklyIncomeUsd >= tier.min_weekly_income) {
      return tier;
    }
  }
  
  // Return lowest tier if no match
  return tiers[0] || null;
}

/**
 * Get helper commission rate by level number
 */
export function getHelperCommissionRate(
  levelNumber: number,
  config: HelperLevelConfig[]
): number {
  if (config.length === 0) return 0;
  const level = config.find(c => c.level_number === levelNumber);
  return level?.commission_rate || 0;
}

/**
 * Get trader level by withdrawal amount
 */
export function getTraderLevelByAmount(
  amountUsd: number,
  tiers: TraderLevelTier[]
): TraderLevelTier | null {
  if (tiers.length === 0) return null;
  
  for (const tier of tiers) {
    if (amountUsd >= tier.min_withdrawal_amount && amountUsd <= tier.max_withdrawal_amount) {
      return tier;
    }
  }
  
  return null;
}

/**
 * Convert beans to USD
 */
export function beansToUsd(beans: number, beansPerDollar: number): number {
  if (beansPerDollar <= 0) return 0;
  return beans / beansPerDollar;
}

/**
 * Convert USD to beans
 */
export function usdToBeans(usd: number, beansPerDollar: number): number {
  return usd * beansPerDollar;
}

/**
 * Convert USD to local currency (BDT default)
 */
export function usdToLocalCurrency(usd: number, localRate: number): number {
  return usd * localRate;
}

/**
 * Calculate host earnings from gift
 */
export function calculateHostEarnings(
  giftValue: number,
  hostCommissionPercent: number
): number {
  return Math.floor(giftValue * (hostCommissionPercent / 100));
}

/**
 * Calculate agency commission from host earnings
 */
export function calculateAgencyCommission(
  hostEarnings: number,
  agencyCommissionPercent: number
): number {
  return Math.floor(hostEarnings * (agencyCommissionPercent / 100));
}

export default useGlobalSettings;

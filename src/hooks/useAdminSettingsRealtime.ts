import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { adminSupabase } from '@/integrations/supabase/adminClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { parseSettingValue } from '@/utils/adminSettingsStorage';

/**
 * Centralized hook for real-time admin settings updates
 * This hook subscribes to all admin-configurable tables and provides
 * instant updates (< 1 second) when admin makes changes
 */

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  link_type: string | null;
  background_color: string | null;
  text_color: string | null;
  accent_color: string | null;
  is_active: boolean;
  display_order: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface Gift {
  id: string;
  name: string;
  coin_value: number;
  icon_url: string | null;
  animation_url: string | null;
  animation_type: string | null;
  category: string | null;
  is_active: boolean;
  display_order: number | null;
}

export interface DiamondPackage {
  id: string;
  coins: number; // DB column name - represents diamonds
  base_coins: number;
  price_usd: number;
  bonus_percentage: number | null;
  is_popular: boolean;
  is_best_value: boolean;
  is_active: boolean;
  display_order: number | null;
}

export interface CurrencyRate {
  id: string;
  country_code: string;
  currency_code: string;
  currency_symbol: string;
  rate_to_usd: number;
  is_active: boolean;
}

export interface BrandingSettings {
  id: string;
  logo_text_primary: string | null;
  logo_text_secondary: string | null;
  tagline: string | null;
  logo_image_url: string | null;
  background_type: 'image' | 'video' | 'gif' | 'gradient' | null;
  background_url: string | null;
}

export interface GameSetting {
  id: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  is_active: boolean;
  is_featured: boolean;
  win_probability: number | null;
  house_edge: number | null;
  min_bet: number | null;
  max_bet: number | null;
}

export interface AppSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  category: string | null;
  description: string | null;
}

export interface TopupPaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  instructions: string | null;
  qr_code_url: string | null;
  min_amount: number;
  max_amount: number;
  is_active: boolean;
  display_order: number;
}

// Global state for caching
let globalBanners: Banner[] = [];
let globalGifts: Gift[] = [];
let globalDiamondPackages: DiamondPackage[] = [];
let globalCurrencyRates: CurrencyRate[] = [];
let globalBranding: BrandingSettings | null = null;
let globalGameSettings: GameSetting[] = [];
let globalAppSettings: Map<string, any> = new Map();
let globalPaymentMethods: TopupPaymentMethod[] = [];

// Subscribers
const subscribers: Set<() => void> = new Set();

const notifySubscribers = () => {
  subscribers.forEach(callback => callback());
};

// Initialize channel once
let realtimeChannel: ReturnType<typeof supabase.channel> | ReturnType<typeof adminSupabase.channel> | null = null;
let realtimeMode: 'admin' | 'public' | null = null;

const isAdminRoute = () => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
const getSettingsClient = () => (isAdminRoute() ? adminSupabase : supabase);

const logSettingsLoadError = (scope: string, error: unknown) => {
  console.warn(`[AdminRealtime] ${scope} load skipped, keeping cached data:`, error);
};

const guardedRefresh = async (scope: string, refresh: () => Promise<void>) => {
  try {
    await refresh();
  } catch (error) {
    logSettingsLoadError(scope, error);
  }
};

const subscribeTableChange = (
  channel: ReturnType<typeof supabase.channel> | ReturnType<typeof adminSupabase.channel>,
  table: string,
  refresh?: () => Promise<void> | void
) => {
  return channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table },
    async (payload) => {
      console.log(`[AdminRealtime] ${table} updated:`, payload.eventType);
      if (refresh) {
        await refresh();
      }
      notifySubscribers();
    }
  );
};

const initializeRealtimeSubscription = () => {
  const adminMode = isAdminRoute();
  const nextMode = adminMode ? 'admin' : 'public';

  if (realtimeChannel && realtimeMode === nextMode) return;

  if (realtimeChannel) {
    try { (window as any).__adminSettingsEventCleanup?.(); } catch {}
    try {
      if (typeof (realtimeChannel as any).unsubscribe === 'function') {
        (realtimeChannel as any).unsubscribe();
      }
    } catch {}
    realtimeChannel = null;
    realtimeMode = null;
  }

  console.log(`[AdminRealtime] Initializing ${adminMode ? 'admin (event-only)' : 'public'} settings subscription...`);

  // ⚡ Admin: PUSH-only sync via global admin-table-update events.
  // No timers, no polling — re-fetch only when Postgres pushes a real change.
  if (adminMode) {
    const handleAdminEvent = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const table = detail?.table;
      const refreshMap: Record<string, (() => Promise<void> | void)> = {
        banners: refreshBanners,
        gifts: refreshGifts,
        coin_packages: refreshDiamondPackages,
        currency_rates: refreshCurrencyRates,
        branding_settings: refreshBranding,
        game_settings: refreshGameSettings,
        app_settings: refreshAppSettings,
        topup_payment_methods: refreshPaymentMethods,
      };
      if (table && refreshMap[table]) {
        await refreshMap[table]();
        notifySubscribers();
      }
    };
    window.addEventListener('admin-table-update', handleAdminEvent);
    (window as any).__adminSettingsEventCleanup = () => {
      window.removeEventListener('admin-table-update', handleAdminEvent);
    };
    realtimeChannel = {} as any;
    realtimeMode = 'admin';
    console.log('[AdminRealtime] Admin mode: push-only event sync (no timers)');
    return;
  }

  // ⚡ COST-OPTIMISED: Only subscribe to tables in supabase_realtime publication.
  // banners, gifts, coin_packages, currency_rates, branding_settings,
  // game_settings, topup_payment_methods are NOT in publication — subscribing
  // to them creates dead WebSocket bindings that generate realtime messages
  // costing $2.50/million. Poll these instead.
  const PUBLICATION_TABLES_SET = new Set([
    'app_settings', // Only this settings table is in supabase_realtime publication
  ]);

  // Initial fetch for ALL settings (both realtime and polled)
  const fetchAllSettings = async () => {
    await Promise.all([
      refreshBanners(), refreshGifts(), refreshDiamondPackages(),
      refreshCurrencyRates(), refreshBranding(), refreshGameSettings(),
      refreshAppSettings(), refreshPaymentMethods(),
    ]);
    notifySubscribers();
  };
  void fetchAllSettings();

  // ⚡ ZERO POLLING: settings refresh only when admin panel dispatches a change
  // event (admin-table-update). All admin mutations now trigger this event,
  // so a 60s timer is no longer needed and was removed to save battery + DB cost.
  const handleAdminMutationEvent = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    const table = detail?.table;
    const refreshMap: Record<string, (() => Promise<void> | void)> = {
      banners: refreshBanners,
      gifts: refreshGifts,
      coin_packages: refreshDiamondPackages,
      currency_rates: refreshCurrencyRates,
      branding_settings: refreshBranding,
      game_settings: refreshGameSettings,
      app_settings: refreshAppSettings,
      topup_payment_methods: refreshPaymentMethods,
    };
    if (table && refreshMap[table]) {
      await refreshMap[table]();
      notifySubscribers();
    }
  };
  window.addEventListener('admin-table-update', handleAdminMutationEvent);
  (window as any).__adminSettingsEventCleanup = () => {
    window.removeEventListener('admin-table-update', handleAdminMutationEvent);
  };

  // Only subscribe to app_settings (the only publication table)
  const createPublicChannel = () => {
    if (realtimeChannel && typeof (realtimeChannel as any).unsubscribe === 'function') {
        try { getSettingsClient().removeChannel(realtimeChannel as RealtimeChannel); } catch {}
    }

    const client = getSettingsClient();
    let channel = client.channel(`public-settings-rt-${crypto.randomUUID()}`);
    channel = subscribeTableChange(channel, 'app_settings', refreshAppSettings);

    realtimeChannel = channel.subscribe((status) => {
      realtimeMode = 'public';
      console.log('[AdminRealtime] Public settings subscription:', status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[AdminRealtime] ⚠️ Realtime unavailable; cached REST data remains active.');
        try { getSettingsClient().removeChannel(channel as RealtimeChannel); } catch {}
        if (realtimeChannel === channel) {
          realtimeChannel = null;
          realtimeMode = null;
        }
      }
    });
  };

  createPublicChannel();
};

// Refresh functions
const refreshBanners = async () => {
  const { data } = await getSettingsClient()
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  globalBanners = (data || []).map((b: any) => ({
    ...b,
    // Map legacy click_action to link_type if link_type is missing
    link_type: b.link_type || b.click_action || 'external',
    subtitle: b.subtitle || null,
    background_color: b.background_color || '#1a1a2e',
    text_color: b.text_color || '#ffffff',
    accent_color: b.accent_color || '#ff6b6b',
  })) as Banner[];
};

const refreshGifts = async () => {
  const { data } = await getSettingsClient()
    .from('gifts')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  globalGifts = (data || []) as Gift[];
};

const refreshDiamondPackages = async () => {
  const { data } = await getSettingsClient()
    .from('coin_packages')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  globalDiamondPackages = (data || []).map((pkg: any) => {
    const normalizedCoins = Number(pkg.coins ?? pkg.coins_amount ?? 0);
    const normalizedBaseCoins = Number(pkg.base_coins ?? pkg.coins ?? pkg.coins_amount ?? 0);
    const normalizedBonusPercentage = Number(
      pkg.bonus_percentage ?? (
        pkg.bonus_coins && normalizedBaseCoins > 0
          ? Math.round((Number(pkg.bonus_coins) / normalizedBaseCoins) * 100)
          : 0
      )
    );

    return {
      ...pkg,
      coins: normalizedCoins,
      base_coins: normalizedBaseCoins,
      bonus_percentage: normalizedBonusPercentage,
      price_usd: Number(pkg.price_usd ?? 0),
      is_popular: Boolean(pkg.is_popular),
      is_best_value: Boolean(pkg.is_best_value),
      is_active: Boolean(pkg.is_active),
      display_order: pkg.display_order ?? null,
    } as DiamondPackage;
  });
};

const refreshCurrencyRates = async () => {
  const { data } = await getSettingsClient()
    .from('currency_rates')
    .select('*')
    .eq('is_active', true)
    .order('country_code', { ascending: true });
  globalCurrencyRates = (data || []) as CurrencyRate[];
};

const refreshBranding = async () => {
  const { data } = await getSettingsClient()
    .from('branding_settings')
    .select('*')
    .eq('setting_key', 'default')
    .maybeSingle();

  // branding_settings stores data as JSON in setting_value.
  // Preserve explicit empty strings/nulls so admin "remove" actions do not fall back to old defaults.
  if (data) {
    const normalize = (parsed: any): BrandingSettings => ({
      id: data.id,
      logo_text_primary: parsed.logo_text_primary ?? parsed.app_name?.split(' ')[0] ?? null,
      logo_text_secondary: parsed.logo_text_secondary ?? null,
      tagline: parsed.tagline ?? null,
      logo_image_url: parsed.logo_image_url ?? parsed.logo_url ?? null,
      background_type: parsed.background_type ?? null,
      background_url: parsed.background_url ?? null,
    });

    if (data.setting_value && typeof data.setting_value === 'string') {
      try {
        globalBranding = normalize(JSON.parse(data.setting_value));
      } catch {
        globalBranding = data as BrandingSettings | null;
      }
    } else if (data.setting_value && typeof data.setting_value === 'object') {
      globalBranding = normalize(data.setting_value as any);
    } else {
      globalBranding = data as BrandingSettings | null;
    }
  } else {
    globalBranding = null;
  }
};

const refreshGameSettings = async () => {
  const { data } = await getSettingsClient()
    .from('game_settings')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  globalGameSettings = (data || []) as GameSetting[];
};

const refreshAppSettings = async () => {
  const { data } = await getSettingsClient()
    .from('app_settings')
    .select('setting_key, setting_value');
  globalAppSettings.clear();
  (data || []).forEach((setting: any) => {
    globalAppSettings.set(setting.setting_key, parseSettingValue(setting.setting_value));
  });
};

const refreshPaymentMethods = async () => {
  const { data } = await getSettingsClient()
    .from('topup_payment_methods' as any)
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  globalPaymentMethods = (data || []) as unknown as TopupPaymentMethod[];
};

// Initial data load
const initializeData = async () => {
  console.log('[AdminRealtime] Loading initial data...');
  await Promise.all([
    guardedRefresh('banners', refreshBanners),
    guardedRefresh('gifts', refreshGifts),
    guardedRefresh('coin packages', refreshDiamondPackages),
    guardedRefresh('currency rates', refreshCurrencyRates),
    guardedRefresh('branding', refreshBranding),
    guardedRefresh('game settings', refreshGameSettings),
    guardedRefresh('app settings', refreshAppSettings),
    guardedRefresh('payment methods', refreshPaymentMethods)
  ]);
  console.log('[AdminRealtime] Initial data loaded');
  notifySubscribers();
};

// Hook for banners
export const useBannersRealtime = () => {
  const [banners, setBanners] = useState<Banner[]>(globalBanners);
  const [loading, setLoading] = useState(globalBanners.length === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalBanners.length === 0) {
      guardedRefresh('banners', refreshBanners).then(() => {
        setBanners(globalBanners);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateBanners = () => setBanners([...globalBanners]);
    subscribers.add(updateBanners);

    return () => {
      subscribers.delete(updateBanners);
    };
  }, []);

  return { banners, loading };
};

// Hook for gifts
export const useGiftsRealtime = () => {
  const [gifts, setGifts] = useState<Gift[]>(globalGifts);
  const [loading, setLoading] = useState(globalGifts.length === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalGifts.length === 0) {
      guardedRefresh('gifts', refreshGifts).then(() => {
        setGifts(globalGifts);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateGifts = () => setGifts([...globalGifts]);
    subscribers.add(updateGifts);

    return () => {
      subscribers.delete(updateGifts);
    };
  }, []);

  return { gifts, loading };
};

// Hook for diamond packages
export const useDiamondPackagesRealtime = () => {
  const [packages, setPackages] = useState<DiamondPackage[]>(globalDiamondPackages);
  const [loading, setLoading] = useState(globalDiamondPackages.length === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalDiamondPackages.length === 0) {
      guardedRefresh('coin packages', refreshDiamondPackages).then(() => {
        setPackages(globalDiamondPackages);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updatePackages = () => setPackages([...globalDiamondPackages]);
    subscribers.add(updatePackages);

    return () => {
      subscribers.delete(updatePackages);
    };
  }, []);

  return { packages, loading };
};

// Hook for currency rates
export const useCurrencyRatesRealtime = () => {
  const [rates, setRates] = useState<CurrencyRate[]>(globalCurrencyRates);
  const [loading, setLoading] = useState(globalCurrencyRates.length === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalCurrencyRates.length === 0) {
      guardedRefresh('currency rates', refreshCurrencyRates).then(() => {
        setRates(globalCurrencyRates);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateRates = () => setRates([...globalCurrencyRates]);
    subscribers.add(updateRates);

    return () => {
      subscribers.delete(updateRates);
    };
  }, []);

  // Eurozone countries that use EUR - fallback to EU rate
  const eurozoneCountries = [
    'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 
    'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'HR'
  ];

  const getRateForCountry = useCallback((countryCode: string) => {
    // First try exact match
    const exactMatch = rates.find(r => r.country_code === countryCode);
    if (exactMatch) return exactMatch;
    
    // For Eurozone countries, fallback to EU rate
    if (eurozoneCountries.includes(countryCode)) {
      return rates.find(r => r.country_code === 'EU');
    }
    
    return undefined;
  }, [rates]);

  const convertUsdToLocal = useCallback((usdAmount: number, countryCode: string) => {
    // First try exact match
    let rate = rates.find(r => r.country_code === countryCode);
    
    // For Eurozone countries, fallback to EU rate
    if (!rate && eurozoneCountries.includes(countryCode)) {
      rate = rates.find(r => r.country_code === 'EU');
    }
    
    if (rate) {
      return {
        amount: usdAmount * rate.rate_to_usd,
        symbol: rate.currency_symbol,
        code: rate.currency_code
      };
    }
    return { amount: usdAmount, symbol: '$', code: 'USD' };
  }, [rates]);

  return { rates, loading, getRateForCountry, convertUsdToLocal };
};

// Hook for branding settings
export const useBrandingRealtime = () => {
  const [branding, setBranding] = useState<BrandingSettings | null>(globalBranding);
  const [loading, setLoading] = useState(!globalBranding);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (!globalBranding) {
      guardedRefresh('branding', refreshBranding).then(() => {
        setBranding(globalBranding);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateBranding = () => setBranding(globalBranding ? { ...globalBranding } : null);
    subscribers.add(updateBranding);

    return () => {
      subscribers.delete(updateBranding);
    };
  }, []);

  return { branding, loading };
};

// Hook for game settings
export const useGameSettingsRealtime = () => {
  const [games, setGames] = useState<GameSetting[]>(globalGameSettings);
  const [loading, setLoading] = useState(globalGameSettings.length === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalGameSettings.length === 0) {
      guardedRefresh('game settings', refreshGameSettings).then(() => {
        setGames(globalGameSettings);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateGames = () => setGames([...globalGameSettings]);
    subscribers.add(updateGames);

    return () => {
      subscribers.delete(updateGames);
    };
  }, []);

  return { games, loading };
};

// Hook for app settings
export const useAppSettingsRealtime = () => {
  const [settings, setSettings] = useState<Map<string, any>>(new Map(globalAppSettings));
  const [loading, setLoading] = useState(globalAppSettings.size === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalAppSettings.size === 0) {
      refreshAppSettings().then(() => {
        setSettings(new Map(globalAppSettings));
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateSettings = () => setSettings(new Map(globalAppSettings));
    subscribers.add(updateSettings);

    return () => {
      subscribers.delete(updateSettings);
    };
  }, []);

  const getSetting = useCallback((key: string, defaultValue?: any) => {
    return settings.has(key) ? settings.get(key) : defaultValue;
  }, [settings]);

  return { settings, loading, getSetting };
};

// Hook for payment methods
export const usePaymentMethodsRealtime = () => {
  const [methods, setMethods] = useState<TopupPaymentMethod[]>(globalPaymentMethods);
  const [loading, setLoading] = useState(globalPaymentMethods.length === 0);

  useEffect(() => {
    initializeRealtimeSubscription();
    
    if (globalPaymentMethods.length === 0) {
      refreshPaymentMethods().then(() => {
        setMethods(globalPaymentMethods);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const updateMethods = () => setMethods([...globalPaymentMethods]);
    subscribers.add(updateMethods);

    return () => {
      subscribers.delete(updateMethods);
    };
  }, []);

  return { methods, loading };
};

// Note: no import-time initialization to prevent public-route query storms.
// Data and subscriptions initialize lazily inside each hook instance.
export default {
  useBannersRealtime,
  useGiftsRealtime,
  useDiamondPackagesRealtime,
  useCurrencyRatesRealtime,
  useBrandingRealtime,
  useGameSettingsRealtime,
  useAppSettingsRealtime,
  usePaymentMethodsRealtime
};

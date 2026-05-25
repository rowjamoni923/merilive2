import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseCallRateSettings, resolveEffectiveCallRate } from '@/utils/callRateSettings';
import { getAppSetting, invalidateAppSetting } from '@/utils/appSettingsCache';

interface UseHostCallRateResult {
  callRate: number | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Centralized hook to fetch host's call rate
 *
 * SOURCE OF TRUTH:
 * 1. Admin Panel call_rates.level_rates for host level
 * 2. Admin Panel call_rates.default_rate / per_minute_rate fallback
 * 3. Returns null if admin has not configured a valid rate
 */
export function useHostCallRate(hostId: string | null | undefined): UseHostCallRateResult {
  const [callRate, setCallRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCallRate = useCallback(async () => {
    if (!hostId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: hostProfile }, { data: settings }] = await Promise.all([
        supabase
          .from('profiles_public')
          .select('host_level, call_rate_per_minute')
          .eq('id', hostId)
          .maybeSingle(),
        supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'call_rates')
          .maybeSingle(),
      ]);

      if (!hostProfile) {
        setCallRate(null);
        setLoading(false);
        return;
      }

      const callSettings = parseCallRateSettings(settings?.setting_value);
      const resolvedRate = resolveEffectiveCallRate({
        settings: callSettings,
        hostLevel: hostProfile.host_level,
        customRate: hostProfile.call_rate_per_minute,
      });

      setCallRate(typeof resolvedRate === 'number' && resolvedRate > 0 ? resolvedRate : null);
    } catch (error) {
      console.error('[useHostCallRate] Error fetching call rate:', error);
      setCallRate(null);
    } finally {
      setLoading(false);
    }
  }, [hostId]);

  useEffect(() => {
    fetchCallRate();
  }, [fetchCallRate]);

  useEffect(() => {
    if (!hostId) return;

    // Pkg83: NO cross-user profiles postgres_changes (RLS would silently filter
    // anyway) and NO direct app_settings subscription. Admin call_rates changes
    // arrive via Pkg37 admin_broadcast 'admin-table-update' window event;
    // host-level/custom-rate changes are rare and picked up on next mount/refetch.
    const onAdminUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { table?: string } | undefined;
      if (!detail?.table) return;
      if (detail.table === 'app_settings') void fetchCallRate();
    };
    window.addEventListener('admin-table-update', onAdminUpdate);
    return () => window.removeEventListener('admin-table-update', onAdminUpdate);
  }, [hostId, fetchCallRate]);


  return {
    callRate,
    loading,
    refetch: fetchCallRate,
  };
}

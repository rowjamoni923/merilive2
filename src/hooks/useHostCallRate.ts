import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
          .select('host_level')
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

      const settingValue = settings?.setting_value as any;
      const hostLevel = Math.max(hostProfile.host_level ?? 0, 1);
      const levelRates = Array.isArray(settingValue?.level_rates) ? settingValue.level_rates : [];
      const levelRate = levelRates.find((lr: { level: number; rate: number }) => lr.level === hostLevel);
      const resolvedRate = levelRate?.rate ?? settingValue?.default_rate ?? settingValue?.per_minute_rate ?? null;

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

    const channel = supabase
      .channel(`host-call-rate-${hostId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${hostId}`,
        },
        () => {
          void fetchCallRate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
          filter: 'setting_key=eq.call_rates',
        },
        () => {
          void fetchCallRate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hostId, fetchCallRate]);

  return {
    callRate,
    loading,
    refetch: fetchCallRate,
  };
}

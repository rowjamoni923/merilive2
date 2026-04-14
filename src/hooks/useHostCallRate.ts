import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseCallRateSettings, resolveEffectiveCallRate } from '@/utils/callRateSettings';

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

    const channelName = `host-call-rate-${hostId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
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
          event: '*',
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

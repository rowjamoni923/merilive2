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
 * PRIORITY ORDER (NO DEFAULTS - All rates must be explicitly set):
 * 1. Host's custom call_rate_per_minute from their profile (HOST SETS THEIR OWN PRICE)
 * 2. Level-based rate from admin settings (if host hasn't set custom rate)
 * 3. Returns null if no rate is configured (NEVER returns a hardcoded default)
 * 
 * This hook is used across all call-related components to ensure consistency:
 * - Index.tsx (user cards)
 * - ProfileDetail.tsx
 * - CallButton.tsx
 * - CallConfirmModal.tsx
 * - Chat.tsx
 * - GoLive.tsx
 * - LiveStream.tsx
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
      // STEP 1: Get host's profile with their custom rate AND level (use public view for cross-user access)
      const { data: hostProfile } = await supabase
        .from('profiles_public')
        .select('host_level, call_rate_per_minute')
        .eq('id', hostId)
        .maybeSingle();

      if (!hostProfile) {
        console.log('[useHostCallRate] No host profile found');
        setCallRate(null);
        setLoading(false);
        return;
      }

      // PRIORITY 1: Host's own custom call rate (if they set it)
      if (hostProfile.call_rate_per_minute && hostProfile.call_rate_per_minute > 0) {
        console.log('[useHostCallRate] Using HOST CUSTOM rate:', hostProfile.call_rate_per_minute, 'diamonds/min');
        setCallRate(hostProfile.call_rate_per_minute);
        setLoading(false);
        return;
      }

      // PRIORITY 2: Level-based rate from Admin Panel (if host hasn't set custom rate)
      const { data: settings } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'call_rates')
        .maybeSingle();

      const settingValue = settings?.setting_value as any;
      
      if (settingValue?.level_rates && Array.isArray(settingValue.level_rates)) {
        const hostLevel = hostProfile.host_level ?? 0;
        const levelRate = settingValue.level_rates.find(
          (lr: { level: number; rate: number }) => lr.level === hostLevel
        );
        
        if (levelRate && levelRate.rate > 0) {
          console.log('[useHostCallRate] Using LEVEL-BASED rate for Level', hostLevel, ':', levelRate.rate, 'diamonds/min');
          setCallRate(levelRate.rate);
          setLoading(false);
          return;
        }
      }

      // NO RATE CONFIGURED - Return null (not a default value)
      // The UI should show "Rate not set" or similar
      console.log('[useHostCallRate] No rate configured for this host');
      setCallRate(null);
    } catch (error) {
      console.error('[useHostCallRate] Error fetching call rate:', error);
      setCallRate(null); // No fallback to default
    } finally {
      setLoading(false);
    }
  }, [hostId]);

  // Initial fetch
  useEffect(() => {
    fetchCallRate();
  }, [fetchCallRate]);

  // Real-time subscription for rate updates
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
        (payload) => {
          const newRate = (payload.new as any).call_rate_per_minute;
          if (newRate && newRate > 0) {
            console.log('[useHostCallRate] Real-time update - Host changed rate to:', newRate);
            setCallRate(newRate);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hostId]);

  return {
    callRate,
    loading,
    refetch: fetchCallRate,
  };
}

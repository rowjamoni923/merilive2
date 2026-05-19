import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HelperData {
  id: string;
  user_id: string;
  trader_level: number;
  wallet_balance: number;
  total_level_upgrade_cost: number;
  is_active: boolean;
  is_verified: boolean;
  payroll_enabled: boolean;
  created_at: string;
}

/**
 * Hook for real-time helper trader level updates
 * Automatically subscribes to topup_helpers changes and updates level instantly
 */
export const useRealtimeHelperLevel = (helperId: string | null) => {
  const [traderLevel, setTraderLevel] = useState<number>(1);
  const [helperData, setHelperData] = useState<HelperData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial helper data
  const fetchHelperData = useCallback(async () => {
    if (!helperId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("topup_helpers")
      .select("*")
      .eq("id", helperId)
      .maybeSingle();

    if (data) {
      setTraderLevel(data.trader_level || 1);
      setHelperData({
        id: data.id,
        user_id: data.user_id,
        trader_level: data.trader_level || 1,
        wallet_balance: data.wallet_balance || 0,
        total_level_upgrade_cost: data.total_level_upgrade_cost || 0,
        is_active: data.is_active || false,
        is_verified: data.is_verified || false,
        payroll_enabled: data.payroll_enabled || false,
        created_at: data.created_at,
      });
    }
    setLoading(false);
  }, [helperId]);

  // Initial load only; realtime subscription below handles live updates without polling.
  useEffect(() => {
    fetchHelperData();
  }, [fetchHelperData]);

  // Real-time subscription for level changes
  useEffect(() => {
    if (!helperId) return;

    const channel = supabase
      .channel(`helper-level-updates-${helperId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "topup_helpers",
          filter: `id=eq.${helperId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData) {
            console.log('[useRealtimeHelperLevel] Level updated:', newData.trader_level);
            setTraderLevel(newData.trader_level || 1);
            setHelperData({
              id: newData.id,
              user_id: newData.user_id,
              trader_level: newData.trader_level || 1,
              wallet_balance: newData.wallet_balance || 0,
              total_level_upgrade_cost: newData.total_level_upgrade_cost || 0,
              is_active: newData.is_active || false,
              is_verified: newData.is_verified || false,
              payroll_enabled: newData.payroll_enabled || false,
              created_at: newData.created_at,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [helperId]);

  return {
    traderLevel,
    helperData,
    loading,
    refetch: fetchHelperData,
  };
};

/**
 * Hook for real-time helper level progress calculation
 * Returns level, progress percentage, and cost info
 */
export const useRealtimeHelperLevelProgress = (helperId: string | null) => {
  const { traderLevel, helperData, loading, refetch } = useRealtimeHelperLevel(helperId);
  const [tiers, setTiers] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);
  const [nextLevelCost, setNextLevelCost] = useState(0);

  // Fetch level tiers
  const fetchTiers = useCallback(async () => {
    const { data } = await supabase
      .from("trader_level_tiers")
      .select("*")
      .eq("is_active", true)
      .order("level_number", { ascending: true });

    if (data) {
      setTiers(data);
    }
  }, []);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  // Real-time subscription for trader level tier changes
  useEffect(() => {
    const channel = supabase
      .channel('trader-level-tiers-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trader_level_tiers',
        },
        (payload) => {
          console.log('[useRealtimeHelperLevel] Trader level tiers updated:', payload.eventType);
          fetchTiers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTiers]);

  // Calculate progress whenever helper data or tiers change
  useEffect(() => {
    if (!helperData || tiers.length === 0) return;

    const totalCost = helperData.total_level_upgrade_cost || 0;
    setCurrentCost(totalCost);

    const currentTier = tiers.find((t) => t.level_number === traderLevel);
    const nextTier = tiers.find((t) => t.level_number === traderLevel + 1);

    if (currentTier && nextTier) {
      const currentMin = currentTier.upgrade_cost_usd || 0;
      const nextMin = nextTier.upgrade_cost_usd || 0;
      const range = nextMin - currentMin;
      const progressInRange = totalCost - currentMin;
      const progressPercent = range > 0 ? Math.min((progressInRange / range) * 100, 100) : 0;
      
      setProgress(progressPercent);
      setNextLevelCost(nextMin);
    } else if (currentTier) {
      // Max level reached
      setProgress(100);
      setNextLevelCost(currentTier.upgrade_cost_usd || 0);
    }
  }, [helperData, tiers, traderLevel]);

  return {
    traderLevel,
    progress,
    currentCost,
    nextLevelCost,
    loading,
    refetch,
    tiers,
    helperData,
  };
};

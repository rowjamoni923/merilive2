import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";

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

  useAppSyncEvent(['topup_helpers'], (detail) => {
    const payload = detail.payload || {};
    if (payload.helper_id && payload.helper_id !== helperId) return;
    fetchHelperData();
  }, Boolean(helperId));

  // Pkg83-ext: removed static helper-level-updates channel (topup_helpers not
  // in supabase_realtime publication — was silent no-op). Replaced with
  // visibility refetch + admin-table-update for admin-driven changes.
  useEffect(() => {
    if (!helperId) return;
    const onAdmin = (e: Event) => {
      const table = (e as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'topup_helpers') fetchHelperData();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchHelperData();
    };
    window.addEventListener('admin-table-update', onAdmin as EventListener);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('admin-table-update', onAdmin as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [helperId, fetchHelperData]);


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

  // Pkg83-ext: removed static trader-level-tiers-realtime channel.
  // Pkg37 admin_broadcast pushes trader_level_tiers edits.
  useEffect(() => {
    const onAdmin = (e: Event) => {
      const table = (e as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'trader_level_tiers') fetchTiers();
    };
    window.addEventListener('admin-table-update', onAdmin as EventListener);
    return () => window.removeEventListener('admin-table-update', onAdmin as EventListener);
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

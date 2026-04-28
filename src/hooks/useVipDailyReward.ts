import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DailyRewardStatus {
  can_claim: boolean;
  vip_amount: number;
  noble_amount: number;
  total_amount: number;
  next_claim_at: string | null;
  last_claim_at: string | null;
}

const PROBE_KEY = "vip_daily_reward_probe_v1";

/**
 * Wraps the `claim_vip_daily_reward()` Postgres RPC.
 * Status is read from `vip_daily_rewards_log` (last claim) + active VIP/Noble amounts.
 */
export const useVipDailyReward = (userId?: string | null) => {
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      // Pull active VIP & Noble daily amounts in parallel
      const [vipRes, nobleRes, logRes] = await Promise.all([
        supabase
          .from("user_vip_subscriptions")
          .select("vip_tiers:vip_tier_id ( daily_free_diamonds )")
          .eq("user_id", userId)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("user_noble_subscriptions")
          .select("noble_cards:noble_card_id ( daily_free_diamonds )")
          .eq("user_id", userId)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("vip_daily_rewards_log")
          .select("claimed_at")
          .eq("user_id", userId)
          .order("claimed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const vipAmount = Number((vipRes.data?.vip_tiers as any)?.daily_free_diamonds) || 0;
      const nobleAmount = Number((nobleRes.data?.noble_cards as any)?.daily_free_diamonds) || 0;
      const total = vipAmount + nobleAmount;
      const lastClaim = logRes.data?.claimed_at || null;

      let canClaim = total > 0;
      let nextClaim: string | null = null;
      if (lastClaim) {
        const next = new Date(new Date(lastClaim).getTime() + 24 * 60 * 60 * 1000);
        nextClaim = next.toISOString();
        if (next.getTime() > Date.now()) canClaim = false;
      }

      setStatus({
        can_claim: canClaim,
        vip_amount: vipAmount,
        noble_amount: nobleAmount,
        total_amount: total,
        next_claim_at: nextClaim,
        last_claim_at: lastClaim,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const claim = useCallback(async () => {
    if (!userId || claiming) return null;
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("claim_vip_daily_reward");
      if (error) {
        toast.error(error.message || "Failed to claim daily reward");
        return null;
      }
      const result: any = data;
      if (result?.success) {
        toast.success(`+${result.total_amount || 0} 💎 daily reward claimed!`);
        try {
          localStorage.setItem(PROBE_KEY, String(Date.now()));
        } catch {}
        await fetchStatus();
        return result;
      } else {
        toast.error(result?.error || "Cannot claim right now");
        return null;
      }
    } finally {
      setClaiming(false);
    }
  }, [userId, claiming, fetchStatus]);

  return { status, loading, claiming, claim, refetch: fetchStatus };
};

export default useVipDailyReward;

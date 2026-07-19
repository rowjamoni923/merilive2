import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Weekly login reward — one claim per ISO week (Asia/Dhaka).
 * DB-side unique index on (user_id, week_label) prevents duplicate credit
 * even under concurrent requests. Config comes from
 * `weekly_login_rewards_config` (admin-managed).
 */
interface WeeklyConfig {
  reward_type: "diamonds" | "diamonds" | "beans";
  reward_amount: number;
  label: string | null;
}

function currentDhakaWeekLabel(): string {
  // Match SQL: to_char(date_in_dhaka, 'IYYY"-W"IW')
  const nowMs = Date.now() + 6 * 60 * 60 * 1000; // shift to Dhaka
  const d = new Date(nowMs);
  d.setUTCHours(0, 0, 0, 0);
  // ISO week calculation
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export const useWeeklyLoginReward = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<WeeklyConfig | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [claiming, setClaiming] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const week = currentDhakaWeekLabel();
      const [cfgRes, claimRes] = await Promise.all([
        supabase
          .from("weekly_login_rewards_config")
          .select("reward_type, reward_amount, label")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("weekly_login_claims")
          .select("id")
          .eq("user_id", user.id)
          .eq("week_label", week)
          .maybeSingle(),
      ]);

      setConfig((cfgRes.data as WeeklyConfig) ?? null);
      setAlreadyClaimed(!!claimRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claim = useCallback(async () => {
    if (claiming || alreadyClaimed) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("claim_weekly_login_reward");
      if (error) throw error;
      const res = data as { success?: boolean; error?: string; reward_amount?: number; reward_type?: string };
      if (res?.success) {
        setAlreadyClaimed(true);
        toast({
          title: "Weekly Reward Claimed",
          description: `+${res.reward_amount} ${res.reward_type}`,
        });
      } else if (res?.error === "already_claimed") {
        setAlreadyClaimed(true);
        toast({ title: "Already claimed this week", variant: "default" });
      } else if (res?.error === "not_configured") {
        toast({ title: "Weekly reward not configured", variant: "destructive" });
      } else {
        toast({ title: "Claim failed", description: res?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Claim failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  }, [claiming, alreadyClaimed, toast]);

  return { config, alreadyClaimed, loading, claiming, claim, reload: load };
};

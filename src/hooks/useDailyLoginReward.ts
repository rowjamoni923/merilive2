import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getTaskDate, getDayBoundaries } from "@/utils/taskDateUtils";

interface LoginRewardDay {
  day_number: number;
  reward_coins: number;
  reward_diamonds: number;
  bonus_label: string | null;
  is_claimed: boolean;
}

interface LoginStreak {
  current_streak: number;
  last_login_date: string | null;
  total_logins: number;
}

export const useDailyLoginReward = () => {
  const { toast } = useToast();
  const [rewardDays, setRewardDays] = useState<LoginRewardDay[]>([]);
  const [streak, setStreak] = useState<LoginStreak>({ current_streak: 0, last_login_date: null, total_logins: 0 });
  const [canClaimToday, setCanClaimToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [todayReward, setTodayReward] = useState<LoginRewardDay | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = getTaskDate();

      // Fetch config, streak, and recent claims in parallel
      const [configRes, streakRes, recentClaimRes] = await Promise.all([
        supabase.from('daily_login_rewards_config').select('*').eq('is_active', true).order('day_number'),
        supabase.from('user_login_streaks').select('*').eq('user_id', user.id).maybeSingle(),
        // Get latest claim to check if already claimed in current app-day
        supabase.from('daily_login_claims').select('*').eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      const config = configRes.data || [];
      const userStreak = streakRes.data;
      
      // Check if the latest claim falls within the current app-day boundaries
      const latestClaim = recentClaimRes.data?.[0];
      let todayClaim = null;
      if (latestClaim) {
        // Primary check: claimed_date matches today's app-day
        if (latestClaim.claimed_date === today) {
          todayClaim = latestClaim;
        } else {
          // Fallback: check if claim's created_at falls within current app-day window
          const { start, end } = getDayBoundaries();
          const claimTime = new Date(latestClaim.created_at).getTime();
          const dayStart = new Date(start).getTime();
          const dayEnd = new Date(end).getTime();
          if (claimTime >= dayStart && claimTime < dayEnd) {
            todayClaim = latestClaim;
          }
        }
      }

      // Calculate streak
      let currentStreak = userStreak?.current_streak || 0;
      const lastLogin = userStreak?.last_login_date;

      if (lastLogin) {
        const lastDate = new Date(lastLogin);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 1) {
          // Streak broken
          currentStreak = 0;
        }
      }

      setStreak({
        current_streak: currentStreak,
        last_login_date: lastLogin,
        total_logins: userStreak?.total_logins || 0,
      });

      // Get claimed days for current cycle
      const cycleStart = currentStreak > 0 ? currentStreak : 0;
      const { data: recentClaims } = await supabase
        .from('daily_login_claims')
        .select('day_number, claimed_date')
        .eq('user_id', user.id)
        .order('claimed_date', { ascending: false })
        .limit(7);

      const claimedDays = new Set((recentClaims || []).map(c => c.day_number));

      const days: LoginRewardDay[] = config.map((c: any) => ({
        day_number: c.day_number,
        reward_coins: c.reward_coins,
        reward_diamonds: c.reward_diamonds,
        bonus_label: c.bonus_label,
        is_claimed: claimedDays.has(c.day_number) && c.day_number <= currentStreak,
      }));

      setRewardDays(days);

      const alreadyClaimedToday = !!todayClaim;
      setCanClaimToday(!alreadyClaimedToday);

      // Determine today's reward
      const nextDay = (currentStreak % 7) + 1;
      const todayRewardConfig = days.find(d => d.day_number === nextDay);
      setTodayReward(todayRewardConfig || null);

      // Show popup only once per day using localStorage
      const dismissedDate = localStorage.getItem('daily_login_popup_dismissed');
      if (!alreadyClaimedToday && dismissedDate !== today) {
        setShowPopup(true);
      }
    } catch (err) {
      console.error('[DailyLogin] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const claimReward = useCallback(async () => {
    if (claiming || !canClaimToday || !todayReward) return;
    setClaiming(true);

    try {
      // Use secure server-side RPC aligned with the app's 12:30 AM reset window
      const { start, end } = getDayBoundaries();
      const { data, error } = await (supabase as any).rpc('claim_daily_login_reward', {
        _claimed_date: getTaskDate(),
        _day_start: start,
        _day_end: end,
      });

      if (error) {
        console.error('[DailyLogin] Claim RPC error:', error.message, error);
        // Only mark as claimed if it's genuinely a duplicate claim error
        if (error.message?.includes('Already claimed')) {
          setCanClaimToday(false);
          localStorage.setItem('daily_login_popup_dismissed', getTaskDate());
          toast({ title: "Already claimed today!", variant: "destructive" });
        } else {
          toast({ title: "Claim failed", description: error.message, variant: "destructive" });
        }
        setClaiming(false);
        return;
      }

      const result = data as any;
      if (!result?.success) {
        toast({ title: result?.error || "Claim failed", variant: "destructive" });
        setClaiming(false);
        return;
      }

      setCanClaimToday(false);
      // Mark as dismissed for today after claiming
      localStorage.setItem('daily_login_popup_dismissed', getTaskDate());
      toast({
        title: `🎁 Day ${result.day} Reward Claimed!`,
        description: `+${result.coins} Diamonds${result.diamonds > 0 ? ` + ${result.diamonds} Bonus` : ''}`,
      });

      await fetchData();
    } catch (err) {
      console.error('[DailyLogin] Claim error:', err);
    } finally {
      setClaiming(false);
    }
  }, [claiming, canClaimToday, todayReward, toast, fetchData]);

  // When popup is dismissed (closed without claiming), save to localStorage
  const handleSetShowPopup = useCallback((show: boolean) => {
    setShowPopup(show);
    if (!show) {
      localStorage.setItem('daily_login_popup_dismissed', getTaskDate());
    }
  }, []);

  return {
    rewardDays,
    streak,
    canClaimToday,
    loading,
    claiming,
    showPopup,
    setShowPopup: handleSetShowPopup,
    todayReward,
    claimReward,
  };
};

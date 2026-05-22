import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Coins, Diamond, Sparkles, Clock, TrendingUp, Star, Check, ChevronRight, Zap, Crown, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useDailyLoginReward } from "@/hooks/useDailyLoginReward";
import { useToast } from "@/hooks/use-toast";

interface ConsumptionTier {
  id: string;
  tier_name: string;
  min_spend: number;
  max_spend: number | null;
  return_percentage: number;
  max_return_coins: number | null;
  period_type: string;
}

interface LimitedOffer {
  id: string;
  title: string;
  description: string;
  bonus_percentage: number;
  ends_at: string;
  badge_text: string;
  total_claimed: number;
  total_max_claims: number | null;
}

const Rewards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const loginReward = useDailyLoginReward();
  const [activeTab, setActiveTab] = useState<'daily' | 'cashback' | 'offers'>('daily');
  const [consumptionTiers, setConsumptionTiers] = useState<ConsumptionTier[]>([]);
  const [limitedOffers, setLimitedOffers] = useState<LimitedOffer[]>([]);
  const [hasFirstRecharge, setHasFirstRecharge] = useState(true);
  const [firstRechargeMultiplier, setFirstRechargeMultiplier] = useState(2);
  const [userWeeklySpend, setUserWeeklySpend] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const { getCachedUser } = await import('@/utils/cachedAuth');
    const user = await getCachedUser();
    if (!user) return;

    const [tiersRes, offersRes, firstRechargeRes, bonusRes, spendRes] = await Promise.all([
      supabase.from('consumption_return_config').select('*').eq('is_active', true).order('display_order'),
      supabase.from('limited_time_offers').select('*').eq('is_active', true).gte('ends_at', new Date().toISOString()),
      supabase.from('first_recharge_claims').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('first_recharge_bonus').select('bonus_multiplier').eq('is_active', true).maybeSingle(),
      // Get weekly spend from gift_transactions
      supabase.from('gift_transactions').select('diamond_cost').eq('sender_id', user.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    setConsumptionTiers((tiersRes.data || []) as ConsumptionTier[]);
    setLimitedOffers((offersRes.data || []) as LimitedOffer[]);
    setHasFirstRecharge(!!firstRechargeRes.data);
    if (bonusRes.data) {
      setFirstRechargeMultiplier(Number(bonusRes.data.bonus_multiplier) || 2);
    }
    
    const totalSpend = (spendRes.data || []).reduce((sum: number, t: any) => sum + (t.diamond_cost || 0), 0);
    setUserWeeklySpend(totalSpend);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    // Use universal realtime for instant admin config updates
    let unsubscribe: (() => void) | undefined;
    import('@/hooks/useUniversalRealtime').then(({ subscribeToTables }) => {
      unsubscribe = subscribeToTables(
        `rewards-page-${Date.now()}`,
        ['consumption_return_config', 'limited_time_offers', 'first_recharge_bonus'],
        () => { fetchAll(); }
      );
    });
    return () => { unsubscribe?.(); };
  }, [fetchAll]);

  // Find user's current tier
  const currentTier = consumptionTiers.find(t => 
    userWeeklySpend >= t.min_spend && (t.max_spend === null || userWeeklySpend <= t.max_spend)
  );

  const currentDay = (loginReward.streak.current_streak % 7) + 1;

  const getTimeRemaining = (endDate: string) => {
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h`;
  };

  const tabs = [
    { key: 'daily' as const, label: 'Daily Login', icon: Gift },
    { key: 'cashback' as const, label: 'Cashback', icon: TrendingUp },
    { key: 'offers' as const, label: 'Offers', icon: Zap },
  ];

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-border/50 safe-area-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">Rewards Center</h1>
        </div>
      </header>

      {/* First Recharge Banner */}
      {!hasFirstRecharge && (
        <div 
          onClick={() => navigate('/recharge')}
          className="mx-4 mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-pink-500/20 border border-amber-500/30 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold text-amber-400">{firstRechargeMultiplier}x FIRST RECHARGE BONUS</span>
              </div>
              <p className="text-xs text-slate-600">Get {firstRechargeMultiplier}x coins on your first recharge!</p>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-400" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 px-4 mt-4 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-gradient-to-r from-primary to-secondary text-slate-800 shadow-lg"
                : "bg-white/5 text-slate-500 hover:bg-white/10"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4 pb-24 space-y-4">
        {/* ===== DAILY LOGIN ===== */}
        {activeTab === 'daily' && (
          <>
            {/* Streak Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/20">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-purple-300 font-medium">Login Streak</p>
                  <p className="text-2xl font-bold text-slate-800">{loginReward.streak.current_streak} Days</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Star className="w-6 h-6 text-slate-800" />
                </div>
              </div>
              <p className="text-xs text-slate-500">Login every day to keep your streak and earn bigger rewards!</p>
            </div>

            {/* 7-Day Rewards Grid */}
            <div className="grid grid-cols-7 gap-2">
              {loginReward.rewardDays.map((day) => {
                const isToday = day.day_number === currentDay;
                const isPast = day.day_number < currentDay;
                const isClaimed = day.is_claimed || isPast;

                return (
                  <div
                    key={day.day_number}
                    className={cn(
                      "flex flex-col items-center py-3 px-1 rounded-xl border transition-all",
                      isToday
                        ? "border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/10"
                        : isClaimed
                        ? "border-green-500/20 bg-green-500/10"
                        : "border-amber-200/60 bg-white/5"
                    )}
                  >
                    <span className="text-[10px] text-slate-500 font-medium mb-1">Day {day.day_number}</span>
                    <div className="my-1.5">
                      {isClaimed && !isToday ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <Coins className={cn("w-5 h-5", isToday ? "text-amber-400" : "text-slate-400")} />
                      )}
                    </div>
                    <span className={cn(
                      "text-xs font-bold",
                      isToday ? "text-amber-400" : isClaimed ? "text-green-400" : "text-slate-500"
                    )}>
                      {day.reward_coins}
                    </span>
                    {day.reward_diamonds > 0 && (
                      <span className="text-[9px] text-cyan-400 mt-0.5">+{day.reward_diamonds}💎</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Claim Button */}
            {loginReward.canClaimToday && loginReward.todayReward && (
              <Button
                onClick={loginReward.claimReward}
                disabled={loginReward.claiming}
                className="w-full h-12 text-base font-bold rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
              >
                {loginReward.claiming ? "Claiming..." : `🎁 Claim Day ${currentDay} (+${loginReward.todayReward.reward_coins} Diamonds)`}
              </Button>
            )}

            {!loginReward.canClaimToday && (
              <div className="text-center py-4">
                <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-green-400 font-medium">Today's reward claimed!</p>
                <p className="text-xs text-slate-400 mt-1">Come back tomorrow for Day {currentDay < 7 ? currentDay + 1 : 1}</p>
              </div>
            )}
          </>
        )}

        {/* ===== CASHBACK ===== */}
        {activeTab === 'cashback' && (
          <>
            {/* User Status */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-emerald-300 font-medium">This Week's Spending</p>
                  <p className="text-2xl font-bold text-slate-800">{userWeeklySpend.toLocaleString()} <span className="text-sm text-slate-500">diamonds</span></p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500">
                  <span className="text-xs font-bold text-slate-800">{currentTier?.tier_name || 'No Tier'}</span>
                </div>
              </div>
              {currentTier && (
                <p className="text-xs text-emerald-300/70">
                  Earning {currentTier.return_percentage}% cashback on spending
                </p>
              )}
            </div>

            {/* Tiers */}
            <div className="space-y-3">
              {consumptionTiers.map((tier) => {
                const isActive = currentTier?.id === tier.id;
                const isReached = userWeeklySpend >= tier.min_spend;

                return (
                  <div
                    key={tier.id}
                    className={cn(
                      "p-4 rounded-xl border transition-all",
                      isActive
                        ? "border-emerald-400/50 bg-emerald-500/10"
                        : isReached
                        ? "border-amber-200/60 bg-white/5"
                        : "border-amber-200/60 bg-white/[0.02] opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          tier.tier_name === 'Diamond' ? "bg-gradient-to-br from-cyan-400 to-blue-500" :
                          tier.tier_name === 'Gold' ? "bg-gradient-to-br from-amber-400 to-orange-500" :
                          tier.tier_name === 'Silver' ? "bg-gradient-to-br from-slate-300 to-slate-400" :
                          "bg-gradient-to-br from-amber-700 to-amber-800"
                        )}>
                          <Crown className="w-5 h-5 text-slate-800" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{tier.tier_name}</p>
                          <p className="text-xs text-slate-500">
                            {tier.min_spend.toLocaleString()}{tier.max_spend ? ` - ${tier.max_spend.toLocaleString()}` : '+'} diamonds/week
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-400">{tier.return_percentage}%</p>
                        <p className="text-[10px] text-slate-400">cashback</p>
                      </div>
                    </div>
                    {isActive && (
                      <div className="mt-2 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs text-emerald-400 font-medium">Current Tier</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-slate-500 mt-4">
              Cashback is calculated weekly and credited every Monday
            </p>
          </>
        )}

        {/* ===== LIMITED OFFERS ===== */}
        {activeTab === 'offers' && (
          <>
            {limitedOffers.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 text-slate-800/20 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No active offers right now</p>
                <p className="text-xs text-slate-800/25 mt-1">Check back soon for exciting deals!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {limitedOffers.map((offer) => (
                  <div
                    key={offer.id}
                    onClick={() => navigate('/recharge')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-pink-600/20 via-purple-600/20 to-blue-600/20 border border-pink-500/30 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-gradient-to-r from-pink-500 to-purple-500 text-white text-[10px] border-0">
                            {offer.badge_text}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-white/80">
                            <Timer className="w-3 h-3" />
                            {getTimeRemaining(offer.ends_at)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-800">{offer.title}</h3>
                        <p className="text-xs text-white/80 mt-1">{offer.description}</p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-2xl font-black text-amber-400">+{offer.bonus_percentage}%</p>
                        <p className="text-[10px] text-slate-400">bonus</p>
                      </div>
                    </div>
                    <Button className="w-full mt-2 h-10 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0 text-sm font-bold">
                      Recharge Now <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNavigation activeTab="" onTabChange={(path) => navigate(path)} />
    </div>
  );
};

export default Rewards;

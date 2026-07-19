import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle, Clock, Crown, Users, Gamepad2, Sparkles, Gift, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";
import { useMobileOptimization } from "@/hooks/useMobileOptimization";
import { useLeaderboardRealtime } from "@/hooks/useLeaderboardRealtime";
import { pickDisplayLevel } from "@/utils/displayLevel";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";

interface PodiumFrame {
  rank_position: number;
  frame_url: string;
  frame_type: string;
}

type RankingCategory = "host_earning" | "game_ranking" | "top_gifter" | "pk_competition";
type PeriodType = "daily" | "weekly" | "monthly";

interface RankingData {
  id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  country_flag: string | null;
  host_level: number | null;
  user_level: number | null;
  max_user_level?: number | null;
  gender?: string | null;
  is_host?: boolean | null;
  stat_value: number;
  frame_id?: string | null;
}

interface RewardTier {
  rank_from: number;
  rank_to: number;
  reward_diamonds: number;
  reward_beans: number;
}

interface PKCompetition {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  competition_type: string;
}

const formatNumber = (num: number): string => {
  if (num == null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const Leaderboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile, safeAreaInsets, viewportHeight } = useMobileOptimization();
  const [activeCategory, setActiveCategory] = useState<RankingCategory>("host_earning");
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [showRules, setShowRules] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  useLeaderboardRealtime(activeCategory, periodType);

  const { data: customIcons } = useQuery({
    queryKey: ["leaderboard-icons"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .like("setting_key", "leaderboard_%_icon");
      const icons: Record<string, string> = {};
      if (data) {
        data.forEach((s: any) => {
          const val = typeof s.setting_value === 'string' ? s.setting_value.replace(/^"|"$/g, '') : '';
          if (val) icons[s.setting_key] = val;
        });
      }
      return icons;
    },
    staleTime: 5 * 60 * 1000,
  });

  const getCategoryDbKey = () => {
    switch (activeCategory) {
      case "host_earning": return "host_earnings";
      case "game_ranking": return "game_winners";
      case "top_gifter": return "top_gifters";
      default: return "host_earnings";
    }
  };

  const { data: rewardTiers = [] } = useQuery({
    queryKey: ["leaderboard-rewards", getCategoryDbKey(), periodType],
    queryFn: async () => {
      const { data } = await supabase
        .from("leaderboard_reward_config")
        .select("rank_from, rank_to, reward_diamonds, reward_diamonds, reward_beans")
        .eq("category", getCategoryDbKey())
        .eq("period_type", periodType)
        .eq("is_active", true)
        .order("rank_from");
      return (data || []) as RewardTier[];
    },
    enabled: activeCategory !== "pk_competition",
  });

  const { data: podiumFrames = [] } = useQuery({
    queryKey: ["podium-frames", getCategoryDbKey()],
    queryFn: async () => {
      const { data } = await supabase
        .from("leaderboard_podium_frames")
        .select("rank_position, frame_url, frame_type")
        .eq("category", getCategoryDbKey())
        .eq("is_active", true)
        .order("rank_position");
      return (data || []) as PodiumFrame[];
    },
    enabled: activeCategory !== "pk_competition",
  });

  const getPodiumFrame = (rank: number): PodiumFrame | undefined => {
    return podiumFrames.find(f => f.rank_position === rank);
  };

  const getRewardForRank = (rank: number): RewardTier | undefined => {
    // Defensive: if any legacy overlapping tiers still exist, pick the
    // NARROWEST matching range (rank_to - rank_from smallest) so rank 1
    // never accidentally receives a bulk-tier reward.
    const matches = rewardTiers.filter(r => rank >= r.rank_from && rank <= r.rank_to);
    if (matches.length === 0) return undefined;
    return matches.sort((a, b) => (a.rank_to - a.rank_from) - (b.rank_to - b.rank_from))[0];
  };

  const getRewardLabel = (reward: RewardTier): string => {
    const parts: string[] = [];
    if (reward.reward_beans > 0) parts.push(`${formatNumber(reward.reward_beans)} Beans`);
    if (reward.reward_diamonds > 0) parts.push(`${formatNumber(reward.reward_diamonds)} 💎`);
    if (reward.reward_diamonds > 0) parts.push(`${formatNumber(reward.reward_diamonds)} 💰`);
    return parts.join(' + ');
  };

  const { data: hostRankings = [], isLoading: loadingHosts } = useQuery({
    queryKey: ["host-rankings-v2", periodType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_host_earnings_leaderboard', { p_period_type: periodType });
      if (error) { console.error('Host leaderboard error:', error); return []; }
      return (data || []) as RankingData[];
    },
    enabled: activeCategory === "host_earning",
    staleTime: 60_000, // 1 min cache - leaderboard data doesn't change every second
  });

  const { data: gameRankings = [], isLoading: loadingGames } = useQuery({
    queryKey: ["game-rankings-v2", periodType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_game_rankings_leaderboard', { p_period_type: periodType });
      if (error) { console.error('Game leaderboard error:', error); return []; }
      return (data || []) as RankingData[];
    },
    enabled: activeCategory === "game_ranking",
    staleTime: 60_000,
  });

  const { data: gifterRankings = [], isLoading: loadingGifters } = useQuery({
    queryKey: ["gifter-rankings-v2", periodType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_top_gifters_leaderboard', { p_period_type: periodType });
      if (error) { console.error('Gifter leaderboard error:', error); return []; }
      return (data || []) as RankingData[];
    },
    enabled: activeCategory === "top_gifter",
    staleTime: 60_000,
  });

  const { data: pkCompetitions = [], isLoading: loadingPK } = useQuery({
    queryKey: ["pk-competitions-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pk_competitions")
        .select("id, title, description, start_date, end_date, status, competition_type")
        .in("status", ["active", "upcoming"])
        .eq("is_active", true)
        .order("start_date", { ascending: false })
        .limit(10);
      return (data || []) as (PKCompetition & { competition_type: string })[];
    },
    enabled: activeCategory === "pk_competition",
  });

  const activePK = pkCompetitions.find(c => c.status === "active") || pkCompetitions[0];
  const { data: pkParticipants = [], isLoading: loadingPKParts } = useQuery({
    queryKey: ["pk-participants-dynamic", activePK?.id, activePK?.competition_type],
    queryFn: async () => {
      if (!activePK) return [];
      const startDate = activePK.start_date;
      const endDate = activePK.end_date;
      const compType = (activePK as any).competition_type || "gift_receiving";
      let stats: Record<string, number> = {};

      if (compType === "gift_sending" || compType === "diamonds_spent") {
        const { data: gifts } = await supabase.from("gift_transactions").select("sender_id, diamond_amount").gte("created_at", startDate).lte("created_at", endDate);
        (gifts || []).forEach(g => { if (g.sender_id) stats[g.sender_id] = (stats[g.sender_id] || 0) + (g.diamond_amount || 0); });
      } else if (compType === "gift_receiving" || compType === "beans_earned") {
        const { data: gifts } = await supabase.from("gift_transactions").select("receiver_id, diamond_amount").gte("created_at", startDate).lte("created_at", endDate);
        (gifts || []).forEach(g => { if (g.receiver_id) { stats[g.receiver_id] = (stats[g.receiver_id] || 0) + Math.floor((g.diamond_amount || 0) * 0.6); } });
      } else {
        const { data: parts } = await supabase.from("pk_participants").select("user_id, score").eq("competition_id", activePK.id).order("score", { ascending: false }).limit(50);
        (parts || []).forEach(p => { stats[p.user_id] = p.score || 0; });
      }

      const userIds = Object.keys(stats).filter(id => stats[id] > 0);
      if (!userIds.length) return [];
      const { data: profiles } = await supabase.from("profiles_public").select("id, display_name, app_uid, avatar_url, country_flag, host_level, user_level, max_user_level, gender, is_host, frame_id").in("id", userIds);
      const pMap: Record<string, any> = {};
      (profiles || []).forEach(p => { pMap[p.id] = p; });

      return Object.entries(stats).filter(([, val]) => val > 0).sort(([, a], [, b]) => b - a).slice(0, 50).map(([uid, val]) => ({
        id: uid, display_name: pMap[uid]?.display_name || null, app_uid: pMap[uid]?.app_uid || null,
        avatar_url: pMap[uid]?.avatar_url || null, country_flag: pMap[uid]?.country_flag || null,
        host_level: pMap[uid]?.host_level ?? null, user_level: pMap[uid]?.user_level ?? null,
        max_user_level: pMap[uid]?.max_user_level ?? null, gender: pMap[uid]?.gender ?? null, is_host: pMap[uid]?.is_host ?? null,
        frame_id: pMap[uid]?.frame_id || null, stat_value: val,
      })) as RankingData[];
    },
    enabled: activeCategory === "pk_competition" && !!activePK,
  });

  const { data: pkRewards = [] } = useQuery({
    queryKey: ["pk-rewards", activePK?.id],
    queryFn: async () => {
      if (!activePK) return [];
      const { data } = await supabase.from("pk_competition_rewards").select("rank_from, rank_to, reward_diamonds, reward_beans, reward_diamonds").eq("competition_id", activePK.id).eq("is_active", true).order("rank_from");
      return (data || []) as RewardTier[];
    },
    enabled: activeCategory === "pk_competition" && !!activePK,
  });

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      let endDate: Date;
      if (activeCategory === "pk_competition" && activePK) {
        endDate = new Date(activePK.status === "active" ? activePK.end_date : activePK.start_date);
      } else if (periodType === "daily") {
        // Reset at 12:30 AM local time
        endDate = new Date(now);
        if (now.getHours() > 0 || (now.getHours() === 0 && now.getMinutes() >= 30)) {
          endDate.setDate(endDate.getDate() + 1);
        }
        endDate.setHours(0, 30, 0, 0);
      } else if (periodType === "weekly") {
        endDate = new Date(now);
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        endDate.setDate(now.getDate() + daysUntilMonday);
        endDate.setHours(0, 30, 0, 0);
      } else {
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 30, 0, 0);
      }
      const diff = Math.max(0, endDate.getTime() - now.getTime());
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };
    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [periodType, activeCategory, activePK]);

  const isLoading = activeCategory === "host_earning" ? loadingHosts 
    : activeCategory === "game_ranking" ? loadingGames 
    : activeCategory === "top_gifter" ? loadingGifters 
    : loadingPK || loadingPKParts;
  
  const activeRewardTiers = activeCategory === "pk_competition" ? pkRewards : rewardTiers;
  
  // Filter out demo/admin IDs from all leaderboard views
  const EXCLUDED_IDS = [
    "6888e618-ae45-4bbb-bbd2-6834fc0f9ff9", // big boss
    "ab155d31-96d4-4a42-855d-b2c090ba0339", // Bd Admin
    "251cbe57-e46b-41c0-bfb5-4cfcad9d6499", // b
  ];
  
  const allRankings = activeCategory === "host_earning" ? hostRankings 
    : activeCategory === "game_ranking" ? gameRankings 
    : activeCategory === "top_gifter" ? gifterRankings 
    : pkParticipants;
  // Show Top 50 (1-50) — rewards distribute to ranks 1..50
  const rankings = allRankings.filter(r => !EXCLUDED_IDS.includes(r.id)).slice(0, 50);
  
  const top3 = rankings.slice(0, 3);
  const restRankings = rankings.slice(3);

  // Self-rank: industry standard sticky footer — shows your rank + gap to next.
  // Research (Bigo/Chamet): "Challenge the Top" CTA on self-rank drives last-minute gifting.
  const filteredAll = allRankings.filter(r => !EXCLUDED_IDS.includes(r.id));
  const myIndex = currentUserId ? filteredAll.findIndex(r => r.id === currentUserId) : -1;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myEntry = myIndex >= 0 ? filteredAll[myIndex] : null;
  const nextEntry = myIndex > 0 ? filteredAll[myIndex - 1] : null;
  const gapToNext = nextEntry && myEntry ? Math.max(0, (nextEntry.stat_value || 0) - (myEntry.stat_value || 0)) : 0;

  const getMetricLabel = () => {
    switch (activeCategory) {
      case "host_earning": return "B";
      case "game_ranking": return "🎮";
      case "top_gifter": return "💰";
      case "pk_competition": {
        const ct = (activePK as any)?.competition_type;
        if (ct === "gift_sending" || ct === "diamonds_spent") return "💰";
        if (ct === "gift_receiving" || ct === "beans_earned") return "B";
        return "⭐";
      }
    }
  };

  const getPeriodLabel = () => {
    switch (periodType) {
      case "daily": return "Today";
      case "weekly": return "This Week";
      case "monthly": return "This Month";
    }
  };

  const getLevel = (item: RankingData) => {
    return pickDisplayLevel(item as any);
  };

  const getDisplayId = (item: RankingData) => {
    return item.display_name || item.app_uid || "User";
  };

  // Podium rank colors
  const rankColors = {
    1: { bg: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)', glow: 'rgba(251,191,36,0.5)', text: 'text-amber-900' },
    2: { bg: 'linear-gradient(135deg, #94a3b8, #cbd5e1, #94a3b8)', glow: 'rgba(148,163,184,0.4)', text: 'text-slate-700' },
    3: { bg: 'linear-gradient(135deg, #d97706, #b45309, #92400e)', glow: 'rgba(217,119,6,0.4)', text: 'text-amber-900' },
  };

  return (
    <div 
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ 
        background: '#F7F8FA',
        height: isMobile ? `${viewportHeight}px` : '100vh',
      }}
    >
      {/* Header - White Premium */}
      <div 
        className="flex-shrink-0 z-20"
        style={{ 
          paddingTop: isMobile ? `${safeAreaInsets.top}px` : undefined,
          background: '#ffffff',
          borderBottom: '1px solid rgba(15,23,42,0.08)',
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)',
        }}
      >
        <div className="flex items-center justify-between h-12 px-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-1 rounded-full transition-all duration-200 active:scale-95 touch-manipulation bg-white hover:-translate-y-0.5"
            style={{ boxShadow: '0 3px 8px -2px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(15,23,42,0.04)' }}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <h1 className="text-base font-bold flex items-center gap-1.5 text-slate-900 tracking-tight">
            {customIcons?.leaderboard_header_icon ? (
              <img loading="lazy" decoding="async" src={customIcons.leaderboard_header_icon} alt="" className="w-5 h-5 object-contain drop-shadow" />
            ) : (
              <Crown className="w-4 h-4 text-amber-500 drop-shadow" />
            )}
            Leaderboard
          </h1>
          <button
            onClick={() => setShowRules(true)}
            className="p-2 -mr-1 rounded-full transition-all duration-200 active:scale-95 touch-manipulation bg-white hover:-translate-y-0.5"
            style={{ boxShadow: '0 3px 8px -2px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(15,23,42,0.04)' }}
          >
            <HelpCircle className="w-5 h-5 text-slate-500" />
          </button>
        </div>


        {/* Category Tabs - Golden Shield Style */}
        <div className="flex items-center gap-1 px-2 pb-2">
          {([
            { id: "host_earning" as const, label: "Charm", icon: Gift, activeGrad: "linear-gradient(135deg, #be185d, #ec4899, #be185d)", shadow: "rgba(236,72,153,0.4)" },
            { id: "game_ranking" as const, label: "Game", icon: Gamepad2, activeGrad: "linear-gradient(135deg, #8b0000, #cd5c5c, #8b0000)", shadow: "rgba(139,0,0,0.4)" },
            { id: "top_gifter" as const, label: "Wealth", icon: Sparkles, activeGrad: "linear-gradient(135deg, #b8860b, #daa520, #b8860b)", shadow: "rgba(218,165,32,0.4)" },
            { id: "pk_competition" as const, label: "PK", icon: Swords, activeGrad: "linear-gradient(135deg, #8b4513, #d2691e, #8b4513)", shadow: "rgba(210,105,30,0.4)" },
          ]).map(cat => {
            const isActive = activeCategory === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex-1 min-w-0 flex items-center justify-center gap-1 py-2 px-1 text-[11px] font-bold transition-all duration-200 touch-manipulation active:scale-95 whitespace-nowrap",
                  isActive ? "text-white" : "text-slate-600 hover:-translate-y-0.5"
                )}
                style={isActive ? {
                  background: cat.activeGrad,
                  boxShadow: `0 6px 16px -4px ${cat.shadow}, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.18)`,
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.45)',
                } : {
                  background: '#ffffff',
                  border: '1px solid rgba(15,23,42,0.08)',
                  borderRadius: '10px',
                  boxShadow: '0 2px 6px -2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
                }}
              >
                {customIcons?.[`leaderboard_${cat.id}_icon`] ? (
                  <img loading="lazy" decoding="async" src={customIcons[`leaderboard_${cat.id}_icon`]} alt="" className={cn("w-3 h-3 object-contain", isActive && "drop-shadow")} />
                ) : (
                  <Icon className={cn("w-3 h-3", isActive && "drop-shadow")} />
                )}
                {cat.label}
              </button>

            );
          })}
        </div>

        {/* Period Toggle - Golden 3D */}
        {activeCategory !== "pk_competition" && (
          <div className="flex justify-center gap-2 px-4 pb-2">
            {(["daily", "weekly", "monthly"] as PeriodType[]).map(p => {
              const isActive = periodType === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriodType(p)}
                  className={cn(
                    "px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 touch-manipulation active:scale-95",
                    isActive ? "text-amber-950" : "text-slate-600 hover:-translate-y-0.5"
                  )}
                  style={isActive ? {
                    background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 50%, #f59e0b 100%)',
                    boxShadow: '0 6px 16px -4px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(146,64,14,0.18)',
                    border: '1px solid rgba(245,158,11,0.5)',
                  } : {
                    background: '#ffffff',
                    border: '1px solid rgba(15,23,42,0.08)',
                    boxShadow: '0 2px 6px -2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
                  }}
                >
                  {p === "daily" ? "Day" : p === "weekly" ? "Week" : "Month"}
                </button>
              );
            })}
          </div>
        )}


        {/* PK Competition Info */}
        {activeCategory === "pk_competition" && activePK && (
          <div className="px-3 pb-2">
            <div 
              className="rounded-xl px-3 py-2 bg-amber-50"
              style={{ border: '1px solid rgba(251,191,36,0.30)' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-slate-900 text-xs font-semibold truncate flex-1">{activePK.title}</p>
                <span className="text-[9px] px-2 py-0.5 rounded-full text-amber-700 font-semibold" style={{ background: 'rgba(251,191,36,0.18)' }}>
                  {activePK.competition_type === "gift_sending" ? "🎁 Sending"
                    : activePK.competition_type === "gift_receiving" ? "💝 Receiving"
                    : activePK.competition_type === "diamonds_spent" ? "💰 Diamonds"
                    : activePK.competition_type === "beans_earned" ? "Beans"
                    : "⚡ Custom"}
                </span>
              </div>
              <p className="text-slate-500 text-[10px] mt-0.5">
                {activePK.status === "active" ? "🔴 Live" : "⏳ Upcoming"} • {new Date(activePK.start_date).toLocaleDateString()} - {new Date(activePK.end_date).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
        {activeCategory === "pk_competition" && !loadingPK && !activePK && (
          <div className="px-3 pb-2">
            <div className="rounded-xl px-3 py-4 text-center bg-slate-50" style={{ border: '1px solid rgba(15,23,42,0.08)' }}>
              <Swords className="w-6 h-6 mx-auto mb-1 text-slate-400" />
              <p className="text-slate-500 text-[10px]">No active PK competition</p>
            </div>
          </div>
        )}

        {/* Countdown Timer */}
        <div 
          className="flex justify-center items-center px-3 py-1.5"
          style={{ background: '#FFFBEB', borderTop: '1px solid rgba(251,191,36,0.15)' }}
        >
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-600" />
            <span className="text-slate-600 text-[10px] font-medium">
              {activeCategory === "pk_competition" && activePK
                ? (activePK.status === "active" ? "Ends" : "Starts")
                : getPeriodLabel() + " ends"}{" "}in
            </span>
            <span 
              className="text-[10px] font-mono px-2 py-0.5 rounded-md text-amber-700 font-bold"
              style={{ background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.35)' }}
            >
              {countdown.days > 0 && `${countdown.days}D `}
              {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? `${safeAreaInsets.bottom + 16}px` : '16px' }}>
        {isLoading ? (
          <div className="px-3 pb-6 space-y-1.5 mt-2" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-3 bg-white" style={{ border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
                <SkeletonPrim className="w-7 h-4 rounded" />
                <SkeletonPrim className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <SkeletonPrim className="h-4 w-1/3" />
                  <SkeletonPrim className="h-3 w-1/2" />
                </div>
                <SkeletonPrim className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <Users className="w-10 h-10 text-amber-500/60" />
            </div>
            <p className="text-slate-700 text-base font-medium">No rankings yet</p>
            <p className="text-slate-400 text-sm mt-1">Be the first to climb!</p>
          </div>
        ) : (
          <>
            {/* ===== TOP 3 PODIUM - Ultra Luxury Shield Banner Style ===== */}
            {top3.length >= 1 && (
              <div className="relative px-2 pt-6 pb-4 overflow-hidden">
                {/* Golden ambient background effects */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {/* Pillar-like golden light columns */}
                  <div className="absolute top-0 left-[8%] w-12 h-full opacity-[0.04]" style={{ background: 'linear-gradient(180deg, rgba(251,191,36,0.8), transparent 60%)' }} />
                  <div className="absolute top-0 right-[8%] w-12 h-full opacity-[0.04]" style={{ background: 'linear-gradient(180deg, rgba(251,191,36,0.8), transparent 60%)' }} />
                  {/* Central golden glow */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.8) 0%, transparent 70%)' }} />
                  {/* Sparkle dots */}
                  <motion.div animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute top-12 left-[20%] w-1.5 h-1.5 rounded-full bg-amber-400/40" />
                  <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2.5, delay: 0.5 }} className="absolute top-20 right-[25%] w-1 h-1 rounded-full bg-amber-300/50" />
                  <motion.div animate={{ opacity: [0.2, 0.7, 0.2] }} transition={{ repeat: Infinity, duration: 3, delay: 1 }} className="absolute top-8 right-[15%] w-1.5 h-1.5 rounded-full bg-yellow-300/30" />
                </div>

                <div className="relative flex justify-center items-start gap-0">
                  {/* 2nd Place - Left - Purple Shield */}
                  {top3[1] && (
                    <motion.div
                      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.6 }}
                      className="flex flex-col items-center w-[32%] mt-8"
                    >
                      {/* Shield Banner Card */}
                      <div className="relative w-full">
                        {/* Avatar area with ornate circle */}
                        <div className="relative mx-auto w-[60px] h-[60px] mb-1">
                          {/* Ornate ring */}
                          <div className="absolute inset-[-6px] rounded-full pointer-events-none" style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa, #7c3aed)', padding: '2px' }}>
                            <div className="w-full h-full rounded-full bg-transparent" />
                          </div>
                          {/* Rank badge */}
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', boxShadow: '0 2px 10px rgba(124,58,237,0.5)', border: '2px solid rgba(255,255,255,0.3)' }}>
                            <span className="text-[10px] font-black text-white">2</span>
                          </div>
                          {/* Wings SVG */}
                          <div className="absolute top-1/2 -translate-y-1/2 -left-5 w-7 h-10 pointer-events-none opacity-70">
                            <svg viewBox="0 0 30 50" fill="none"><path d="M28,25 Q20,10 5,5 Q15,15 18,25 Q15,35 5,45 Q20,40 28,25Z" fill="url(#wing-purple-l)"/><defs><linearGradient id="wing-purple-l" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs></svg>
                          </div>
                          <div className="absolute top-1/2 -translate-y-1/2 -right-5 w-7 h-10 pointer-events-none opacity-70">
                            <svg viewBox="0 0 30 50" fill="none"><path d="M2,25 Q10,10 25,5 Q15,15 12,25 Q15,35 25,45 Q10,40 2,25Z" fill="url(#wing-purple-r)"/><defs><linearGradient id="wing-purple-r" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient></defs></svg>
                          </div>
                          {getPodiumFrame(2) && (
                            <div className="absolute inset-[-10px] z-[3] pointer-events-none">
                              {getPodiumFrame(2)!.frame_type === 'svga' || getPodiumFrame(2)!.frame_type === 'lottie' ? (
                                <Suspense fallback={null}><UniversalFramePlayer src={getPodiumFrame(2)!.frame_url} type={getPodiumFrame(2)!.frame_type as any} className="w-full h-full" loop autoPlay /></Suspense>
                              ) : (
                                <img loading="lazy" decoding="async" src={getPodiumFrame(2)!.frame_url} alt="" className="w-full h-full object-contain" />
                              )}
                            </div>
                          )}
                          <div className="relative z-[1]">
                            <AvatarWithFrame userId={top3[1].id} src={top3[1].avatar_url || undefined} name={top3[1].display_name || "U"} level={getLevel(top3[1])} size="md" showFrame={true} showAnimation={true} avatarImageClassName="object-cover scale-[1.06]" />
                          </div>
                        </div>
                        {/* Shield banner body */}
                        <div className="relative rounded-t-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, #5b21b6 0%, #4c1d95 40%, #3b0764 100%)', border: '1px solid rgba(167,139,250,0.3)', borderBottom: 'none' }}>
                          {/* Gold trim line */}
                          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)' }} />
                          <div className="px-2 py-2 text-center">
                            <p className="text-amber-100 text-[10px] font-bold truncate">{getDisplayId(top3[1]).toString().slice(0, 8)}</p>
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <span className="text-[10px]">{top3[1].country_flag || "🌍"}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>Lv.{getLevel(top3[1])}</span>
                            </div>
                            <p className="mt-1 font-bold text-sm" style={{ color: '#fbbf24' }}>{getMetricLabel()} {formatNumber(top3[1].stat_value)}</p>
                          </div>
                        </div>
                        {/* Banner bottom point */}
                        <div className="flex justify-center">
                          <div style={{ width: '100%', height: '16px', background: 'linear-gradient(180deg, #3b0764, #2e0553)', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* 1st Place - Center - Red/Gold Shield (Largest) */}
                  {top3[0] && (
                    <motion.div
                      initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.1, duration: 0.6 }}
                      className="flex flex-col items-center w-[38%] z-10"
                    >
                      {/* Floating Crown */}
                      <motion.div
                        animate={{ y: [-3, 3, -3] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                        className="mb-1"
                      >
                        <div className="w-10 h-10 mx-auto flex items-center justify-center" style={{ filter: 'drop-shadow(0 4px 12px rgba(251,191,36,0.6))' }}>
                          <svg viewBox="0 0 40 36" fill="none" className="w-full h-full">
                            <path d="M20,4 L26,14 L36,8 L32,24 L8,24 L4,8 L14,14 Z" fill="url(#crown-fill)" stroke="#92400e" strokeWidth="1"/>
                            <circle cx="20" cy="8" r="3" fill="#ef4444"/>
                            <circle cx="10" cy="14" r="2" fill="#a78bfa"/>
                            <circle cx="30" cy="14" r="2" fill="#60a5fa"/>
                            <defs><linearGradient id="crown-fill" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fbbf24"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#d97706"/></linearGradient></defs>
                          </svg>
                        </div>
                      </motion.div>
                      
                      <div className="relative w-full">
                        {/* Avatar area with ornate gold circle */}
                        <div className="relative mx-auto w-[80px] h-[80px] mb-1">
                          <div className="absolute inset-[-8px] rounded-full pointer-events-none" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706, #f59e0b, #fbbf24)', padding: '3px', boxShadow: '0 0 30px rgba(251,191,36,0.4)' }}>
                            <div className="w-full h-full rounded-full bg-transparent" />
                          </div>
                          {/* Rank 1 badge */}
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', boxShadow: '0 3px 15px rgba(251,191,36,0.6)', border: '2px solid rgba(255,255,255,0.4)' }}>
                            <span className="text-xs font-black text-amber-900">1</span>
                          </div>
                          {/* Large Wings */}
                          <div className="absolute top-1/2 -translate-y-[55%] -left-7 w-10 h-14 pointer-events-none">
                            <svg viewBox="0 0 40 60" fill="none"><path d="M38,30 Q28,8 3,2 Q18,14 22,30 Q18,46 3,58 Q28,52 38,30Z" fill="url(#wing-gold-l)" opacity="0.85"/><path d="M35,30 Q27,14 8,8 Q18,18 21,30 Q18,42 8,52 Q27,46 35,30Z" fill="url(#wing-gold-l2)" opacity="0.5"/><defs><linearGradient id="wing-gold-l" x1="0%" y1="0%" x2="100%" y2="50%"><stop offset="0%" stopColor="#fef3c7"/><stop offset="50%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#d97706"/></linearGradient><linearGradient id="wing-gold-l2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fef3c7"/><stop offset="100%" stopColor="#f59e0b"/></linearGradient></defs></svg>
                          </div>
                          <div className="absolute top-1/2 -translate-y-[55%] -right-7 w-10 h-14 pointer-events-none">
                            <svg viewBox="0 0 40 60" fill="none"><path d="M2,30 Q12,8 37,2 Q22,14 18,30 Q22,46 37,58 Q12,52 2,30Z" fill="url(#wing-gold-r)" opacity="0.85"/><path d="M5,30 Q13,14 32,8 Q22,18 19,30 Q22,42 32,52 Q13,46 5,30Z" fill="url(#wing-gold-r2)" opacity="0.5"/><defs><linearGradient id="wing-gold-r" x1="100%" y1="0%" x2="0%" y2="50%"><stop offset="0%" stopColor="#fef3c7"/><stop offset="50%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#d97706"/></linearGradient><linearGradient id="wing-gold-r2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#fef3c7"/><stop offset="100%" stopColor="#f59e0b"/></linearGradient></defs></svg>
                          </div>
                          {getPodiumFrame(1) && (
                            <div className="absolute inset-[-14px] z-[3] pointer-events-none">
                              {getPodiumFrame(1)!.frame_type === 'svga' || getPodiumFrame(1)!.frame_type === 'lottie' ? (
                                <Suspense fallback={null}><UniversalFramePlayer src={getPodiumFrame(1)!.frame_url} type={getPodiumFrame(1)!.frame_type as any} className="w-full h-full" loop autoPlay /></Suspense>
                              ) : (
                                <img loading="lazy" decoding="async" src={getPodiumFrame(1)!.frame_url} alt="" className="w-full h-full object-contain" />
                              )}
                            </div>
                          )}
                          <div className="relative z-[1]">
                            <AvatarWithFrame userId={top3[0].id} src={top3[0].avatar_url || undefined} name={top3[0].display_name || "U"} level={getLevel(top3[0])} size="lg" showFrame={true} showAnimation={true} showGlow={true} avatarImageClassName="object-cover scale-[1.06]" />
                          </div>
                        </div>
                        {/* Shield banner body - Red/Gold */}
                        <div className="relative rounded-t-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, #991b1b 0%, #7f1d1d 30%, #450a0a 100%)', border: '1px solid rgba(251,191,36,0.3)', borderBottom: 'none' }}>
                          {/* Gold ornate trim */}
                          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #92400e, #fbbf24, #f59e0b, #fbbf24, #92400e)' }} />
                          <div className="px-3 py-2.5 text-center">
                            <p className="text-amber-100 text-xs font-bold truncate">{getDisplayId(top3[0]).toString().slice(0, 10)}</p>
                            <div className="flex items-center justify-center gap-1.5 mt-1">
                              <span className="text-xs">{top3[0].country_flag || "🌍"}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(217,119,6,0.2))', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }}>Lv.{getLevel(top3[0])}</span>
                            </div>
                            <p className="mt-1.5 font-black text-base" style={{ color: '#fbbf24', textShadow: '0 1px 4px rgba(251,191,36,0.3)' }}>{getMetricLabel()} {formatNumber(top3[0].stat_value)}</p>
                          </div>
                          {/* Shimmer effect */}
                          <motion.div
                            animate={{ x: [-150, 200] }}
                            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                            className="absolute inset-0 opacity-[0.06]"
                            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)', width: '40%' }}
                          />
                        </div>
                        {/* Banner bottom point */}
                        <div className="flex justify-center">
                          <div style={{ width: '100%', height: '20px', background: 'linear-gradient(180deg, #450a0a, #2a0505)', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* 3rd Place - Right - Blue Shield */}
                  {top3[2] && (
                    <motion.div
                      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.6 }}
                      className="flex flex-col items-center w-[32%] mt-8"
                    >
                      <div className="relative w-full">
                        <div className="relative mx-auto w-[60px] h-[60px] mb-1">
                          <div className="absolute inset-[-6px] rounded-full pointer-events-none" style={{ background: 'linear-gradient(135deg, #2563eb, #60a5fa, #2563eb)', padding: '2px' }}>
                            <div className="w-full h-full rounded-full bg-transparent" />
                          </div>
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb, #60a5fa)', boxShadow: '0 2px 10px rgba(37,99,235,0.5)', border: '2px solid rgba(255,255,255,0.3)' }}>
                            <span className="text-[10px] font-black text-white">3</span>
                          </div>
                          {/* Wings */}
                          <div className="absolute top-1/2 -translate-y-1/2 -left-5 w-7 h-10 pointer-events-none opacity-70">
                            <svg viewBox="0 0 30 50" fill="none"><path d="M28,25 Q20,10 5,5 Q15,15 18,25 Q15,35 5,45 Q20,40 28,25Z" fill="url(#wing-blue-l)"/><defs><linearGradient id="wing-blue-l" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#93c5fd"/><stop offset="100%" stopColor="#2563eb"/></linearGradient></defs></svg>
                          </div>
                          <div className="absolute top-1/2 -translate-y-1/2 -right-5 w-7 h-10 pointer-events-none opacity-70">
                            <svg viewBox="0 0 30 50" fill="none"><path d="M2,25 Q10,10 25,5 Q15,15 12,25 Q15,35 25,45 Q10,40 2,25Z" fill="url(#wing-blue-r)"/><defs><linearGradient id="wing-blue-r" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#93c5fd"/></linearGradient></defs></svg>
                          </div>
                          {getPodiumFrame(3) && (
                            <div className="absolute inset-[-10px] z-[3] pointer-events-none">
                              {getPodiumFrame(3)!.frame_type === 'svga' || getPodiumFrame(3)!.frame_type === 'lottie' ? (
                                <Suspense fallback={null}><UniversalFramePlayer src={getPodiumFrame(3)!.frame_url} type={getPodiumFrame(3)!.frame_type as any} className="w-full h-full" loop autoPlay /></Suspense>
                              ) : (
                                <img loading="lazy" decoding="async" src={getPodiumFrame(3)!.frame_url} alt="" className="w-full h-full object-contain" />
                              )}
                            </div>
                          )}
                          <div className="relative z-[1]">
                            <AvatarWithFrame userId={top3[2].id} src={top3[2].avatar_url || undefined} name={top3[2].display_name || "U"} level={getLevel(top3[2])} size="md" showFrame={true} showAnimation={true} avatarImageClassName="object-cover scale-[1.06]" />
                          </div>
                        </div>
                        {/* Blue Shield banner */}
                        <div className="relative rounded-t-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 40%, #172554 100%)', border: '1px solid rgba(96,165,250,0.3)', borderBottom: 'none' }}>
                          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)' }} />
                          <div className="px-2 py-2 text-center">
                            <p className="text-amber-100 text-[10px] font-bold truncate">{getDisplayId(top3[2]).toString().slice(0, 8)}</p>
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <span className="text-[10px]">{top3[2].country_flag || "🌍"}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>Lv.{getLevel(top3[2])}</span>
                            </div>
                            <p className="mt-1 font-bold text-sm" style={{ color: '#fbbf24' }}>{getMetricLabel()} {formatNumber(top3[2].stat_value)}</p>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <div style={{ width: '100%', height: '16px', background: 'linear-gradient(180deg, #172554, #0f172a)', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            )}

            {/* ===== RANKINGS LIST (4-50) - Golden Luxury Cards ===== */}
            <div className="px-3 pb-6 space-y-1.5 mt-2">
              {restRankings.map((item, index) => {
                const rank = index + 4;
                const reward = getRewardForRank(rank);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02, duration: 0.3 }}
                    className="flex items-center gap-3 rounded-xl p-3 transition-all touch-manipulation bg-white"
                    style={{
                      border: rank <= 10 
                        ? '1px solid rgba(251,191,36,0.30)'
                        : '1px solid rgba(15,23,42,0.08)',
                      boxShadow: rank <= 10
                        ? '0 2px 10px rgba(251,191,36,0.10)'
                        : '0 1px 4px rgba(15,23,42,0.04)',
                    }}
                  >
                    {/* Rank number */}
                    <span className={cn(
                      "w-7 text-center font-bold text-sm",
                      rank <= 10 ? "text-amber-600" : "text-slate-400"
                    )}>
                      {rank}
                    </span>
                    
                    {/* Avatar */}
                    <AvatarWithFrame userId={item.id} src={item.avatar_url || undefined} name={(item as any)?.display_name || "U"} level={getLevel(item)} size="sm" showFrame={true} />
                    
                    {/* Name & info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-semibold text-sm truncate">{getDisplayId(item)}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px]">{item.country_flag || "🌍"}</span>
                        <span className="text-slate-500 text-[10px] font-medium">Lv.{getLevel(item)}</span>
                        {reward && (
                          <span className="text-[9px] text-amber-600 font-semibold">🎁 {getRewardLabel(reward)}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Value */}
                    <div 
                      className="px-2.5 py-1 rounded-full text-xs font-bold text-amber-700"
                      style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.30)' }}
                    >
                      {getMetricLabel()} {formatNumber(item.stat_value)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Rules & Rewards Drawer */}
      <Drawer open={showRules} onOpenChange={setShowRules}>
        <DrawerContent 
          data-light-drawer
          className="max-h-[85vh] border-0 bg-white"
        >
          <DrawerHeader className="pb-3 border-b border-slate-200 bg-white">
            <DrawerTitle className="text-center text-base font-bold" style={{ color: '#0f172a' }}>
              {activeCategory === "host_earning" ? "Host Earning · Rules & Rewards" 
                : activeCategory === "game_ranking" ? "Game Ranking · Rules & Rewards"
                : activeCategory === "top_gifter" ? "Top Gifter · Rules & Rewards"
                : "PK Competition · Rules & Rewards"}
            </DrawerTitle>
          </DrawerHeader>
          <div
            className="p-4 space-y-3 overflow-y-auto bg-white"
            style={{ paddingBottom: isMobile ? `${safeAreaInsets.bottom + 16}px` : undefined, color: '#0f172a' }}
          >
            {/* Category info card */}
            <div className="rounded-2xl bg-white border-2 border-slate-200 shadow-sm overflow-hidden">
              <div className="flex">
                <div
                  className="w-2 shrink-0"
                  style={{
                    background:
                      activeCategory === "host_earning" ? '#ec4899'
                      : activeCategory === "game_ranking" ? '#a855f7'
                      : activeCategory === "top_gifter" ? '#10b981'
                      : '#ef4444'
                  }}
                />
                <div className="p-4 flex-1">
                  <h3 className="font-bold mb-1.5 flex items-center gap-2 text-[15px]" style={{ color: '#0f172a' }}>
                    {activeCategory === "host_earning" ? <><Gift className="w-4 h-4" style={{ color: '#ec4899' }} /> Charm — Host Earnings</>
                      : activeCategory === "game_ranking" ? <><Gamepad2 className="w-4 h-4" style={{ color: '#a855f7' }} /> Game Winners</>
                      : activeCategory === "top_gifter" ? <><Sparkles className="w-4 h-4" style={{ color: '#d97706' }} /> Wealth — Top Spenders</>
                      : <><Swords className="w-4 h-4" style={{ color: '#ef4444' }} /> PK Competition</>}
                  </h3>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: '#334155' }}>
                    {activeCategory === "host_earning" ? "Hosts ranked by total Beans earned from Gifts + Private Calls in this period. Top 50 receive rewards."
                      : activeCategory === "game_ranking" ? "Players ranked by total game winnings (payout). Top 50 receive rewards."
                      : activeCategory === "top_gifter" ? "Users ranked by total Diamonds spent on Gifts + Private Calls + Games. Top 50 receive rewards."
                      : "Special PK competition rankings. Compete for exclusive rewards!"}
                  </p>
                </div>
              </div>
            </div>

            {/* Rewards card */}
            {activeRewardTiers.length > 0 && (
              <div className="rounded-2xl bg-white border-2 border-amber-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-amber-200" style={{ background: 'linear-gradient(to right, #fffbeb, #fef3c7)' }}>
                  <Gift className="w-4 h-4" style={{ color: '#b45309' }} />
                  <span className="font-bold text-[13px]" style={{ color: '#0f172a' }}>
                    {activeCategory === "pk_competition" ? "Competition" : getPeriodLabel()} Rewards
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {activeRewardTiers.map((tier, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-white">
                      <span
                        className="inline-flex items-center justify-center min-w-[52px] px-2.5 py-1 rounded-lg font-bold text-[12px] shadow-sm"
                        style={{
                          color: '#ffffff',
                          background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                            : i === 1 ? 'linear-gradient(135deg,#94a3b8,#64748b)'
                            : i === 2 ? 'linear-gradient(135deg,#b45309,#92400e)'
                            : 'linear-gradient(135deg,#475569,#334155)'
                        }}
                      >
                        #{tier.rank_from}{tier.rank_to !== tier.rank_from ? `-${tier.rank_to}` : ''}
                      </span>
                      <span className="text-[13px] font-bold text-right" style={{ color: '#0f172a' }}>
                        {getRewardLabel(tier)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeRewardTiers.length === 0 && (
              <div className="rounded-2xl p-4 text-center text-slate-600 text-[13px] bg-white border-2 border-slate-200">
                No rewards have been set for this period yet.
              </div>
            )}

            {/* Rules card */}
            <div className="rounded-2xl bg-white border-2 border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b-2 border-slate-200 bg-slate-50">
                <h3 className="font-bold text-slate-900 text-[13px]">Rules</h3>
              </div>
              <ul className="px-5 py-3.5 space-y-2 text-slate-800 text-[12.5px] list-disc list-outside ml-4 leading-relaxed">
                <li>Top <strong>1–50</strong> ranks are tracked every period</li>
                <li>Daily resets at 12:30 AM (BST); weekly resets every Monday 12:30 AM; monthly resets on the 1st 12:30 AM</li>
                <li>Rewards auto-credit after the period ends</li>
                <li>Rankings update in real-time</li>
                <li>In case of a tie, the earlier achiever ranks higher</li>
              </ul>
            </div>

            <button 
              onClick={() => setShowRules(false)}
              className="w-full py-3 rounded-full font-bold text-white text-sm transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 50%, #7c3aed 100%)',
                boxShadow: '0 4px 20px rgba(168,85,247,0.4)',
              }}
            >
              Got it
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Self-rank sticky footer — Bigo/Chamet pattern. Only render if user is signed in and the
          active category produces a personal rank (host/gifter/PK lists). */}
      {currentUserId && activeCategory !== "pk_competition" && !isLoading && (
        <div
          className="fixed left-0 right-0 z-40 px-3 pointer-events-none"
          style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 12px)` }}
        >
          <div
            className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200 px-3.5 py-2.5 flex items-center gap-3"
            style={{ boxShadow: '0 12px 30px -10px rgba(15,23,42,0.25)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-extrabold text-sm"
              style={{ background: myRank ? 'linear-gradient(135deg,#a855f7,#ec4899)' : 'linear-gradient(135deg,#94a3b8,#64748b)' }}
            >
              {myRank ? `#${myRank}` : '—'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-slate-900 leading-tight truncate">
                {myRank ? 'Your rank' : 'Not ranked yet'}
              </p>
              <p className="text-[11px] text-slate-500 leading-tight truncate">
                {myRank
                  ? (nextEntry
                    ? `${formatNumber(gapToNext)} ${getMetricLabel()} to reach #${myRank - 1}`
                    : '🏆 You are #1 — defend your spot')
                  : `Be active to enter the ${periodType} ranking`}
              </p>
            </div>
            {myRank && nextEntry && (
              <button
                onClick={() => navigate(activeCategory === 'host_earning' ? '/go-live' : '/recharge')}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white whitespace-nowrap active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', boxShadow: '0 6px 16px -6px rgba(239,68,68,0.55)' }}
              >
                Challenge ↑
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;

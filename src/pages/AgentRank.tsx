import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  HelpCircle,
  Clock,
  Crown,
  RefreshCw,
  Trophy,
  Wifi,
  Gem,
  Gift,
  Users,
  Star,
  Shield,
  Sparkles
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { recordClientError } from "@/utils/clientErrorLog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type PeriodType = "weekly" | "monthly";

interface AgencyRanking {
  agency_id: string;
  agency_name: string;
  agency_code: string;
  logo_url: string | null;
  owner_avatar: string | null;
  total_hosts: number;
  metric_value: number;
  country_flag: string;
  rank_position: number;
}

interface RankingReward {
  id: string;
  rank_position: number;
  reward_coins: number;
  reward_badge: string | null;
  min_income_requirement: number;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const AgentRank = () => {
  const navigate = useNavigate();
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [rankings, setRankings] = useState<AgencyRanking[]>([]);
  const [rewards, setRewards] = useState<RankingReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [currentUserAgency, setCurrentUserAgency] = useState<AgencyRanking | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchRewards = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ranking_rewards')
        .select('id, rank_position, reward_coins, reward_badge, min_income_requirement')
        .eq('ranking_type', 'agency')
        .eq('period_type', periodType)
        .order('rank_position', { ascending: true });
      if (!error && data) setRewards(data);
    } catch (err) {
      console.error('Error fetching rewards:', err);
      recordClientError({ label: "AgentRank.fetchRewards", message: err instanceof Error ? err.message : String(err) });
    }
  }, [periodType]);

  const fetchRankings = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const now = new Date();
      let periodStart: Date;
      if (periodType === "weekly") {
        const dayOfWeek = now.getDay();
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - dayOfWeek);
        periodStart.setHours(0, 0, 0, 0);
      } else {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const { data: performanceData, error } = await supabase
        .from('agency_performance')
        .select(`
          agency_id, total_income,
          agencies!inner (id, name, agency_code, logo_url, total_hosts, owner_id)
        `)
        .eq('period_type', periodType)
        .gte('period_start', periodStart.toISOString().split('T')[0])
        .order('total_income', { ascending: false });

      if (error) throw error;

      const ownerIds = performanceData?.map(p => (p.agencies as any)?.owner_id).filter(Boolean) || [];
      let ownerProfiles: any[] = [];
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url, country')
          .in('id', ownerIds);
        ownerProfiles = profiles || [];
      }

      const mappedRankings: AgencyRanking[] = (performanceData || []).map((perf, index) => {
        const agency = perf.agencies as any;
        const owner = ownerProfiles.find(p => p.id === agency?.owner_id);
        return {
          agency_id: perf.agency_id,
          agency_name: agency?.name || "Unknown",
          agency_code: agency?.agency_code || "",
          logo_url: agency?.logo_url || null,
          owner_avatar: owner?.avatar_url || null,
          total_hosts: agency?.total_hosts || 0,
          metric_value: Number(perf.total_income) || 0,
          country_flag: getCountryFlag(owner?.country),
          rank_position: index + 1
        };
      });

      mappedRankings.sort((a, b) => b.metric_value - a.metric_value);
      mappedRankings.forEach((r, i) => r.rank_position = i + 1);
      setRankings(mappedRankings);
    } catch (err) {
      console.error('Error fetching rankings:', err);
      recordClientError({ label: "AgentRank.owner", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [periodType]);

  const getCountryFlag = (country: string | null): string => {
    if (!country) return "🌍";
    const flags: Record<string, string> = {
      "BD": "🇧🇩", "IN": "🇮🇳", "PK": "🇵🇰", "US": "🇺🇸", "UK": "🇬🇧",
      "Bangladesh": "🇧🇩", "India": "🇮🇳", "Pakistan": "🇵🇰"
    };
    return flags[country] || "🌍";
  };

  useEffect(() => {
    fetchRankings();
    fetchRewards();
    const channel = supabase
      .channel(`agent-rank-realtime-${periodType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_performance' }, () => fetchRankings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agencies' }, () => fetchRankings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gift_transactions' }, () => fetchRankings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ranking_rewards' }, () => fetchRewards())
      .subscribe();
    // Zero-refresh: realtime channel only, no polling
    return () => { supabase.removeChannel(channel); };
  }, [fetchRankings, fetchRewards]);

  useEffect(() => {
    const loadUserAgency = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && rankings.length > 0) {
        const { data: profile } = await supabase.from('profiles').select('agency_id').eq('id', user.id).maybeSingle();
        if (profile?.agency_id) {
          setCurrentUserAgency(rankings.find(r => r.agency_id === profile.agency_id) || null);
        }
      }
    };
    loadUserAgency();
  }, [rankings]);

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      let endDate: Date;
      if (periodType === "weekly") {
        endDate = new Date();
        endDate.setDate(now.getDate() + (7 - now.getDay()));
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
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
  }, [periodType]);

  const top3 = rankings.slice(0, 3);
  const restRankings = rankings.slice(3);
  const getRewardForPosition = (position: number) => rewards.find(r => r.rank_position === position);

  // Podium card config
  const podiumConfig = [
    { 
      idx: 1, order: 'order-1', size: 'w-[72px] h-[72px]', ringSize: 'p-[3px]',
      ring: 'from-gray-300 via-white to-gray-400', 
      badge: 'from-gray-300 to-gray-500', badgeText: 'text-gray-800',
      glow: 'shadow-[0_0_20px_rgba(192,192,192,0.4)]',
      label: '🥈', mt: 'mt-6'
    },
    { 
      idx: 0, order: 'order-0 -mt-4 z-10', size: 'w-[88px] h-[88px]', ringSize: 'p-[3px]',
      ring: 'from-yellow-300 via-amber-400 to-yellow-500', 
      badge: 'from-yellow-400 to-orange-500', badgeText: 'text-slate-800',
      glow: 'shadow-[0_0_30px_rgba(255,215,0,0.5)]',
      label: '🥇', mt: ''
    },
    { 
      idx: 2, order: 'order-2', size: 'w-[72px] h-[72px]', ringSize: 'p-[3px]',
      ring: 'from-amber-500 via-orange-400 to-amber-600', 
      badge: 'from-amber-500 to-orange-600', badgeText: 'text-slate-800',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.4)]',
      label: '🥉', mt: 'mt-6'
    },
  ];

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ 
        background: 'linear-gradient(180deg, #f8f4ff 0%, #ffffff 40%, #fff5f7 100%)',
        paddingBottom: 'env(safe-area-inset-bottom)' 
      }}
    >
      {/* Premium Header */}
      <div className="flex-shrink-0 safe-area-top relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-500/5 via-purple-600/[0.03] to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center justify-between h-12 px-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-95 transition-transform">
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Agency Rankings
            </h1>
            <button onClick={() => setShowRules(true)} className="p-2 -mr-2 active:scale-95 transition-transform">
              <HelpCircle className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Period Toggle */}
          <div className="flex gap-2 px-4 pb-2">
            {(["weekly", "monthly"] as PeriodType[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriodType(p)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                  periodType === p
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg shadow-purple-500/30"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                {p === 'weekly' ? '📅 Weekly' : '📆 Monthly'}
              </button>
            ))}
          </div>

          {/* Countdown & Live */}
          <div className="flex justify-between items-center px-4 py-2 bg-white/70 border-t border-b border-slate-200 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs font-mono text-amber-700 font-bold tracking-wider">
                {countdown.days}D {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="text-[10px] text-emerald-600 font-bold tracking-wide">LIVE</span>
              </div>
              <button 
                onClick={fetchRankings} disabled={isRefreshing}
                className="p-1.5 bg-white rounded-full active:scale-90 transition-all border border-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch', paddingBottom: currentUserAgency ? '80px' : 'var(--content-bottom-padding)' }}
      >
        {/* Rewards Section */}
        {rewards.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {periodType === 'weekly' ? 'Weekly' : 'Monthly'} Rewards
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rewards.slice(0, 3).map((reward) => {
                const isFirst = reward.rank_position === 1;
                const isSecond = reward.rank_position === 2;
                return (
                  <div key={reward.id}
                    className={`relative p-3 rounded-2xl text-center overflow-hidden border ${
                      isFirst 
                        ? 'bg-gradient-to-b from-yellow-100 to-amber-50 border-yellow-300' 
                        : isSecond
                          ? 'bg-gradient-to-b from-slate-100 to-slate-50 border-slate-300'
                          : 'bg-gradient-to-b from-amber-100 to-orange-50 border-amber-300'
                    }`}
                  >
                    {isFirst && <div className="absolute inset-0 bg-gradient-to-t from-transparent to-yellow-300/20" />}
                    <div className="relative z-10">
                      <div className="text-2xl mb-1">
                        {isFirst ? '🥇' : isSecond ? '🥈' : '🥉'}
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <Gem className="w-3.5 h-3.5 text-cyan-600" />
                        <span className="text-sm font-black text-slate-900">
                          {formatNumber(reward.reward_coins)}
                        </span>
                      </div>
                      {reward.reward_badge && (
                        <p className="text-[9px] text-slate-600 mt-1 truncate font-medium">{reward.reward_badge}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top 3 Podium - Premium Design */}
        <div className="relative py-8 px-4">
          {/* Background glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 bg-purple-600/10 rounded-full blur-3xl" />
          </div>

          <div className="relative flex justify-center items-end gap-3">
            {podiumConfig.map((config) => {
              const entry = top3[config.idx];
              if (!entry) return <div key={config.idx} className={`w-28 ${config.order}`} />;
              const isChamp = config.idx === 0;
              const reward = getRewardForPosition(entry.rank_position);

              return (
                <motion.div
                  key={entry.agency_id}
                  initial={{ opacity: 0, y: 30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: config.idx * 0.1, type: 'spring', stiffness: 200 }}
                  className={`flex flex-col items-center ${isChamp ? 'w-32' : 'w-28'} ${config.order} ${config.mt}`}
                >
                  {/* Avatar with ring */}
                  <div className="relative mb-2">
                    {isChamp && (
                      <motion.div
                        animate={{ y: [-2, 2, -2], rotate: [-3, 3, -3] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                        className="absolute -top-7 left-1/2 -translate-x-1/2 z-20"
                      >
                        <Crown className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
                      </motion.div>
                    )}
                    
                    {/* Rank badge */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20">
                      <div className={`w-6 h-6 bg-gradient-to-b ${config.badge} rounded-full flex items-center justify-center shadow-lg border border-amber-200/60`}>
                        <span className={`text-xs font-black ${config.badgeText}`}>{entry.rank_position}</span>
                      </div>
                    </div>
                    
                    <motion.div
                      animate={isChamp ? { 
                        boxShadow: ["0 0 20px rgba(255,215,0,0.3)", "0 0 40px rgba(255,215,0,0.6)", "0 0 20px rgba(255,215,0,0.3)"]
                      } : {}}
                      transition={{ repeat: Infinity, duration: 2.5 }}
                      className={`${config.ringSize} rounded-full bg-gradient-to-b ${config.ring} ${config.glow}`}
                    >
                      <Avatar className={`${config.size} border-2 border-black/30`}>
                        <AvatarImage src={entry.owner_avatar || entry.logo_url || undefined} className="object-cover" />
                        <AvatarFallback className={`bg-gradient-to-br ${config.badge} text-slate-800 font-black ${isChamp ? 'text-xl' : 'text-lg'}`}>
                          {entry.agency_name?.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                  </div>

                  {/* Name */}
                  <p className={`text-white font-bold text-center truncate w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isChamp ? 'text-sm' : 'text-xs'}`}>
                    {entry.agency_name?.slice(0, isChamp ? 14 : 10)}
                  </p>

                  {/* Country */}
                  <span className={`${isChamp ? 'text-lg' : 'text-base'} my-0.5`}>{entry.country_flag}</span>

                  {/* Metric Value - Shield Style */}
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                    isChamp 
                      ? 'bg-gradient-to-r from-yellow-500/25 to-amber-500/25 border-yellow-400/50' 
                      : 'bg-white/10 border-white/25'
                  }`}>
                    <Gem className={`${isChamp ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-cyan-300`} />
                    <span className={`font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] ${isChamp ? 'text-sm' : 'text-xs'}`}>
                      {formatNumber(entry.metric_value)}
                    </span>
                  </div>

                  {/* Reward badge */}
                  {reward && (
                    <div className="flex items-center gap-0.5 mt-1">
                      <Gift className="w-3 h-3 text-yellow-300" />
                      <span className="text-[9px] text-yellow-200 font-bold">+{formatNumber(reward.reward_coins)}</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Podium Base */}
          <div className="flex justify-center items-end gap-3 mt-3">
            <div className="w-28 h-10 bg-gradient-to-t from-slate-400/10 to-slate-400/5 rounded-t-xl border-t border-x border-white/[0.06]" />
            <div className="w-32 h-14 bg-gradient-to-t from-yellow-500/10 to-yellow-500/5 rounded-t-xl border-t border-x border-yellow-500/10 -mt-1" />
            <div className="w-28 h-8 bg-gradient-to-t from-amber-600/10 to-amber-600/5 rounded-t-xl border-t border-x border-white/[0.06]" />
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 mb-3">
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Rest Rankings - Premium List */}
        <div className="px-4 pb-32 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
            </div>
          ) : restRankings.length === 0 && top3.length === 0 ? (
            <div className="text-center py-16">
              <Trophy className="w-14 h-14 mx-auto text-white/15 mb-3" />
              <p className="text-white/65 text-sm font-medium">No rankings available yet</p>
            </div>
          ) : (
            restRankings.map((agency, i) => {
              const reward = getRewardForPosition(agency.rank_position);
              return (
                <motion.div 
                  key={agency.agency_id}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                >
                  {/* Rank Number */}
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06]">
                    <span className="text-sm font-black text-white/85">{agency.rank_position}</span>
                  </div>
                  
                  {/* Avatar */}
                  <div className="relative">
                    <Avatar className="w-11 h-11 border border-amber-200/60">
                      <AvatarImage src={agency.owner_avatar || agency.logo_url || undefined} className="object-cover" />
                      <AvatarFallback className="bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white font-bold text-sm">
                        {agency.agency_name?.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 text-xs">{agency.country_flag}</span>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-[13px] truncate">{agency.agency_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Users className="w-3 h-3 text-white/75" />
                      <span className="text-[11px] text-white/75 font-medium">{agency.total_hosts} hosts</span>
                    </div>
                  </div>
                  
                  {/* Value */}
                  <div className="text-right flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1">
                      <Gem className="w-3.5 h-3.5 text-cyan-300" />
                      <span className="text-white font-black text-sm">{formatNumber(agency.metric_value)}</span>
                    </div>
                    {reward && (
                      <div className="flex items-center gap-0.5">
                        <Gift className="w-2.5 h-2.5 text-yellow-300" />
                        <span className="text-[9px] text-yellow-200 font-bold">+{formatNumber(reward.reward_coins)}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Current User's Agency - Fixed Bottom */}
      {currentUserAgency && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="absolute bottom-0 left-0 right-0 backdrop-blur-xl border-t border-white/[0.08]"
          style={{ 
            background: 'linear-gradient(to right, rgba(88,28,135,0.95), rgba(124,58,237,0.95))',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' 
          }}
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
              <span className="text-sm font-black text-white">#{currentUserAgency.rank_position}</span>
            </div>
            <Avatar className="w-9 h-9 border border-amber-200/60">
              <AvatarImage src={currentUserAgency.owner_avatar || currentUserAgency.logo_url || undefined} />
              <AvatarFallback className="bg-white/10 text-white font-bold text-xs">
                {currentUserAgency.agency_name?.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{currentUserAgency.agency_name}</p>
              <p className="text-white/75 text-[10px]">Your Agency</p>
            </div>
            <div className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full">
              <Gem className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-cyan-200 font-black text-sm">{formatNumber(currentUserAgency.metric_value)}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Rules Drawer */}
      <Drawer open={showRules} onOpenChange={setShowRules}>
        <DrawerContent className="border-white/[0.08]" style={{ background: 'linear-gradient(180deg, #1a0a2e, #0d0619)' }}>
          <DrawerHeader>
            <DrawerTitle className="text-white text-center flex items-center justify-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Ranking Rules
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-6 pb-8 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-yellow-400" /> How Rankings Work
                </h3>
                <ul className="space-y-1.5 text-xs text-white/70">
                  <li>• Rankings based on total agency income</li>
                  <li>• Weekly resets every Sunday at 23:59 UTC</li>
                  <li>• Monthly resets on the last day of each month</li>
                  <li>• Top performers receive rewards automatically</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-2">
                  <Gift className="w-4 h-4 text-cyan-400" /> Rewards
                </h3>
                <ul className="space-y-1.5 text-xs text-white/70">
                  <li>• Distributed automatically at period end</li>
                  <li>• Credited to agency owner's diamond balance</li>
                  <li>• Minimum income requirements may apply</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-2">
                  <Wifi className="w-4 h-4 text-emerald-400" /> Real-time Updates
                </h3>
                <p className="text-xs text-white/70">Rankings update in real-time as transactions occur.</p>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default AgentRank;

import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Trophy, Crown, Medal, Coins, Loader2, Gift, Calendar, CalendarDays, CalendarRange, RefreshCw, Diamond, Mic, Gamepad2, Building2, Swords, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
type PeriodType = 'daily' | 'weekly' | 'monthly';
type CategoryType = 'host_earnings' | 'game_winners' | 'agency_performance' | 'pk_reward';

interface LeaderboardEntry {
  id: string;
  name: string;
  avatar_url: string | null;
  stat_value: number;
  stat_label: string;
  extra_info?: string;
}

interface RewardConfig {
  id: string;
  category: string;
  period_type: string;
  rank_from: number;
  rank_to: number;
  reward_coins: number;
  reward_diamonds: number;
  reward_beans: number;
  reward_badge: string | null;
  min_target: number;
  is_active: boolean;
}

const CATEGORIES: { id: CategoryType; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'host_earnings', label: 'Host Earnings', icon: <Mic className="w-4 h-4" />, color: 'from-pink-500 to-rose-500' },
  { id: 'game_winners', label: 'Game Winners', icon: <Gamepad2 className="w-4 h-4" />, color: 'from-purple-500 to-indigo-500' },
  { id: 'agency_performance', label: 'Agency', icon: <Building2 className="w-4 h-4" />, color: 'from-emerald-500 to-green-500' },
  { id: 'pk_reward', label: 'PK Reward', icon: <Swords className="w-4 h-4" />, color: 'from-orange-500 to-amber-500' },
];

const PERIODS: { id: PeriodType; label: string; icon: React.ReactNode }[] = [
  { id: 'daily', label: 'Today', icon: <Calendar className="w-4 h-4" /> },
  { id: 'weekly', label: 'This Week', icon: <CalendarDays className="w-4 h-4" /> },
  { id: 'monthly', label: 'This Month', icon: <CalendarRange className="w-4 h-4" /> },
];

export default function AdminGameLeaderboard() {
  const [category, setCategory] = useState<CategoryType>('host_earnings');
  const [period, setPeriod] = useState<PeriodType>('daily');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rewards, setRewards] = useState<RewardConfig[]>([]);
  const [sendingAll, setSendingAll] = useState(false);
  const [activeRewardTab, setActiveRewardTab] = useState<'leaderboard' | 'config'>('leaderboard');

  const getDateRange = useCallback((): { start: string; end: string } => {
    const now = new Date();
    const end = now.toISOString();
    let start: Date;
    switch (period) {
      case 'daily': start = new Date(now); start.setHours(0, 0, 0, 0); break;
      case 'weekly': start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0); break;
      case 'monthly': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    }
    return { start: start.toISOString(), end };
  }, [period]);

  

  useAdminRealtime(['gift_transactions', 'private_calls'], () => fetchAll());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [lb, rw] = await Promise.all([fetchLeaderboard(), fetchRewards()]);
      setLeaderboard(lb);
      setRewards(rw);
    } catch (e) { console.error('Leaderboard error:', e); }
    finally { setLoading(false); }
  };

  const fetchRewards = async (): Promise<RewardConfig[]> => {
    const { data } = await supabase
      .from('leaderboard_reward_config')
      .select('*')
      .eq('category', category)
      .eq('period_type', period)
      .eq('is_active', true)
      .order('rank_from');
    return (data || []) as RewardConfig[];
  };

  const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
    const { start, end } = getDateRange();

    switch (category) {
      case 'host_earnings': return fetchHostEarnings(start, end);
      case 'game_winners': return fetchGameWinners(start, end);
      case 'agency_performance': return fetchAgencyPerformance(start, end);
      case 'pk_reward': return fetchGameWinners(start, end); // PK uses same data source
    }
  };

  const fetchHostEarnings = async (start: string, end: string): Promise<LeaderboardEntry[]> => {
    const [{ data: gifts }, { data: calls }] = await Promise.all([
      supabase
        .from('gift_transactions')
        .select('receiver_id, receiver_beans')
        .gte('created_at', start)
        .lte('created_at', end),
      supabase
        .from('private_calls')
        .select('host_id, host_earnings_amount, host_earned')
        .gte('created_at', start)
        .lte('created_at', end)
        .in('status', ['ended', 'completed']),
    ]);

    const hostStats: Record<string, number> = {};

    (gifts || []).forEach(g => {
      if (g.receiver_id) {
        hostStats[g.receiver_id] = (hostStats[g.receiver_id] || 0) + Number(g.receiver_beans || 0);
      }
    });

    (calls || []).forEach(c => {
      if (c.host_id) {
        hostStats[c.host_id] = (hostStats[c.host_id] || 0) + Number(c.host_earnings_amount ?? c.host_earned ?? 0);
      }
    });

    const userIds = Object.keys(hostStats);
    if (!userIds.length) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    const pMap: Record<string, any> = {};
    (profiles || []).forEach(p => { pMap[p.id] = p; });

    return Object.entries(hostStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([uid, val]) => ({
        id: uid,
        name: pMap[uid]?.display_name || pMap[uid]?.username || 'Host',
        avatar_url: pMap[uid]?.avatar_url || null,
        stat_value: val,
        stat_label: 'beans earned',
      }));
  };

  const fetchGameWinners = async (start: string, end: string): Promise<LeaderboardEntry[]> => {
    const { data: txs } = await supabase
      .from('game_transactions')
      .select('user_id, amount, transaction_type')
      .gte('created_at', start)
      .lte('created_at', end);

    const stats: Record<string, { wins: number; amount: number }> = {};
    (txs || []).forEach(tx => {
      if (!stats[tx.user_id]) stats[tx.user_id] = { wins: 0, amount: 0 };
      if (tx.transaction_type === 'win' || tx.transaction_type === 'jackpot') {
        stats[tx.user_id].wins++;
        stats[tx.user_id].amount += tx.amount || 0;
      }
    });

    const userIds = Object.keys(stats);
    if (!userIds.length) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    const pMap: Record<string, any> = {};
    (profiles || []).forEach(p => { pMap[p.id] = p; });

    return Object.entries(stats)
      .sort(([, a], [, b]) => b.wins !== a.wins ? b.wins - a.wins : b.amount - a.amount)
      .slice(0, 50)
      .map(([uid, val]) => ({
        id: uid,
        name: pMap[uid]?.display_name || pMap[uid]?.username || 'Player',
        avatar_url: pMap[uid]?.avatar_url || null,
        stat_value: val.wins,
        stat_label: 'wins',
        extra_info: `${val.amount.toLocaleString()} earned`,
      }));
  };

  const fetchAgencyPerformance = async (start: string, end: string): Promise<LeaderboardEntry[]> => {
    const { data: perf } = await supabase
      .from('agency_performance')
      .select('agency_id, total_income')
      .gte('period_start', start.split('T')[0]);

    const agencyStats: Record<string, number> = {};
    (perf || []).forEach(p => {
      agencyStats[p.agency_id] = (agencyStats[p.agency_id] || 0) + (p.total_income || 0);
    });

    const agencyIds = Object.keys(agencyStats);
    if (!agencyIds.length) return [];

    const { data: agencies } = await supabase
      .from('agencies')
      .select('id, name, logo_url, agency_code')
      .in('id', agencyIds);

    const aMap: Record<string, any> = {};
    (agencies || []).forEach(a => { aMap[a.id] = a; });

    return Object.entries(agencyStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([aid, val]) => ({
        id: aid,
        name: aMap[aid]?.name || 'Agency',
        avatar_url: aMap[aid]?.logo_url || null,
        stat_value: val,
        stat_label: 'total income',
        extra_info: aMap[aid]?.agency_code || '',
      }));
  };

  const getRewardForRank = (rank: number): RewardConfig | undefined => {
    return rewards.find(r => rank >= r.rank_from && rank <= r.rank_to);
  };

  const getRewardLabel = (reward: RewardConfig): string => {
    const parts: string[] = [];
    if (reward.reward_beans > 0) parts.push(`${reward.reward_beans} Beans`);
    if (reward.reward_diamonds > 0) parts.push(`${reward.reward_diamonds} 💎`);
    if (reward.reward_coins > 0) parts.push(`${reward.reward_coins} 💎`);
    return parts.join(' + ') || 'No reward';
  };

  const sendAllRewards = async () => {
    if (!leaderboard.length || !rewards.length) return;
    setSendingAll(true);
    const { start, end } = getDateRange();
    const periodLabel = `${period}_${start.split('T')[0]}`;
    let sent = 0;

    try {
      for (let i = 0; i < leaderboard.length; i++) {
        const rank = i + 1;
        const reward = getRewardForRank(rank);
        if (!reward) continue;

        const entry = leaderboard[i];
        
        // Check minimum target threshold
        if (reward.min_target > 0 && entry.stat_value < reward.min_target) {
          console.log(`[Leaderboard] Rank #${rank} (${entry.name}) skipped: ${entry.stat_value} < min_target ${reward.min_target}`);
          continue;
        }
        const isAgency = category === 'agency_performance';

        // Credit rewards
        if (!isAgency && (reward.reward_coins > 0 || reward.reward_diamonds > 0)) {
          if (reward.reward_coins > 0) {
            await supabase.rpc('add_coins_to_user', { _user_id: entry.id, _amount: reward.reward_coins });
          }
        }
        if (isAgency && reward.reward_diamonds > 0) {
          await supabase.rpc('add_diamonds_to_agency', { _agency_id: entry.id, _amount: reward.reward_diamonds });
        }

        // Record history
        await supabase.from('leaderboard_reward_history').insert({
          user_id: isAgency ? null : entry.id,
          agency_id: isAgency ? entry.id : null,
          category,
          period_type: period,
          period_label: periodLabel,
          rank_position: rank,
          stat_value: Math.floor(entry.stat_value),
          reward_coins: reward.reward_coins,
          reward_diamonds: reward.reward_diamonds,
          reward_beans: reward.reward_beans,
        });

        // Send notification to user/agency owner about leaderboard reward
        if (!isAgency) {
          const rewardParts = [];
          if (reward.reward_coins > 0) rewardParts.push(`${reward.reward_coins.toLocaleString()} Diamonds`);
          if (reward.reward_beans > 0) rewardParts.push(`${reward.reward_beans.toLocaleString()} Beans`);
          await adminSendNotification(entry.id, `🏆 Leaderboard Reward - Rank #${rank}!`, `Congratulations! You earned ${rewardParts.join(' + ')} from ${category} leaderboard`, 'reward')
        }

        sent++;
      }
      toast.success(`🎁 ${sent} rewards sent successfully!`);
    } catch (error) {
      console.error('Send rewards error:', error);
      recordAdminError({ kind: "rpc", label: "AdminGameLeaderboard.rewardParts", message: formatAdminError(error)) });
      toast.error('Failed to send some rewards');
    } finally {
      setSendingAll(false);
    }
  };

  const updateRewardConfig = async (rewardId: string, field: string, value: number) => {
    await supabase
      .from('leaderboard_reward_config')
      .update({ [field]: value })
      .eq('id', rewardId);
    toast.success('Config updated');
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="text-slate-400 text-sm font-bold">#{rank}</span>;
  };

  const currentCat = CATEGORIES.find(c => c.id === category)!;

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <Button
            key={cat.id}
            variant={category === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory(cat.id)}
            className={cn(
              "gap-1.5",
              category === cat.id
                ? `bg-gradient-to-r ${cat.color} text-white border-0`
                : "border-slate-700 text-slate-400 hover:text-white"
            )}
          >
            {cat.icon} {cat.label}
          </Button>
        ))}
      </div>

      {/* Period + Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map(p => (
          <Button
            key={p.id}
            variant={period === p.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p.id)}
            className={cn(
              "gap-1",
              period === p.id
                ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black border-0"
                : "border-slate-700 text-slate-400 hover:text-white"
            )}
          >
            {p.icon} {p.label}
          </Button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={fetchAll} className="border-slate-700 text-slate-400 gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
        <Button
          size="sm"
          onClick={sendAllRewards}
          disabled={sendingAll || !leaderboard.length}
          className="bg-gradient-to-r from-pink-500 to-purple-500 text-white gap-1"
        >
          {sendingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
          Send All Rewards
        </Button>
      </div>

      {/* View Toggle */}
      <Tabs value={activeRewardTab} onValueChange={(v) => setActiveRewardTab(v as any)}>
        <TabsList className="bg-slate-900/80 border border-slate-800">
          <TabsTrigger value="leaderboard" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 gap-1">
            <Trophy className="w-3.5 h-3.5" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-300 gap-1">
            <Gift className="w-3.5 h-3.5" /> Reward Config
          </TabsTrigger>
        </TabsList>

        {/* Leaderboard View */}
        <TabsContent value="leaderboard" className="mt-3">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                {currentCat.icon}
                {currentCat.label} — {PERIODS.find(p => p.id === period)?.label}
                <Badge variant="outline" className="text-slate-400 border-slate-600 ml-2">
                  {leaderboard.length} players
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No activity found for this period</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[55vh]">
                  <div className="space-y-2">
                    {leaderboard.map((entry, i) => {
                      const rank = i + 1;
                      const reward = getRewardForRank(rank);
                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl",
                            rank === 1 ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/30"
                              : rank <= 3 ? "bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20"
                                : "bg-slate-800/50 border border-slate-700/50"
                          )}
                        >
                          <div className="w-8 h-8 flex items-center justify-center">{getRankBadge(rank)}</div>
                          <Avatar className="w-10 h-10 border-2 border-slate-600">
                            <AvatarImage src={entry.avatar_url || undefined} />
                            <AvatarFallback className="bg-purple-500/20 text-purple-300 text-sm">
                              {entry.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium truncate">{entry.name}</div>
                            <div className="text-slate-400 text-xs">
                              {entry.stat_value.toLocaleString()} {entry.stat_label}
                              {entry.extra_info && ` • ${entry.extra_info}`}
                            </div>
                          </div>
                          {reward && (
                            <div className="flex flex-col items-end gap-0.5">
                              {(reward.min_target || 0) > 0 && entry.stat_value < reward.min_target ? (
                                <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px]">
                                  ❌ Target: {reward.min_target.toLocaleString()}
                                </Badge>
                              ) : (
                                <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/30 text-[10px]">
                                  {getRewardLabel(reward)}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config View */}
        <TabsContent value="config" className="mt-3">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Gift className="w-5 h-5 text-pink-400" />
                Reward Config — {currentCat.label} ({period})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rewards.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">No reward config for this category/period</p>
                ) : rewards.map(rw => (
                  <div key={rw.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <div className="w-16 text-center">
                      <span className="text-amber-400 font-bold text-sm">
                        #{rw.rank_from}{rw.rank_to !== rw.rank_from ? `-${rw.rank_to}` : ''}
                      </span>
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400">💎 Diamonds</label>
                        <Input type="number" value={rw.reward_coins}
                          onChange={e => updateRewardConfig(rw.id, 'reward_coins', parseInt(e.target.value) || 0)}
                          className="h-8 bg-slate-900 border-slate-700 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">💎 Diamonds</label>
                        <Input type="number" value={rw.reward_diamonds}
                          onChange={e => updateRewardConfig(rw.id, 'reward_diamonds', parseInt(e.target.value) || 0)}
                          className="h-8 bg-slate-900 border-slate-700 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">Beans</label>
                        <Input type="number" value={rw.reward_beans}
                          onChange={e => updateRewardConfig(rw.id, 'reward_beans', parseInt(e.target.value) || 0)}
                          className="h-8 bg-slate-900 border-slate-700 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-amber-400">🎯 Min Target</label>
                        <Input type="number" value={rw.min_target || 0}
                          onChange={e => updateRewardConfig(rw.id, 'min_target', parseInt(e.target.value) || 0)}
                          className="h-8 bg-slate-900 border-amber-700/50 text-amber-300 text-sm" />
                      </div>
                    </div>
                    {(rw.min_target || 0) > 0 && (
                      <div className="mt-1 ml-16">
                        <span className="text-[10px] text-amber-400/70">
                          ⚠️ Minimum {rw.min_target.toLocaleString()} earnings required to receive reward
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

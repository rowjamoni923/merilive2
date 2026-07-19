import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trophy, Crown, Medal, Coins, Loader2, Users, Calendar, CalendarDays, CalendarRange, Mic, Gamepad2, Building2, Swords } from "lucide-react";
import { useMobileOrientation } from "@/hooks/useMobileOrientation";
import { Button } from "@/components/ui/button";

import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";

interface GameLeaderboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  gameId?: string;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  avatar_url: string | null;
  stat_value: number;
  stat_label: string;
  extra_info?: string;
}

type PeriodType = 'daily' | 'weekly' | 'monthly';
type CategoryType = 'host_earnings' | 'game_winners' | 'agency' | 'pk';

const CATEGORIES: { id: CategoryType; label: string; icon: React.ReactNode }[] = [
  { id: 'host_earnings', label: 'Host', icon: <Mic className="w-3 h-3" /> },
  { id: 'game_winners', label: 'Game', icon: <Gamepad2 className="w-3 h-3" /> },
  { id: 'agency', label: 'Agency', icon: <Building2 className="w-3 h-3" /> },
  { id: 'pk', label: 'PK', icon: <Swords className="w-3 h-3" /> },
];

export function GameLeaderboardPanel({ isOpen, onClose }: GameLeaderboardPanelProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('daily');
  const [category, setCategory] = useState<CategoryType>('host_earnings');
  const [myRank, setMyRank] = useState<{ rank: number; data: LeaderboardEntry | null }>({ rank: 0, data: null });
  const { isLandscape, isVerySmallHeight } = useMobileOrientation();


  useEffect(() => {
    if (isOpen) fetchLeaderboard();
  }, [isOpen, period, category]);

  const getDateRange = (): { start: string; end: string } => {
    const now = new Date();
    const end = now.toISOString();
    let start: Date;
    switch (period) {
      case 'daily': start = new Date(now); start.setHours(0, 0, 0, 0); break;
      case 'weekly': start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0); break;
      case 'monthly': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    }
    return { start: start.toISOString(), end };
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { start, end } = getDateRange();
      let entries: LeaderboardEntry[] = [];

      if (category === 'host_earnings') {
        entries = await fetchHostEarnings(start, end);
      } else if (category === 'game_winners') {
        entries = await fetchGameWinners(start, end);
      } else if (category === 'agency') {
        entries = await fetchAgencyPerformance(start, end);
      } else if (category === 'pk') {
        entries = await fetchPKBattleWinners(start, end);
      }

      setLeaderboard(entries);

      if (user && category !== 'agency') {
        const idx = entries.findIndex(e => e.id === user.id);
        setMyRank(idx >= 0 ? { rank: idx + 1, data: entries[idx] } : { rank: 0, data: null });
      } else {
        setMyRank({ rank: 0, data: null });
      }
    } catch (e) { console.error('Leaderboard error:', e); }
    finally { setLoading(false); }
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

    const stats: Record<string, number> = {};
    (gifts || []).forEach(g => {
      if (g.receiver_id) stats[g.receiver_id] = (stats[g.receiver_id] || 0) + Number(g.receiver_beans || 0);
    });
    (calls || []).forEach(c => {
      if (c.host_id) stats[c.host_id] = (stats[c.host_id] || 0) + Number(c.host_earnings_amount ?? c.host_earned ?? 0);
    });

    return await resolveProfiles(stats, 'beans');
  };

  const fetchGameWinners = async (start: string, end: string): Promise<LeaderboardEntry[]> => {
    const { data: txs } = await supabase
      .from('game_transactions').select('user_id, amount, transaction_type')
      .gte('created_at', start).lte('created_at', end);

    const stats: Record<string, number> = {};
    (txs || []).forEach(tx => {
      if (tx.transaction_type === 'win' || tx.transaction_type === 'jackpot') {
        stats[tx.user_id] = (stats[tx.user_id] || 0) + 1;
      }
    });

    return await resolveProfiles(stats, 'wins');
  };

  const fetchPKBattleWinners = async (start: string, end: string): Promise<LeaderboardEntry[]> => {
    const { data: battles } = await supabase
      .from('pk_battles').select('challenger_id, opponent_id, winner_id, challenger_score, opponent_score')
      .gte('created_at', start).lte('created_at', end)
      .in('status', ['completed', 'ended']);

    const stats: Record<string, number> = {};
    (battles || []).forEach(b => {
      // Count participation (both players played)
      if (b.challenger_id) stats[b.challenger_id] = (stats[b.challenger_id] || 0) + (b.challenger_score || 0);
      if (b.opponent_id) stats[b.opponent_id] = (stats[b.opponent_id] || 0) + (b.opponent_score || 0);
    });

    return await resolveProfiles(stats, 'PK score');
  };

  const fetchAgencyPerformance = async (start: string, end: string): Promise<LeaderboardEntry[]> => {
    const { data: perf } = await supabase
      .from('agency_performance').select('agency_id, total_income')
      .gte('period_start', start.split('T')[0]);

    const stats: Record<string, number> = {};
    (perf || []).forEach(p => { stats[p.agency_id] = (stats[p.agency_id] || 0) + (p.total_income || 0); });

    const ids = Object.keys(stats);
    if (!ids.length) return [];

    const { data: agencies } = await supabase.from('agencies').select('id, name, logo_url').in('id', ids);
    const aMap: Record<string, any> = {};
    (agencies || []).forEach(a => { aMap[a.id] = a; });

    return Object.entries(stats)
      .filter(([, val]) => val > 0)
      .sort(([, a], [, b]) => b - a).slice(0, 50)
      .map(([id, val]) => ({
        id, name: aMap[id]?.name || 'Agency', avatar_url: aMap[id]?.logo_url || null,
        stat_value: val, stat_label: 'income',
      }));
  };

  const resolveProfiles = async (stats: Record<string, number>, label: string): Promise<LeaderboardEntry[]> => {
    const ids = Object.keys(stats);
    if (!ids.length) return [];

    const { data: profiles } = await supabase.from('profiles')
      .select('id, username, display_name, avatar_url').in('id', ids);

    const pMap: Record<string, any> = {};
    (profiles || []).forEach(p => { pMap[p.id] = p; });

    return Object.entries(stats)
      .filter(([, val]) => val > 0)
      .sort(([, a], [, b]) => b - a).slice(0, 50)
      .map(([id, val]) => ({
        id, name: pMap[id]?.display_name || pMap[id]?.username || 'User',
        avatar_url: pMap[id]?.avatar_url || null, stat_value: val, stat_label: label,
      }));
  };

  if (!isOpen) return null;

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-gray-300" />;
    if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
    return <span className="text-white/50 text-xs font-bold">#{rank}</span>;
  };

  const periods: { id: PeriodType; label: string; icon: React.ReactNode }[] = [
    { id: 'daily', label: 'Today', icon: <Calendar className="w-3 h-3" /> },
    { id: 'weekly', label: '7 Days', icon: <CalendarDays className="w-3 h-3" /> },
    { id: 'monthly', label: 'Month', icon: <CalendarRange className="w-3 h-3" /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className={cn(
          "w-full bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 rounded-2xl border border-purple-500/30 overflow-hidden shadow-2xl",
          isLandscape ? "max-w-xl max-h-[95dvh]" : "max-w-sm"
        )}
      >

        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: -6, scale: 1.05 }}
              className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
              style={{
                background: 'radial-gradient(120% 120% at 30% 20%, #fde68a 0%, #f59e0b 45%, #b45309 100%)',
                boxShadow: '0 8px 18px -6px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.3)'
              }}
            >
              <Trophy className="w-4 h-4 text-white relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
              <div className="absolute inset-x-1.5 top-1 h-1.5 rounded-full bg-white/40 blur-[2px]" />
            </motion.div>
            <h2 className="text-white font-extrabold text-sm tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Leaderboard</h2>
          </div>
          <motion.button
            whileHover={{ scale: 1.08, rotate: 90 }}
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center border border-white/10"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 p-2 bg-black/20">
          {CATEGORIES.map(cat => {
            const active = category === cat.id;
            return (
              <motion.button
                key={cat.id}
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all relative overflow-hidden",
                  active ? "text-white" : "text-white/55 hover:text-white/80 bg-white/[0.04] border border-white/5"
                )}
                style={active ? {
                } : undefined}
              >
                {active && <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
                <span className="relative">{cat.icon}</span>
                <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{cat.label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Period Tabs */}
        <div className="flex gap-1 px-2 pb-2">
          {periods.map(tab => {
            const active = period === tab.id;
            return (
              <motion.button
                key={tab.id}
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setPeriod(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all relative overflow-hidden",
                  active ? "text-white" : "text-white/40 hover:text-white/65 bg-white/[0.04] border border-white/5"
                )}
                style={active ? {
                } : undefined}
              >
                {active && <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
                <span className="relative">{tab.icon}</span>
                <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>


        {/* Summary */}
        {!loading && leaderboard.length > 0 && (
          <div className="grid grid-cols-2 gap-2 px-3 py-1.5 bg-black/10">
            <div className="text-center">
              <div className="text-amber-400 text-sm font-bold">{leaderboard.length}</div>
              <div className="text-white/40 text-[9px]">Players</div>
            </div>
            <div className="text-center">
              <div className="text-green-400 text-sm font-bold">
                {leaderboard.reduce((s, e) => s + e.stat_value, 0).toLocaleString()}
              </div>
              <div className="text-white/40 text-[9px]">Total {leaderboard[0]?.stat_label || ''}</div>
            </div>
          </div>
        )}

        <ScrollArea 
          className="relative"
          style={{ 
            height: isVerySmallHeight ? '150px' : isLandscape ? '220px' : '42vh',
            minHeight: '120px'
          }}
        >

          <div className="p-2 space-y-1">
            {loading ? (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <Skeleton className="w-6 h-6 rounded-full" />
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2.5 w-1/3" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-white/20 mx-auto mb-2" />
                <p className="text-white/50 text-sm">No data yet</p>
              </div>
            ) : (
              leaderboard.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    i === 0 ? "bg-gradient-to-r from-yellow-500/25 to-amber-500/10 border border-yellow-500/30"
                      : i < 3 ? "bg-gradient-to-r from-amber-500/15 to-transparent border border-amber-500/20"
                        : "bg-white/5"
                  )}
                >
                  <div className="w-6 h-6 flex items-center justify-center">{getRankBadge(i + 1)}</div>
                  <Avatar className="w-8 h-8 border-2 border-white/10">
                    <AvatarImage src={entry.avatar_url || undefined} />
                    <AvatarFallback className="bg-purple-500/20 text-purple-300 text-xs">
                      {entry.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium truncate">{entry.name}</div>
                    {entry.extra_info && <div className="text-white/30 text-[9px]">{entry.extra_info}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-amber-400 text-xs font-bold">
                      {entry.stat_value.toLocaleString()}
                    </div>
                    <div className="text-white/30 text-[9px]">{entry.stat_label}</div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* My Rank */}
        {myRank.data && (
          <div className="p-2 border-t border-white/10 bg-purple-500/10">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <span className="text-purple-300 text-xs font-bold w-6 text-center">#{myRank.rank}</span>
              <Avatar className="w-8 h-8 border-2 border-purple-500/30">
                <AvatarImage src={myRank.data.avatar_url || undefined} />
                <AvatarFallback className="bg-purple-500/20 text-purple-300 text-xs">
                  {myRank.data.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="text-purple-300 text-xs font-medium">You</div>
              </div>
              <div className="text-amber-400 text-xs font-bold">
                {myRank.data.stat_value.toLocaleString()} {myRank.data.stat_label}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

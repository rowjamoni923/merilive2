import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, History, Coins, Trophy, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface BetHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  gameId?: string;
}

interface TransactionRecord {
  id: string;
  game_id: string | null;
  game_type: string | null;
  transaction_type: string;
  amount: number;
  balance_before: number | null;
  balance_after: number | null;
  bet_amount: number | null;
  win_amount: number | null;
  is_win: boolean | null;
  result_data: any | null;
  created_at: string;
}

// Format game names for display
const formatGameName = (gameId: string): string => {
  const gameNames: Record<string, string> = {
    'teen_patti': 'Teen Patti',
    'teen-patti': 'Teen Patti',
    'ferris_wheel': 'Ferris Wheel',
    'ferris-wheel': 'Ferris Wheel',
    'roulette': 'Roulette',
    'dragon_tiger': 'Dragon Tiger',
    'lucky_28': 'Lucky 28',
    'andar_bahar': 'Andar Bahar',
    'crash': 'Crash',
    'ludo': 'Ludo'
  };
  return gameNames[gameId] || gameId.replace(/_/g, ' ').replace(/-/g, ' ');
};

export function BetHistoryPanel({ isOpen, onClose, gameId }: BetHistoryPanelProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalBets: 0, totalWon: 0, totalLost: 0, winRate: 0 });

  useEffect(() => {
    if (isOpen) {
      fetchTransactionHistory();
    }
  }, [isOpen]);

  const fetchTransactionHistory = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[BetHistory] No user found');
        setLoading(false);
        return;
      }

      console.log('[BetHistory] Fetching transactions for user:', user.id);

      // Fetch from game_transactions which has accurate win/loss data
      const { data, error } = await supabase
        .from('game_transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('transaction_type', ['bet', 'win', 'jackpot'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[BetHistory] Query error:', error);
        throw error;
      }

      console.log('[BetHistory] Fetched transactions:', data?.length || 0);
      setTransactions(data || []);

      // Calculate stats from transactions
      const wins = data?.filter(t => t.transaction_type === 'win' || t.transaction_type === 'jackpot') || [];
      const bets = data?.filter(t => t.transaction_type === 'bet') || [];
      
      // If no bet records exist, use win count as proxy for total games played
      // (Each win represents a bet that was placed)
      const totalGamesPlayed = bets.length > 0 ? bets.length : wins.length;
      const totalWon = wins.reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalLost = bets.reduce((sum, t) => sum + (t.amount || 0), 0);
      
      // Win rate: if no bet records, show wins / total transactions
      const winRate = totalGamesPlayed > 0 ? (wins.length / totalGamesPlayed) * 100 : 0;

      setStats({ totalBets: totalGamesPlayed, totalWon, totalLost, winRate });
    } catch (error) {
      console.error('Error fetching transaction history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 rounded-2xl border border-purple-500/30 overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <History className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-white font-bold">Bet History</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10 w-8 h-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-black/20">
          <div className="text-center p-2 rounded-lg bg-white/5">
            <div className="text-white/50 text-[9px]">Total Bets</div>
            <div className="text-white font-bold text-sm">{stats.totalBets}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-green-500/10">
            <div className="text-green-400/70 text-[9px]">Won</div>
            <div className="text-green-400 font-bold text-sm">{stats.totalWon.toLocaleString()}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-500/10">
            <div className="text-red-400/70 text-[9px]">Lost</div>
            <div className="text-red-400 font-bold text-sm">{stats.totalLost.toLocaleString()}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-amber-500/10">
            <div className="text-amber-400/70 text-[9px]">Win Rate</div>
            <div className="text-amber-400 font-bold text-sm">{stats.winRate.toFixed(0)}%</div>
          </div>
        </div>

        <ScrollArea className="h-[40vh] overflow-y-auto">
          <div className="p-2 space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-white/50 text-sm">
                No transactions yet. Start playing!
              </div>
            ) : (
              transactions.map((tx) => {
                const isWin = tx.transaction_type === 'win' || tx.transaction_type === 'jackpot';
                const before = tx.balance_before;
                const after = tx.balance_after;
                const delta = (typeof before === 'number' && typeof after === 'number')
                  ? after - before
                  : (isWin ? (tx.amount || 0) : -(tx.amount || 0));
                const multiplier = tx.result_data?.multiplier ?? null;
                const txShort = tx.id.slice(0, 8);

                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-2.5 rounded-lg ${
                      isWin
                        ? 'bg-green-500/10 border border-green-500/20'
                        : 'bg-red-500/10 border border-red-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isWin ? 'bg-green-500/20' : 'bg-red-500/20'
                        }`}>
                          {isWin ? (
                            <TrendingUp className="w-4 h-4 text-green-400" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                        <div>
                          <div className="text-white text-xs font-medium">
                            {formatGameName(tx.game_type || tx.game_id || 'game')}
                            <span className="ml-1.5 text-white/30 text-[9px] font-mono">#{txShort}</span>
                          </div>
                          <div className="text-white/50 text-[9px]">
                            {format(new Date(tx.created_at), 'MMM d, HH:mm:ss')}
                            {multiplier ? <span className="ml-1.5 text-amber-400/70">×{multiplier}</span> : null}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Coins className="w-3 h-3 text-amber-400" />
                          <span className={`text-xs font-bold ${
                            delta >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-white/40 text-[9px] uppercase tracking-wide">
                          {tx.transaction_type}
                        </div>
                      </div>
                    </div>

                    {/* Audit chain: balance_before → balance_after */}
                    {(typeof before === 'number' && typeof after === 'number') && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                        <span className="text-white/40">Balance:</span>
                        <span className="text-white/70">
                          {before.toLocaleString()}
                          <span className="mx-1 text-white/30">→</span>
                          <span className={delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {after.toLocaleString()}
                          </span>
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </motion.div>
  );
}

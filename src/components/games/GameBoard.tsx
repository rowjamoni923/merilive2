import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Coins, 
  Trophy, 
  Loader2, 
  TrendingUp, 
  ChevronDown,
  X,
  Gift
} from "lucide-react";

// Games are now in live-games folder - this component redirects to LiveGameBoard

interface GameSetting {
  id: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  description: string;
  min_bet: number;
  max_bet: number;
  win_probability: number;
  max_multiplier: number;
  is_active: boolean;
  is_featured: boolean;
  rules: any;
  preset_bets?: number[];
}

interface GameBoardProps {
  selectedGame?: string | null;
  roomId?: string;
  isHost?: boolean;
  onClose?: () => void;
  onOpenGifts?: () => void;
}

// Default preset bets
const DEFAULT_PRESET_BETS = [5000, 10000, 20000, 50000, 100000, 200000];

// Format number for display
const formatBetAmount = (amount: number): string => {
  if (amount >= 100000) {
    return `${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toString();
};

export function GameBoard({ selectedGame, roomId, isHost = false, onClose, onOpenGifts }: GameBoardProps) {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [activeGame, setActiveGame] = useState<string | null>(selectedGame || null);
  const [loading, setLoading] = useState(true);
  const [userCoins, setUserCoins] = useState(0);
  const [betAmount, setBetAmount] = useState(5000);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showGameSelector, setShowGameSelector] = useState(!selectedGame);

  useEffect(() => {
    fetchGames();
    fetchUserCoins();
  }, []);

  const fetchGames = async () => {
    try {
      const { data, error } = await supabase
        .from('game_settings')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      
      const gamesWithPresets = (data || []).map(game => ({
        ...game,
        preset_bets: game.preset_bets ? 
          (typeof game.preset_bets === 'string' ? JSON.parse(game.preset_bets) : game.preset_bets) 
          : DEFAULT_PRESET_BETS
      }));
      
      setGames(gamesWithPresets);
      if (gamesWithPresets.length > 0 && !activeGame) {
        setActiveGame(gamesWithPresets[0].game_id);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserCoins = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', user.id)
        .single();
      if (data) setUserCoins(data.coins);
    }
  };

  const playGame = async (betType?: string, betValue?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    if (betAmount > userCoins) return null;

    setIsPlaying(true);
    
    try {
      const { data, error } = await supabase.rpc('process_game_bet', {
        p_user_id: user.id,
        p_game_id: activeGame,
        p_bet_amount: betAmount,
        p_bet_type: betType || null,
        p_bet_value: betValue || null
      });

      if (error) throw error;

      const result = data as any;
      
      if (!result.success) return null;

      setLastResult(result);
      setUserCoins(result.new_balance);

      return result;
    } catch (error: any) {
      console.error('Game error:', error);
      return null;
    } finally {
      setIsPlaying(false);
    }
  };

  const currentGame = games.find(g => g.game_id === activeGame);
  const presetBets = currentGame?.preset_bets || DEFAULT_PRESET_BETS;

  const renderGameComponent = () => {
    if (!activeGame || !currentGame) return null;

    const gameProps = {
      game: currentGame,
      betAmount,
      setBetAmount,
      userCoins,
      isPlaying,
      onPlay: playGame,
      lastResult
    };

    // All games now use LiveGameBoard component - this is a fallback
    return (
      <div className="flex flex-col items-center justify-center h-24 text-white/60">
        <span className="text-2xl mb-1">{currentGame.game_emoji}</span>
        <p className="text-xs font-bold">{currentGame.game_name}</p>
        <p className="text-[10px]">Use Live Game Board</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/95 via-purple-900/90 to-slate-900/95 backdrop-blur-xl rounded-xl border border-purple-500/30 overflow-hidden">
      {/* Compact Header with Gift Button */}
      <div className="flex items-center justify-between p-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          {currentGame && (
            <div className={cn(
              "w-6 h-6 rounded-lg flex items-center justify-center text-sm",
              `bg-gradient-to-br ${currentGame.game_color}`
            )}>
              {currentGame.game_emoji}
            </div>
          )}
          <h3 className="text-white font-bold text-xs">
            {currentGame?.game_name || 'Game'}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {/* Gift Button */}
          {onOpenGifts && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenGifts}
              className="h-6 px-2 bg-gradient-to-r from-pink-500/30 to-red-500/30 border border-pink-500/30 text-pink-300 hover:text-pink-200 hover:bg-pink-500/40 rounded-lg"
            >
              <Gift className="w-3 h-3 mr-1" />
              <span className="text-[9px]">Gift</span>
            </Button>
          )}

          {/* Coins Display */}
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 rounded-full">
            <Coins className="w-3 h-3 text-amber-400" />
            <span className="text-amber-300 font-bold text-[10px]">
              {userCoins.toLocaleString()}
            </span>
          </div>

          {/* Game Selector */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGameSelector(!showGameSelector)}
            className="h-6 w-6 p-0 text-white/70 hover:text-white hover:bg-white/10"
          >
            <ChevronDown className={cn(
              "w-3.5 h-3.5 transition-transform",
              showGameSelector && "rotate-180"
            )} />
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 text-white/70 hover:text-white hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Compact Game Selector */}
      <AnimatePresence>
        {showGameSelector && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden"
          >
            <div className="p-1.5 flex flex-wrap gap-1">
              {games.map((game) => (
                <motion.button
                  key={game.game_id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setActiveGame(game.game_id);
                    setShowGameSelector(false);
                    setLastResult(null);
                  }}
                  className={cn(
                    "p-1 rounded-lg transition-all flex items-center gap-1",
                    activeGame === game.game_id
                      ? `bg-gradient-to-br ${game.game_color} ring-1 ring-white/50`
                      : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  <span className="text-base">{game.game_emoji}</span>
                  <span className="text-white text-[9px] font-medium">
                    {game.game_name}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset Bet Amounts */}
      <div className="p-1.5 border-b border-white/10">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <span className="text-white/40 text-[9px] mr-0.5">Bet:</span>
          {presetBets.map((amount) => (
            <motion.button
              key={amount}
              whileTap={{ scale: 0.95 }}
              onClick={() => setBetAmount(amount)}
              disabled={amount > userCoins}
              className={cn(
                "px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap",
                betAmount === amount
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                  : amount > userCoins
                    ? "bg-white/5 text-white/30 cursor-not-allowed"
                    : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
            >
              {formatBetAmount(amount)}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Compact Game Area */}
      <div className="p-2">
        {renderGameComponent()}
      </div>

      {/* Compact Last Result */}
      <AnimatePresence>
        {lastResult && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className={cn(
              "mx-2 mb-2 p-1.5 rounded-lg flex items-center justify-between",
              lastResult.is_winner
                ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30"
                : "bg-gradient-to-r from-red-500/20 to-rose-500/20 border border-red-500/30"
            )}
          >
            <div className="flex items-center gap-1">
              {lastResult.is_winner ? (
                <>
                  <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-green-400 font-bold text-[10px]">Won!</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-3.5 h-3.5 text-red-400 rotate-180" />
                  <span className="text-red-400 font-bold text-[10px]">Lost</span>
                </>
              )}
            </div>
            <div className="text-right">
              {lastResult.is_winner ? (
                <div className="flex items-center gap-1 text-green-400 font-bold text-[10px]">
                  <span>+{lastResult.win_amount.toLocaleString()}</span>
                  <Coins className="w-3 h-3" />
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-400 font-bold text-[10px]">
                  <span>-{lastResult.bet_amount.toLocaleString()}</span>
                  <Coins className="w-3 h-3" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { GameBoard as default };

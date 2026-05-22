import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getBalanceWithFetch, updateCachedBalance } from "@/hooks/useUserBalance";
import { useGameToken } from "@/hooks/useGameToken";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Coins, 
  Trophy, 
  Loader2, 
  Users,
  Clock,
  ChevronUp,
  ChevronDown,
  X,
  Sparkles,
  Gift,
  Settings,
  Volume2,
  VolumeX,
  Gamepad2,
  TrendingUp,
  TrendingDown,
  Zap,
  Star
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LiveLuckyNumberGame as LuckyNumberGame } from "./live-games/LiveLuckyNumberGame";
import { LiveRocketRaceGame as RocketRaceGame } from "./live-games/LiveRocketRaceGame";

interface GameSetting {
  id: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  description: string | null;
  min_bet: number | null;
  max_bet: number | null;
  win_probability: number | null;
  max_multiplier: number | null;
  is_active: boolean | null;
  rules: any;
  preset_bets?: any;
  game_type?: string;
  game_url?: string;
  logo_url?: string;
  [key: string]: any;
}

interface GameFooterNewProps {
  selectedGame?: string | null;
  roomId?: string;
  onClose?: () => void;
  onOpenGifts?: () => void;
}

const DEFAULT_PRESET_BETS = [500, 1000, 5000, 10000, 20000];

const formatBet = (amount: number): string => {
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
};

// Floating Coin Animation Component
const FloatingCoin = ({ startPos, endPos, onComplete }: {
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  onComplete: () => void;
}) => {
  return (
    <motion.div
      initial={{ x: startPos.x, y: startPos.y, scale: 1, opacity: 1 }}
      animate={{ x: endPos.x, y: endPos.y, scale: 0.3, opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      onAnimationComplete={onComplete}
      className="fixed z-[100] pointer-events-none"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/50">
        <Coins className="w-5 h-5 text-amber-800" />
      </div>
    </motion.div>
  );
};

// Win Celebration Component - 1 second vanish
const WinCelebration = ({ show, amount, onComplete }: { show: boolean; amount: number; onComplete: () => void }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onComplete, 1000); // Fast 1 second vanish
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
    >
      <div className="relative">
        {/* Sparkles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, rotate: 0 }}
            animate={{ 
              scale: [0, 1.5, 0], 
              rotate: 360,
              x: Math.cos(i * 30 * Math.PI / 180) * 100,
              y: Math.sin(i * 30 * Math.PI / 180) * 100
            }}
            transition={{ duration: 1.5, delay: i * 0.05 }}
            className="absolute top-1/2 left-1/2"
          >
            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
          </motion.div>
        ))}
        
        {/* Main Win Display */}
        <motion.div
          initial={{ y: 50 }}
          animate={{ y: [50, 0, -10, 0] }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl px-8 py-6 shadow-2xl shadow-green-500/50"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, repeat: 3 }}
            className="text-center"
          >
            <Trophy className="w-12 h-12 text-yellow-300 mx-auto mb-2" />
            <p className="text-white text-xl font-bold">YOU WON!</p>
            <motion.p
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ delay: 0.3 }}
              className="text-yellow-300 text-3xl font-black mt-2"
            >
              +{amount.toLocaleString()} 🪙
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Loss Display Component - 1 second vanish
const LossDisplay = ({ show, amount, onComplete }: { show: boolean; amount: number; onComplete: () => void }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onComplete, 1000); // Fast 1 second vanish
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-[100] pointer-events-none"
    >
      <div className="bg-gradient-to-br from-red-500/90 to-red-700/90 backdrop-blur-sm rounded-xl px-6 py-3 shadow-lg">
        <p className="text-white text-lg font-bold flex items-center gap-2">
          <TrendingDown className="w-5 h-5" />
          -{amount.toLocaleString()} 🪙
        </p>
      </div>
    </motion.div>
  );
};

// Dragon Tiger Game Component
const DragonTigerGame = ({
  betAmount,
  userCoins,
  phase,
  timeLeft,
  onPlaceBet,
  onWin,
  onLoss
}: any) => {
  const [selectedBet, setSelectedBet] = useState<'dragon' | 'tiger' | 'tie' | null>(null);
  const [dragonCard, setDragonCard] = useState<string | null>(null);
  const [tigerCard, setTigerCard] = useState<string | null>(null);
  const [winner, setWinner] = useState<'dragon' | 'tiger' | 'tie' | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [betPlaced, setBetPlaced] = useState(false);

  const CARDS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const CARD_SUITS = ['♠️', '♥️', '♦️', '♣️'];

  useEffect(() => {
    if (phase === 'betting') {
      setDragonCard(null);
      setTigerCard(null);
      setWinner(null);
      setSelectedBet(null);
      setIsRevealing(false);
      setBetPlaced(false);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'playing' && betPlaced && !isRevealing) {
      revealCards();
    }
  }, [phase, betPlaced]);

  const getCardValue = (card: string): number => CARDS.indexOf(card);

  const revealCards = async () => {
    setIsRevealing(true);
    
    // Dramatic card reveal
    await new Promise(resolve => setTimeout(resolve, 500));
    const dCard = CARDS[Math.floor(Math.random() * CARDS.length)];
    setDragonCard(dCard);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    const tCard = CARDS[Math.floor(Math.random() * CARDS.length)];
    setTigerCard(tCard);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const dragonValue = getCardValue(dCard);
    const tigerValue = getCardValue(tCard);
    let result: 'dragon' | 'tiger' | 'tie';
    
    if (dragonValue > tigerValue) result = 'dragon';
    else if (tigerValue > dragonValue) result = 'tiger';
    else result = 'tie';
    
    setWinner(result);
    
    // Check win/loss
    if (result === selectedBet) {
      const multiplier = selectedBet === 'tie' ? 8 : 2;
      onWin(betAmount * multiplier);
    } else if (selectedBet) {
      onLoss(betAmount);
    }
  };

  const handlePlaceBet = async (type: 'dragon' | 'tiger' | 'tie') => {
    if (phase !== 'betting' || betAmount > userCoins || betPlaced) return;
    
    setSelectedBet(type);
    setBetPlaced(true);
    
    const result = await onPlaceBet('dragon_tiger', type);
    if (!result?.success) {
      setBetPlaced(false);
      setSelectedBet(null);
    }
  };

  return (
    <div className="p-2">
      {/* Compact Cards Display */}
      <div className="flex items-center justify-center gap-3 mb-2">
        {/* Dragon Card */}
        <div className="text-center">
          <p className="text-red-400 font-bold text-[10px] mb-1">🐉 DRAGON</p>
          <motion.div
            animate={dragonCard ? { rotateY: [180, 0] } : {}}
            className={cn(
              "w-10 h-14 rounded-lg flex items-center justify-center text-lg font-black shadow-md",
              dragonCard ? "bg-white text-black" : "bg-gradient-to-br from-red-600 to-red-800",
              winner === 'dragon' && "ring-2 ring-green-400"
            )}
          >
            {dragonCard || "?"}
          </motion.div>
        </div>

        {/* VS */}
        <motion.div
          animate={phase === 'playing' ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5, repeat: phase === 'playing' ? Infinity : 0 }}
          className="text-sm font-black text-purple-400"
        >
          VS
        </motion.div>

        {/* Tiger Card */}
        <div className="text-center">
          <p className="text-orange-400 font-bold text-[10px] mb-1">🐅 TIGER</p>
          <motion.div
            animate={tigerCard ? { rotateY: [180, 0] } : {}}
            className={cn(
              "w-10 h-14 rounded-lg flex items-center justify-center text-lg font-black shadow-md",
              tigerCard ? "bg-white text-black" : "bg-gradient-to-br from-orange-500 to-orange-700",
              winner === 'tiger' && "ring-2 ring-green-400"
            )}
          >
            {tigerCard || "?"}
          </motion.div>
        </div>
      </div>

      {/* Winner Announcement */}
      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className={cn(
              "text-center py-1 rounded-md mb-2 text-xs font-bold",
              winner === selectedBet ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            )}
          >
            {winner === selectedBet ? `🎉 ${winner.toUpperCase()} WINS!` : `${winner.toUpperCase()} wins`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Betting Buttons */}
      {phase === 'betting' && !betPlaced && (
        <div className="flex gap-1">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePlaceBet('dragon')}
            disabled={betAmount > userCoins}
            className={cn(
              "flex-1 py-1.5 rounded-lg font-bold text-white text-xs",
              betAmount > userCoins ? "bg-gray-600/50" : "bg-gradient-to-br from-red-500 to-red-700"
            )}
          >
            🐉 2x
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePlaceBet('tie')}
            disabled={betAmount > userCoins}
            className={cn(
              "px-3 py-1.5 rounded-lg font-bold text-white text-xs",
              betAmount > userCoins ? "bg-gray-600/50" : "bg-gradient-to-br from-purple-500 to-purple-700"
            )}
          >
            TIE 8x
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePlaceBet('tiger')}
            disabled={betAmount > userCoins}
            className={cn(
              "flex-1 py-1.5 rounded-lg font-bold text-white text-xs",
              betAmount > userCoins ? "bg-gray-600/50" : "bg-gradient-to-br from-orange-500 to-orange-700"
            )}
          >
            🐅 2x
          </motion.button>
        </div>
      )}

      {/* Bet Placed Indicator */}
      {betPlaced && phase === 'betting' && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center py-1 bg-green-500/15 rounded-md">
          <p className="text-green-400 font-bold text-[10px] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            {selectedBet?.toUpperCase()} - {formatBet(betAmount)} 🪙
          </p>
        </motion.div>
      )}

      {/* Playing Indicator */}
      {phase === 'playing' && (
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }} className="text-center py-1 bg-purple-500/15 rounded-md">
          <p className="text-purple-400 font-bold text-[10px] flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" /> Revealing...
          </p>
        </motion.div>
      )}
    </div>
  );
};

// Crash/Aviator Game Component - Fixed stable version
const CrashGame = ({ betAmount, userCoins, phase, onPlaceBet, onWin, onLoss }: any) => {
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashed, setCrashed] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [hasBet, setHasBet] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const crashedRef = useRef(false);
  const cashedOutRef = useRef(false);

  // Reset refs when state changes
  useEffect(() => {
    crashedRef.current = crashed;
  }, [crashed]);

  useEffect(() => {
    cashedOutRef.current = cashedOut;
  }, [cashedOut]);

  // Reset game on betting phase
  useEffect(() => {
    if (phase === 'betting') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setMultiplier(1.00);
      setCrashed(false);
      setCashedOut(false);
      setHasBet(false);
      setWinAmount(0);
      setIsPlaying(false);
      crashedRef.current = false;
      cashedOutRef.current = false;
    }
  }, [phase]);

  // Start game when playing phase begins
  useEffect(() => {
    if (phase === 'playing' && hasBet && !isPlaying) {
      setIsPlaying(true);
      
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      let currentMultiplier = 1.00;
      const crashPoint = 1 + Math.random() * 5; // Random crash between 1x and 6x

      intervalRef.current = setInterval(() => {
        if (crashedRef.current || cashedOutRef.current) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }

        currentMultiplier += 0.05 + Math.random() * 0.08;
        currentMultiplier = parseFloat(currentMultiplier.toFixed(2));
        setMultiplier(currentMultiplier);

        if (currentMultiplier >= crashPoint) {
          setCrashed(true);
          crashedRef.current = true;
          if (!cashedOutRef.current) {
            onLoss(betAmount);
          }
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 100);
    }

    return () => {
      if (intervalRef.current && phase !== 'playing') {
        clearInterval(intervalRef.current);
      }
    };
  }, [phase, hasBet, isPlaying, betAmount, onLoss]);

  const handlePlaceBet = async () => {
    if (phase !== 'betting' || hasBet || betAmount > userCoins) return;
    
    const result = await onPlaceBet('crash', 'bet');
    if (result?.success) {
      setHasBet(true);
      toast.success(`🚀 Bet placed: ${formatBet(betAmount)}`);
    }
  };

  const handleCashOut = () => {
    if (crashedRef.current || cashedOutRef.current || !hasBet) return;
    
    const win = Math.floor(betAmount * multiplier);
    setWinAmount(win);
    setCashedOut(true);
    cashedOutRef.current = true;
    onWin(win);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <div className="p-4 text-center">
      {/* Rocket & Multiplier */}
      <div className="flex flex-col items-center justify-center mb-4">
        <motion.div
          animate={!crashed && phase === 'playing' && hasBet ? { 
            y: [-5, 5, -5],
            rotate: [-2, 2, -2]
          } : {}}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="text-3xl mb-1"
        >
          {crashed ? "💥" : "🚀"}
        </motion.div>
        
        <motion.div
          animate={!crashed && phase === 'playing' ? { scale: [1, 1.03, 1] } : {}}
          transition={{ duration: 0.3, repeat: Infinity }}
          className={cn(
            "text-2xl font-black",
            crashed ? "text-red-500" : cashedOut ? "text-green-400" : "text-amber-400"
          )}
        >
          {crashed ? "CRASHED!" : `${multiplier.toFixed(2)}x`}
        </motion.div>
        
        {cashedOut && (
          <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-400 font-bold text-sm mt-1">
            +{winAmount.toLocaleString()} 🪙
          </motion.p>
        )}
      </div>

      {/* Compact Action Buttons */}
      {phase === 'betting' && !hasBet && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handlePlaceBet}
          disabled={betAmount > userCoins}
          className={cn(
            "w-full py-2 rounded-lg font-bold text-white text-sm",
            betAmount > userCoins ? "bg-gray-600/50" : "bg-gradient-to-r from-green-500 to-emerald-600"
          )}
        >
          🚀 Place Bet ({formatBet(betAmount)})
        </motion.button>
      )}

      {hasBet && phase === 'betting' && (
        <div className="py-1.5 bg-green-500/15 rounded-lg text-center">
          <p className="text-green-400 font-bold text-xs">✓ Waiting for takeoff...</p>
        </div>
      )}

      {phase === 'playing' && hasBet && !crashed && !cashedOut && (
        <motion.button
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 0.4, repeat: Infinity }}
          onClick={handleCashOut}
          className="w-full py-2 rounded-lg font-bold text-white text-sm bg-gradient-to-r from-amber-500 to-orange-600"
        >
          💰 Cash Out {(betAmount * multiplier).toFixed(0)}
        </motion.button>
      )}

      {crashed && hasBet && !cashedOut && (
        <div className="py-1.5 bg-red-500/15 rounded-lg text-center">
          <p className="text-red-400 font-bold text-xs">💥 Crashed! -{formatBet(betAmount)}</p>
        </div>
      )}
    </div>
  );
};

// Compact Generic Game Component
const GenericGame = ({ betAmount, userCoins, phase, onPlaceBet, onWin, onLoss, gameId, gameName, gameEmoji }: any) => {
  const [hasBet, setHasBet] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [multiplier, setMultiplier] = useState(2);

  useEffect(() => {
    if (phase === 'betting') {
      setHasBet(false);
      setResult(null);
      setMultiplier(1 + Math.random() * 4);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'playing' && hasBet && !result) {
      const timer = setTimeout(() => {
        const isWin = Math.random() > 0.5;
        setResult(isWin ? 'win' : 'lose');
        if (isWin) {
          onWin(Math.floor(betAmount * multiplier));
        } else {
          onLoss(betAmount);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, hasBet, result, betAmount, multiplier, onWin, onLoss]);

  const handlePlaceBet = async () => {
    if (phase !== 'betting' || hasBet || betAmount > userCoins) return;
    const res = await onPlaceBet(gameId, 'bet');
    if (res?.success) {
      setHasBet(true);
      toast.success(`${gameEmoji} Bet: ${formatBet(betAmount)}`);
    }
  };

  return (
    <div className="p-2 text-center">
      <motion.div
        animate={phase === 'playing' && hasBet ? { scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] } : {}}
        transition={{ duration: 0.5, repeat: phase === 'playing' ? Infinity : 0 }}
        className="text-3xl mb-1"
      >
        {gameEmoji}
      </motion.div>
      
      <h3 className="text-white font-bold text-sm mb-1">{gameName}</h3>
      
      <div className={cn(
        "text-xl font-black mb-2",
        result === 'win' ? "text-green-400" : result === 'lose' ? "text-red-400" : "text-amber-400"
      )}>
        {result === 'win' ? `🎉 +${formatBet(Math.floor(betAmount * multiplier))}` : 
         result === 'lose' ? `💔 -${formatBet(betAmount)}` : 
         `${multiplier.toFixed(2)}x`}
      </div>

      {phase === 'betting' && !hasBet && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handlePlaceBet}
          disabled={betAmount > userCoins}
          className={cn(
            "w-full py-2 rounded-lg font-bold text-white text-sm",
            betAmount > userCoins ? "bg-gray-600/50" : "bg-gradient-to-r from-green-500 to-emerald-600"
          )}
        >
          🎲 Bet ({formatBet(betAmount)})
        </motion.button>
      )}

      {hasBet && phase === 'betting' && (
        <div className="py-1 bg-green-500/15 rounded-lg">
          <p className="text-green-400 font-bold text-xs">✓ Waiting...</p>
        </div>
      )}

      {phase === 'playing' && hasBet && !result && (
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }} className="py-1 bg-purple-500/15 rounded-lg">
          <p className="text-purple-400 font-bold text-xs flex items-center justify-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Playing...
          </p>
        </motion.div>
      )}
    </div>
  );
};

// Main Game Footer Component
export function GameFooterNew({ selectedGame, roomId, onClose, onOpenGifts }: GameFooterNewProps) {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [activeGame, setActiveGame] = useState<string>(selectedGame || 'dragon_tiger');
  const [loading, setLoading] = useState(true);
  const { buildGameUrl } = useGameToken();
  const [externalGameUrl, setExternalGameUrl] = useState<string | null>(null);
  const [userCoins, setUserCoins] = useState(0);
  const [betAmount, setBetAmount] = useState(5000);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  
  // Game state
  const [phase, setPhase] = useState<'betting' | 'playing' | 'result'>('betting');
  const [timeLeft, setTimeLeft] = useState(15);
  const [roundNumber, setRoundNumber] = useState(1);
  
  // Win/Loss state
  const [showWin, setShowWin] = useState(false);
  const [showLoss, setShowLoss] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [lossAmount, setLossAmount] = useState(0);
  
  // Flying coins state
  const [flyingCoins, setFlyingCoins] = useState<{ id: string; startPos: { x: number; y: number }; endPos: { x: number; y: number } }[]>([]);
  
  const coinDisplayRef = useRef<HTMLDivElement>(null);

  // Fetch games
  useEffect(() => {
    fetchGames();
    fetchUserCoins();
    
    const refreshFromCache = () => {
      getBalanceWithFetch().then((coins) => setUserCoins(coins)).catch(() => {});
    };
    const onOwnBeansUpdated = () => refreshFromCache();
    window.addEventListener('own-beans-updated', onOwnBeansUpdated);
    return () => window.removeEventListener('own-beans-updated', onOwnBeansUpdated);
  }, []);

  // Game loop
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (phase === 'betting') {
            setPhase('playing');
            return 3; // 3 seconds for playing
          } else if (phase === 'playing') {
            setPhase('result');
            return 3; // 3 seconds for result
          } else {
            // Reset for new round
            setPhase('betting');
            setRoundNumber(r => r + 1);
            return 15; // 15 seconds for betting
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  const fetchGames = async () => {
    try {
      const { data } = await supabase
        .from('game_settings')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      const parsed = (data || []).map((g: any) => ({
        ...g,
        preset_bets: g.preset_bets
          ? (typeof g.preset_bets === 'string' ? JSON.parse(g.preset_bets) : g.preset_bets)
          : DEFAULT_PRESET_BETS
      }));
      setGames(parsed);
    } finally {
      setLoading(false);
    }
  };


  const fetchUserCoins = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('coins').eq('id', user.id).single();
      if (data) setUserCoins(data.coins);
    }
  };

  const handlePlaceBet = async (betType?: string, betValue?: string) => {
    if (phase !== 'betting') {
      return { success: false, error: 'Betting is closed' };
    }
    if (betAmount > userCoins) {
      toast.error('Not enough diamonds!');
      return { success: false, error: 'Not enough diamonds' };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Please login');
      return { success: false, error: 'Not logged in' };
    }

    // Deduct coins immediately
    const { data: profile } = await supabase
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (!profile || profile.coins < betAmount) {
      toast.error('Not enough diamonds!');
      return { success: false, error: 'Not enough diamonds' };
    }

    const { data: deductData, error } = await supabase.rpc('deduct_coins', {
      p_user_id: user.id,
      p_amount: betAmount,
    });
    const deductResult = deductData as any;

    if (error || !deductResult?.success) {
      toast.error(deductResult?.error || 'Failed to place bet');
      return { success: false, error: deductResult?.error || error?.message };
    }

    // Animate coin flying away
    if (coinDisplayRef.current) {
      const rect = coinDisplayRef.current.getBoundingClientRect();
      const coinId = Date.now().toString();
      setFlyingCoins(prev => [...prev, {
        id: coinId,
        startPos: { x: rect.left, y: rect.top },
        endPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      }]);
    }

    setUserCoins(deductResult.new_balance);
    updateCachedBalance(deductResult.new_balance);
    toast.success(`Bet placed: ${formatBet(betAmount)} 🪙`);
    return { success: true };
  };

  const handleWin = async (amount: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Credit winnings using process_game_win (allows self-crediting, unlike add_coins which requires admin)
    const { data: winData, error: winError } = await supabase.rpc('process_game_win', {
      p_user_id: user.id,
      p_amount: amount,
      p_game_id: activeGame || 'unknown',
      p_game_name: currentGame?.game_name || 'Game',
      p_multiplier: null,
      p_is_jackpot: false,
    });

    if (!winError) {
      const winResult = winData as any;
      if (winResult?.success && winResult?.new_balance !== undefined) {
        setUserCoins(winResult.new_balance);
        updateCachedBalance(winResult.new_balance);
      }
    }

    setWinAmount(amount);
    setShowWin(true);
  };

  const handleLoss = (amount: number) => {
    setLossAmount(amount);
    setShowLoss(true);
  };

  const removeFlyingCoin = (id: string) => {
    setFlyingCoins(prev => prev.filter(c => c.id !== id));
  };

  const currentGame = games.find(g => g.game_id === activeGame);

  useEffect(() => {
    const presets = (currentGame?.preset_bets && Array.isArray(currentGame.preset_bets) && currentGame.preset_bets.length > 0)
      ? currentGame.preset_bets as number[]
      : DEFAULT_PRESET_BETS;
    if (!presets.includes(betAmount)) {
      setBetAmount(presets[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGame, currentGame?.preset_bets]);

  const renderGame = () => {
    const props = {
      betAmount,
      userCoins,
      phase,
      timeLeft,
      onPlaceBet: handlePlaceBet,
      onWin: handleWin,
      onLoss: handleLoss
    };

    // Check if external/iframe game - inject token for balance integration
    if (currentGame?.game_type === 'iframe' && currentGame?.game_url) {
      if (!externalGameUrl) {
        buildGameUrl(currentGame.game_url, currentGame.game_id, roomId).then(url => {
          setExternalGameUrl(url);
        });
        return (
          <div className="p-2 flex items-center justify-center" style={{ height: Math.min(currentGame.iframe_height || 250, 300) }}>
            <Loader2 className="w-6 h-6 animate-spin text-white/60" />
          </div>
        );
      }
      return (
        <div className="p-2">
          <iframe
            src={externalGameUrl}
            width="100%"
            height={Math.min(currentGame.iframe_height || 250, 300)}
            className="rounded-xl border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            allowFullScreen
          />
        </div>
      );
    }

    if (currentGame?.game_type === 'external' && currentGame?.game_url) {
      if (!externalGameUrl) {
        buildGameUrl(currentGame.game_url, currentGame.game_id, roomId).then(url => {
          setExternalGameUrl(url);
        });
        return (
          <div className="w-full flex items-center justify-center" style={{ height: currentGame.iframe_height || 600 }}>
            <Loader2 className="w-6 h-6 animate-spin text-white/60" />
          </div>
        );
      }
      return (
        <div className="w-full overflow-hidden rounded-lg relative" style={{ height: currentGame.iframe_height || 600 }}>
          <iframe
            src={externalGameUrl}
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen; accelerometer; gyroscope; payment"
            allowFullScreen
            title={currentGame.game_name}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      );
    }

    // Native games
    switch (activeGame) {
      case 'dragon_tiger':
        return <DragonTigerGame {...props} />;
      case 'crash':
      case 'aviator':
        return <CrashGame {...props} />;
      case 'lucky_number':
        return <LuckyNumberGame game={{}} betAmount={betAmount} setBetAmount={() => {}} userCoins={userCoins} phase={phase} timeLeft={timeLeft} currentRound={null} bets={[]} myBets={[]} onPlaceBet={handlePlaceBet} onProcessResult={() => {}} onUpdateCoins={(newBal) => { setUserCoins(newBal); fetchUserCoins(); }} onGameWin={(amt) => handleWin(amt)} />;
      case 'rocket_race':
        return <RocketRaceGame game={{}} betAmount={betAmount} setBetAmount={() => {}} userCoins={userCoins} phase={phase} timeLeft={timeLeft} currentRound={null} bets={[]} myBets={[]} onPlaceBet={handlePlaceBet} onProcessResult={() => {}} onUpdateCoins={(newBal) => { setUserCoins(newBal); fetchUserCoins(); }} onGameWin={(amt) => handleWin(amt)} />;
      case 'lucky28':
      case 'plinko':
      case 'mines':
      case 'dice':
      case 'coinflip':
      case 'hilo':
      case 'wheel':
      case 'roulette':
      case 'slots':
      case 'blackjack':
      case 'baccarat':
      case 'andar_bahar':
      case 'limbo':
        return <GenericGame {...props} gameId={activeGame} gameName={currentGame?.game_name || activeGame} gameEmoji={currentGame?.game_emoji || '🎮'} />;
      default:
        return <GenericGame {...props} gameId={activeGame} gameName={currentGame?.game_name || 'Game'} gameEmoji={currentGame?.game_emoji || '🎮'} />;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-x-2 bottom-16 z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <>
      {/* Win/Loss Overlays */}
      <AnimatePresence>
        {showWin && <WinCelebration show={showWin} amount={winAmount} onComplete={() => setShowWin(false)} />}
        {showLoss && <LossDisplay show={showLoss} amount={lossAmount} onComplete={() => setShowLoss(false)} />}
      </AnimatePresence>

      {/* Flying Coins */}
      {flyingCoins.map(coin => (
        <FloatingCoin
          key={coin.id}
          startPos={coin.startPos}
          endPos={coin.endPos}
          onComplete={() => removeFlyingCoin(coin.id)}
        />
      ))}

      {/* Game Picker Sheet */}
      <Sheet open={showGamePicker} onOpenChange={setShowGamePicker}>
        <SheetContent side="bottom" className="h-[50vh] rounded-t-3xl p-4" style={{
          background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)'
        }}>
          <div className="flex justify-center mb-4">
            <div className="w-12 h-1 bg-white/30 rounded-full" />
          </div>
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" /> Select Game
          </h3>
          <div className="grid grid-cols-3 gap-3 max-h-[35vh] overflow-y-auto">
            {games.map((game) => (
              <motion.button
                key={game.game_id}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setActiveGame(game.game_id);
                  setExternalGameUrl(null);
                  setShowGamePicker(false);
                }}
                className={cn(
                  "flex flex-col items-center p-3 rounded-xl transition-all",
                  activeGame === game.game_id
                    ? "bg-gradient-to-br from-purple-500/40 to-pink-500/40 ring-2 ring-purple-400"
                    : "bg-white/10"
                )}
              >
                {game.logo_url ? (
                  <img src={game.logo_url} alt={game.game_name} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <span className="text-3xl">{game.game_emoji}</span>
                )}
                <span className="text-xs text-white/80 mt-2 text-center">{game.game_name}</span>
              </motion.button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Game Footer */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed inset-x-2 bottom-16 z-50"
      >
        <div 
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)',
            boxShadow: '0 -4px 30px rgba(139, 92, 246, 0.4), 0 10px 40px rgba(0,0,0,0.5)'
          }}
        >
          {/* Ultra Compact Mobile Header */}
          <div className="flex items-center justify-between px-2 py-1 bg-black/40">
            {/* Game Selector - Compact */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowGamePicker(true)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-md",
                `bg-gradient-to-br ${currentGame?.game_color || 'from-purple-500 to-pink-500'}`
              )}
            >
              <span className="text-sm">{currentGame?.game_emoji || '🎮'}</span>
              <span className="text-white font-semibold text-[11px] max-w-[60px] truncate">{currentGame?.game_name || 'Game'}</span>
              <ChevronDown className="w-2.5 h-2.5 text-white/70" />
            </motion.button>

            {/* Center Info - Round & Timer */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-white/40">R#{roundNumber}</span>
              {phase === 'betting' && (
                <motion.div
                  animate={timeLeft <= 5 ? { scale: [1, 1.03, 1] } : {}}
                  transition={{ duration: 0.3, repeat: Infinity }}
                  className={cn(
                    "flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold",
                    timeLeft <= 5 ? "bg-red-500/30 text-red-400" : "bg-green-500/20 text-green-400"
                  )}
                >
                  <Clock className="w-2 h-2" />
                  {timeLeft}s
                </motion.div>
              )}
            </div>

            {/* Right Side - Coins & Controls */}
            <div className="flex items-center gap-1">
              {/* Compact Coins Display */}
              <div 
                ref={coinDisplayRef}
                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 rounded text-[10px]"
              >
                <Coins className="w-2.5 h-2.5 text-amber-400" />
                <motion.span 
                  key={userCoins}
                  initial={{ scale: 1.05 }}
                  animate={{ scale: 1 }}
                  className="text-amber-300 font-bold"
                >
                  {userCoins >= 1000000 
                    ? `${(userCoins / 1000000).toFixed(1)}M` 
                    : userCoins >= 1000 
                      ? `${(userCoins / 1000).toFixed(0)}K` 
                      : userCoins}
                </motion.span>
              </div>

              {/* Sound Toggle - Smaller */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                className="w-5 h-5 rounded bg-white/10 flex items-center justify-center"
              >
                {isSoundEnabled ? 
                  <Volume2 className="w-2.5 h-2.5 text-white/70" /> : 
                  <VolumeX className="w-2.5 h-2.5 text-white/50" />
                }
              </motion.button>

              {onClose && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-5 h-5 rounded bg-red-500/20 flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5 text-red-400" />
                </motion.button>
              )}
            </div>
          </div>

          {/* Phase Status Bar */}
          <div className={cn(
            "py-2 text-center text-sm font-bold flex items-center justify-center gap-2",
            phase === 'betting' && "bg-green-500/20 text-green-400",
            phase === 'playing' && "bg-purple-500/20 text-purple-400",
            phase === 'result' && "bg-amber-500/20 text-amber-400"
          )}>
            {phase === 'betting' && (
              <>
                <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                  🎲
                </motion.span>
                Place Your Bets! {timeLeft}s
              </>
            )}
            {phase === 'playing' && (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
                  ⏳
                </motion.span>
                Game in Progress...
              </>
            )}
            {phase === 'result' && (
              <>
                <Trophy className="w-5 h-5" />
                Round Complete!
              </>
            )}
          </div>

          {/* Game Content */}
          <div className="max-h-[35vh] overflow-y-auto">
            {renderGame()}
          </div>

          {/* Bet Amount Selector */}
          {phase === 'betting' && (
            <div className="px-4 py-3 bg-black/20 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/60 text-xs">Bet Amount</span>
                <div className="flex items-center gap-1">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300 font-bold">{betAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {(currentGame?.preset_bets && Array.isArray(currentGame.preset_bets) && currentGame.preset_bets.length > 0 ? currentGame.preset_bets : DEFAULT_PRESET_BETS).map((amount: number) => (
                  <motion.button
                    key={amount}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setBetAmount(amount)}
                    disabled={amount > userCoins}
                    className={cn(
                      "flex-1 py-2 rounded-lg font-bold text-sm transition-all",
                      betAmount === amount
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30"
                        : amount > userCoins
                          ? "bg-white/5 text-white/30"
                          : "bg-white/10 text-white/80 hover:bg-white/20"
                    )}
                  >
                    {formatBet(amount)}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

export default GameFooterNew;

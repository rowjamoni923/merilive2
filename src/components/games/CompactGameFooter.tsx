import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
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
  Gamepad2
} from "lucide-react";
import { useLiveGameRound } from "@/hooks/useLiveGameRound";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CoinFlyAnimation, useFlyingCoins, WinCelebration, LossDisplay, BetAreaCoins } from "./CoinFlyAnimation";

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
  [key: string]: any;
}

interface CompactGameFooterProps {
  selectedGame?: string | null;
  roomId?: string;
  onClose?: () => void;
  onOpenGifts?: () => void;
  onChangeGame?: () => void;
}

const DEFAULT_PRESET_BETS = [500, 1000, 5000, 10000, 20000];

const formatBet = (amount: number): string => {
  if (amount >= 100000) return `${(amount / 100000).toFixed(0)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
};

// Ultra Compact Dragon Tiger Mini Game
const MiniDragonTiger = ({
  betAmount,
  setBetAmount,
  userCoins,
  phase,
  timeLeft,
  onPlaceBet,
  onWin
}: any) => {
  const [selectedBet, setSelectedBet] = useState<'dragon' | 'tiger' | 'tie' | null>(null);
  const [dragonCard, setDragonCard] = useState<string | null>(null);
  const [tigerCard, setTigerCard] = useState<string | null>(null);
  const [winner, setWinner] = useState<'dragon' | 'tiger' | 'tie' | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const CARDS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  useEffect(() => {
    if (phase === 'betting') {
      setDragonCard(null);
      setTigerCard(null);
      setWinner(null);
      setSelectedBet(null);
      setIsRevealing(false);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'playing' && selectedBet && !isRevealing) {
      revealCards();
    }
  }, [phase, selectedBet]);

  const getCardValue = (card: string): number => CARDS.indexOf(card);

  const revealCards = async () => {
    setIsRevealing(true);
    const dCard = CARDS[Math.floor(Math.random() * CARDS.length)];
    const tCard = CARDS[Math.floor(Math.random() * CARDS.length)];
    await new Promise(resolve => setTimeout(resolve, 400));
    setDragonCard(dCard);
    await new Promise(resolve => setTimeout(resolve, 400));
    setTigerCard(tCard);
    await new Promise(resolve => setTimeout(resolve, 300));
    const dragonValue = getCardValue(dCard);
    const tigerValue = getCardValue(tCard);
    let result: 'dragon' | 'tiger' | 'tie';
    if (dragonValue > tigerValue) result = 'dragon';
    else if (tigerValue > dragonValue) result = 'tiger';
    else result = 'tie';
    setWinner(result);
    if (result === selectedBet) {
      const multiplier = selectedBet === 'tie' ? 8 : 2;
      const winAmount = Math.floor(betAmount * multiplier);
      toast.success(`🎉 You won ${winAmount.toLocaleString()}!`);
      onWin?.(winAmount);
    }
  };

  const handlePlaceBet = async (type: 'dragon' | 'tiger' | 'tie') => {
    if (phase !== 'betting' || betAmount > userCoins) return;
    setSelectedBet(type);
    await onPlaceBet('dragon_tiger', type);
  };

  return (
    <div className="flex items-center gap-1.5 p-1.5">
      {/* Dragon */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => handlePlaceBet('dragon')}
        disabled={phase !== 'betting' || selectedBet !== null}
        className={cn(
          "flex-1 relative rounded-lg p-1.5 overflow-hidden transition-all",
          selectedBet === 'dragon' && "ring-1 ring-white",
          winner === 'dragon' && "ring-1 ring-green-400"
        )}
        style={{ background: 'linear-gradient(145deg, #dc2626 0%, #991b1b 100%)' }}
      >
        <motion.div 
          className="flex flex-col items-center"
          animate={winner === 'dragon' ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3, repeat: winner === 'dragon' ? 2 : 0 }}
        >
          <span className="text-lg">🐉</span>
          <span className="text-white font-bold text-[8px]">DRAGON</span>
          <span className="text-white/70 text-[7px]">2x</span>
          {dragonCard && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="mt-0.5 w-5 h-7 bg-white rounded text-black font-bold text-[10px] flex items-center justify-center shadow"
            >
              {dragonCard}
            </motion.div>
          )}
        </motion.div>
        {selectedBet === 'dragon' && !winner && (
          <div className="absolute inset-0 bg-white/10 animate-pulse" />
        )}
      </motion.button>

      {/* Tie */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => handlePlaceBet('tie')}
        disabled={phase !== 'betting' || selectedBet !== null}
        className={cn(
          "relative rounded-full w-8 h-8 flex items-center justify-center",
          selectedBet === 'tie' && "ring-1 ring-white",
          winner === 'tie' && "ring-1 ring-yellow-400"
        )}
        style={{ background: 'linear-gradient(145deg, #8b5cf6 0%, #4c1d95 100%)' }}
      >
        <span className="text-white font-black text-[9px]">VS</span>
        <span className="absolute -bottom-2 text-[6px] text-purple-300 font-bold">8x</span>
      </motion.button>

      {/* Tiger */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => handlePlaceBet('tiger')}
        disabled={phase !== 'betting' || selectedBet !== null}
        className={cn(
          "flex-1 relative rounded-lg p-1.5 overflow-hidden transition-all",
          selectedBet === 'tiger' && "ring-1 ring-white",
          winner === 'tiger' && "ring-1 ring-green-400"
        )}
        style={{ background: 'linear-gradient(145deg, #f97316 0%, #c2410c 100%)' }}
      >
        <motion.div 
          className="flex flex-col items-center"
          animate={winner === 'tiger' ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3, repeat: winner === 'tiger' ? 2 : 0 }}
        >
          <span className="text-lg">🐅</span>
          <span className="text-white font-bold text-[8px]">TIGER</span>
          <span className="text-white/70 text-[7px]">2x</span>
          {tigerCard && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="mt-0.5 w-5 h-7 bg-white rounded text-black font-bold text-[10px] flex items-center justify-center shadow"
            >
              {tigerCard}
            </motion.div>
          )}
        </motion.div>
        {selectedBet === 'tiger' && !winner && (
          <div className="absolute inset-0 bg-white/10 animate-pulse" />
        )}
      </motion.button>
    </div>
  );
};

// Ultra Compact Crash/Aviator Game
const MiniCrashGame = ({ phase, onPlaceBet, betAmount, userCoins, onWin }: any) => {
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashed, setCrashed] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [hasBet, setHasBet] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [isPlacingBet, setIsPlacingBet] = useState(false);

  useEffect(() => {
    if (phase === 'playing' && hasBet && !crashed && !cashedOut) {
      const interval = setInterval(() => {
        setMultiplier(m => {
          const newM = m + 0.05 + Math.random() * 0.15;
          if (Math.random() < 0.02 + (newM > 3 ? 0.03 : 0)) {
            setCrashed(true);
            clearInterval(interval);
          }
          return newM;
        });
      }, 100);
      return () => clearInterval(interval);
    }
    if (phase === 'betting') {
      setMultiplier(1.00);
      setCrashed(false);
      setCashedOut(false);
      setHasBet(false);
      setWinAmount(0);
      setIsPlacingBet(false);
    }
  }, [phase, hasBet]);

  const handlePlaceBet = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPlacingBet || hasBet) return;
    if (betAmount > userCoins) {
      toast.error('Not enough diamonds!');
      return;
    }
    setIsPlacingBet(true);
    try {
      setHasBet(true);
      const result = await onPlaceBet('crash', 'bet');
      if (result && !result.success) {
        setHasBet(false);
        toast.error(result.error || 'Bet failed');
      } else {
        toast.success(`🚀 Bet: ${formatBet(betAmount)}`);
      }
    } catch (err) {
      setHasBet(false);
      toast.error('Failed to place bet');
    } finally {
      setIsPlacingBet(false);
    }
  };

  const handleCashOut = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const win = Math.floor(betAmount * multiplier);
    setWinAmount(win);
    setCashedOut(true);
    toast.success(`🎉 +${win.toLocaleString()} at ${multiplier.toFixed(2)}x!`);
    onWin?.(win);
  };

  return (
    <div className="p-1.5">
      <div className="flex items-center justify-center gap-3 mb-1.5">
        <motion.div
          animate={!crashed && phase === 'playing' && hasBet ? { y: [-2, 2, -2] } : {}}
          transition={{ duration: 0.4, repeat: Infinity }}
          className="text-2xl"
        >
          {crashed ? "💥" : "🚀"}
        </motion.div>
        <motion.div
          animate={!crashed && phase === 'playing' ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.3, repeat: Infinity }}
          className={cn(
            "text-xl font-black",
            crashed ? "text-red-500" : cashedOut ? "text-green-400" : "text-amber-400"
          )}
        >
          {crashed ? "CRASHED!" : `${multiplier.toFixed(2)}x`}
        </motion.div>
        {cashedOut && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-400 font-bold text-xs">
            +{winAmount.toLocaleString()} 🪙
          </motion.span>
        )}
      </div>
      <div className="flex justify-center gap-1.5">
        {phase === 'betting' && !hasBet && (
          <motion.button 
            whileTap={{ scale: 0.95 }} 
            onClick={handlePlaceBet} 
            disabled={betAmount > userCoins || isPlacingBet}
            className={cn(
              "px-4 py-1.5 rounded-lg text-white font-bold text-xs shadow",
              betAmount > userCoins 
                ? "bg-gray-500 cursor-not-allowed" 
                : "bg-gradient-to-r from-green-500 to-emerald-600"
            )}
          >
            {isPlacingBet ? "⏳" : `🚀 ${formatBet(betAmount)}`}
          </motion.button>
        )}
        {phase === 'betting' && hasBet && (
          <span className="text-green-400 font-bold text-xs">✓ Bet Placed!</span>
        )}
        {phase === 'playing' && hasBet && !crashed && !cashedOut && (
          <motion.button 
            whileTap={{ scale: 0.95 }} 
            animate={{ scale: [1, 1.03, 1] }} 
            transition={{ duration: 0.4, repeat: Infinity }}
            onClick={handleCashOut} 
            className="px-4 py-1.5 rounded-lg text-white font-bold text-xs bg-gradient-to-r from-amber-500 to-orange-600"
          >
            💰 {(betAmount * multiplier).toFixed(0)}
          </motion.button>
        )}
        {phase === 'playing' && !hasBet && (
          <span className="text-white/40 text-[10px]">Next round...</span>
        )}
        {crashed && hasBet && !cashedOut && (
          <span className="text-red-400 font-bold text-xs">💥 -{formatBet(betAmount)}</span>
        )}
      </div>
    </div>
  );
};

// Ultra Compact Lucky 28 Game
const MiniLucky28 = ({ phase, onPlaceBet, betAmount, userCoins, onWin }: any) => {
  const [selectedBet, setSelectedBet] = useState<'big' | 'small' | 'odd' | 'even' | null>(null);
  const [dice1, setDice1] = useState(1);
  const [dice2, setDice2] = useState(1);
  const [dice3, setDice3] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const total = dice1 + dice2 + dice3;
  const isBig = total >= 14;
  const isOdd = total % 2 === 1;
  const DICE_EMOJI = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  useEffect(() => {
    if (phase === 'betting') {
      setSelectedBet(null);
      setDice1(1); setDice2(1); setDice3(1);
      setResult(null);
      setRolling(false);
    }
    if (phase === 'playing' && selectedBet && !rolling) {
      setRolling(true);
      const interval = setInterval(() => {
        setDice1(Math.ceil(Math.random() * 6));
        setDice2(Math.ceil(Math.random() * 6));
        setDice3(Math.ceil(Math.random() * 6));
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        const d1 = Math.ceil(Math.random() * 6);
        const d2 = Math.ceil(Math.random() * 6);
        const d3 = Math.ceil(Math.random() * 6);
        setDice1(d1); setDice2(d2); setDice3(d3);
        const total = d1 + d2 + d3;
        setResult(total);
        setRolling(false);
        // Determine win
        const isBigR = total >= 14;
        const isOddR = total % 2 === 1;
        const won =
          (selectedBet === 'big' && isBigR) ||
          (selectedBet === 'small' && !isBigR) ||
          (selectedBet === 'odd' && isOddR) ||
          (selectedBet === 'even' && !isOddR);
        if (won) {
          const winAmount = Math.floor(betAmount * 2);
          toast.success(`🎉 You won ${winAmount.toLocaleString()}!`);
          onWin?.(winAmount);
        }
      }, 1200);
    }
  }, [phase, selectedBet]);

  const handleBet = async (type: 'big' | 'small' | 'odd' | 'even') => {
    if (betAmount > userCoins) return;
    setSelectedBet(type);
    await onPlaceBet('lucky_28', type);
  };

  return (
    <div className="p-1.5">
      <div className="flex justify-center gap-2 mb-1.5">
        {[dice1, dice2, dice3].map((die, i) => (
          <motion.div key={i} animate={rolling ? { rotate: [0, 360] } : {}}
            transition={{ duration: 0.15, repeat: rolling ? 8 : 0 }}
            className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg shadow">
            {DICE_EMOJI[die - 1]}
          </motion.div>
        ))}
      </div>
      {result && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center mb-1.5">
          <span className="text-xl font-black text-amber-400">{result}</span>
          <div className="flex justify-center gap-1 mt-0.5">
            <span className={cn("text-[7px] font-bold px-1.5 py-0.5 rounded", isBig ? "bg-red-500/30 text-red-400" : "bg-blue-500/30 text-blue-400")}>
              {isBig ? 'BIG' : 'SMALL'}
            </span>
            <span className={cn("text-[7px] font-bold px-1.5 py-0.5 rounded", isOdd ? "bg-purple-500/30 text-purple-400" : "bg-green-500/30 text-green-400")}>
              {isOdd ? 'ODD' : 'EVEN'}
            </span>
          </div>
        </motion.div>
      )}
      {phase === 'betting' && !selectedBet && (
        <div className="grid grid-cols-4 gap-1">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleBet('big')}
            className="p-1 rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-white text-center">
            <span className="text-sm">📈</span><p className="text-[7px] font-bold">BIG</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleBet('small')}
            className="p-1 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white text-center">
            <span className="text-sm">📉</span><p className="text-[7px] font-bold">SMALL</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleBet('odd')}
            className="p-1 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white text-center">
            <span className="text-sm">🔢</span><p className="text-[7px] font-bold">ODD</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleBet('even')}
            className="p-1 rounded-lg bg-gradient-to-br from-green-500 to-green-700 text-white text-center">
            <span className="text-sm">🎯</span><p className="text-[7px] font-bold">EVEN</p>
          </motion.button>
        </div>
      )}
      {selectedBet && phase === 'betting' && (
        <div className="text-center text-green-400 font-bold text-[10px]">✓ {selectedBet.toUpperCase()}</div>
      )}
    </div>
  );
};

// Ultra Compact Plinko Game
const MiniPlinko = ({ phase, onPlaceBet, betAmount, userCoins, onWin }: any) => {
  const [hasBet, setHasBet] = useState(false);
  const [ballPosition, setBallPosition] = useState({ x: 50, y: 0 });
  const [isDropping, setIsDropping] = useState(false);
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const MULTIPLIERS = [10, 5, 3, 2, 1.5, 1, 1.5, 2, 3, 5, 10];
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444'];

  useEffect(() => {
    if (phase === 'betting') {
      setHasBet(false);
      setBallPosition({ x: 50, y: 0 });
      setMultiplier(null);
      setIsDropping(false);
    }
    if (phase === 'playing' && hasBet && !isDropping) {
      dropBall();
    }
  }, [phase, hasBet]);

  const dropBall = async () => {
    setIsDropping(true);
    let x = 50;
    for (let row = 0; row < 6; row++) {
      await new Promise(r => setTimeout(r, 120));
      x += (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 3);
      x = Math.max(5, Math.min(95, x));
      setBallPosition({ x, y: (row + 1) * 14 });
    }
    const slot = Math.floor((x / 100) * MULTIPLIERS.length);
    const finalMultiplier = MULTIPLIERS[Math.max(0, Math.min(slot, MULTIPLIERS.length - 1))];
    setMultiplier(finalMultiplier);
    setIsDropping(false);
    if (finalMultiplier >= 1) {
      const winAmount = Math.floor(betAmount * finalMultiplier);
      if (finalMultiplier >= 2) {
        toast.success(`🎉 +${winAmount.toLocaleString()}!`);
      }
      onWin?.(winAmount);
    }
  };

  const handleBet = async () => {
    if (betAmount > userCoins) return;
    setHasBet(true);
    await onPlaceBet('plinko', 'drop');
  };

  return (
    <div className="p-1.5">
      <div className="relative h-20 bg-gradient-to-b from-purple-900/50 to-indigo-900/50 rounded-lg overflow-hidden mb-1.5">
        {[...Array(5)].map((_, row) => (
          <div key={row} className="absolute w-full flex justify-center gap-2" style={{ top: `${(row + 1) * 15}%` }}>
            {[...Array(row + 3)].map((_, i) => (
              <div key={i} className="w-1 h-1 bg-white/40 rounded-full" />
            ))}
          </div>
        ))}
        {(isDropping || multiplier !== null) && (
          <motion.div animate={{ left: `${ballPosition.x}%`, top: `${ballPosition.y}%` }}
            transition={{ type: "spring", stiffness: 200 }}
            className="absolute w-3 h-3 bg-gradient-to-br from-red-400 to-red-600 rounded-full shadow transform -translate-x-1/2" />
        )}
        <div className="absolute bottom-0 w-full flex">
          {MULTIPLIERS.map((m, i) => (
            <div key={i} className="flex-1 h-3 flex items-center justify-center text-[6px] font-bold"
              style={{ background: COLORS[i % COLORS.length] + '80' }}>{m}x</div>
          ))}
        </div>
      </div>
      {multiplier !== null && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center mb-1">
          <span className="text-lg font-black text-amber-400">{multiplier}x</span>
          <span className="text-green-400 text-xs ml-1">+{(betAmount * multiplier).toLocaleString()}</span>
        </motion.div>
      )}
      {phase === 'betting' && !hasBet && (
        <motion.button whileTap={{ scale: 0.95 }} onClick={handleBet}
          className="w-full py-1.5 rounded-lg bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold text-xs">
          🔴 Drop ({formatBet(betAmount)})
        </motion.button>
      )}
      {hasBet && phase === 'betting' && (
        <div className="text-center text-green-400 font-bold text-[10px]">✓ Ready!</div>
      )}
    </div>
  );
};

// Ultra Compact Andar Bahar Game
const MiniAndarBahar = ({ phase, onPlaceBet, betAmount, userCoins }: any) => {
  const [selectedSide, setSelectedSide] = useState<'andar' | 'bahar' | null>(null);
  const [jokerCard, setJokerCard] = useState<string | null>(null);
  const [andarCards, setAndarCards] = useState<string[]>([]);
  const [baharCards, setBaharCards] = useState<string[]>([]);
  const [winner, setWinner] = useState<'andar' | 'bahar' | null>(null);
  const [dealing, setDealing] = useState(false);
  const CARDS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  useEffect(() => {
    if (phase === 'betting') {
      setSelectedSide(null); setJokerCard(null); setAndarCards([]); setBaharCards([]);
      setWinner(null); setDealing(false);
    }
    if (phase === 'playing' && selectedSide && !dealing) {
      dealCards();
    }
  }, [phase, selectedSide]);

  const dealCards = async () => {
    setDealing(true);
    const joker = CARDS[Math.floor(Math.random() * CARDS.length)];
    setJokerCard(joker);
    await new Promise(r => setTimeout(r, 400));
    let turn: 'andar' | 'bahar' = 'andar';
    let found = false;
    const aCards: string[] = [];
    const bCards: string[] = [];
    for (let i = 0; i < 15 && !found; i++) {
      await new Promise(r => setTimeout(r, 200));
      const card = CARDS[Math.floor(Math.random() * CARDS.length)];
      if (turn === 'andar') { aCards.push(card); setAndarCards([...aCards]); }
      else { bCards.push(card); setBaharCards([...bCards]); }
      if (card === joker) {
        found = true;
        setWinner(turn);
        if (turn === selectedSide) toast.success(`🎉 ${turn.toUpperCase()} wins!`);
      }
      turn = turn === 'andar' ? 'bahar' : 'andar';
    }
    setDealing(false);
  };

  const handleBet = async (side: 'andar' | 'bahar') => {
    if (betAmount > userCoins) return;
    setSelectedSide(side);
    await onPlaceBet('andar_bahar', side);
  };

  return (
    <div className="p-1.5">
      <div className="flex justify-center mb-1.5">
        <motion.div animate={jokerCard ? { scale: [0, 1.1, 1] } : {}}
          className="w-7 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded flex items-center justify-center text-white font-bold text-xs shadow">
          {jokerCard || '?'}
        </motion.div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-1.5">
        <div className="text-center">
          <p className="text-blue-400 font-bold text-[8px] mb-0.5">ANDAR</p>
          <div className="flex flex-wrap justify-center gap-0.5 min-h-[24px]">
            {andarCards.slice(-5).map((card, i) => (
              <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                className={cn("w-4 h-5 rounded text-[7px] font-bold flex items-center justify-center",
                  card === jokerCard ? "bg-green-500 text-white" : "bg-white text-black")}>{card}</motion.div>
            ))}
          </div>
        </div>
        <div className="text-center">
          <p className="text-orange-400 font-bold text-[8px] mb-0.5">BAHAR</p>
          <div className="flex flex-wrap justify-center gap-0.5 min-h-[24px]">
            {baharCards.slice(-5).map((card, i) => (
              <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                className={cn("w-4 h-5 rounded text-[7px] font-bold flex items-center justify-center",
                  card === jokerCard ? "bg-green-500 text-white" : "bg-white text-black")}>{card}</motion.div>
            ))}
          </div>
        </div>
      </div>
      {phase === 'betting' && !selectedSide && (
        <div className="grid grid-cols-2 gap-1.5">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleBet('andar')}
            className="py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold text-center">
            <span className="text-sm">🅰️</span><p className="text-[9px]">ANDAR 2x</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleBet('bahar')}
            className="py-2 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 text-white font-bold text-center">
            <span className="text-sm">🅱️</span><p className="text-[9px]">BAHAR 2x</p>
          </motion.button>
        </div>
      )}
      {selectedSide && phase === 'betting' && (
        <div className="text-center text-green-400 font-bold text-[10px]">✓ {selectedSide.toUpperCase()}</div>
      )}
    </div>
  );
};

export function CompactGameFooter({ selectedGame, roomId, onClose, onOpenGifts, onChangeGame }: CompactGameFooterProps) {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [activeGame, setActiveGame] = useState<string | null>(selectedGame || 'dragon_tiger');
  const [loading, setLoading] = useState(true);
  const [userCoins, setUserCoins] = useState(0);
  const [betAmount, setBetAmount] = useState(5000);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [showWin, setShowWin] = useState(false);
  const [showLoss, setShowLoss] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [lossAmount, setLossAmount] = useState(0);
  
  // Coin fly animation
  const { coins: flyingCoins, addCoin } = useFlyingCoins();
  const coinDisplayRef = useRef<HTMLDivElement>(null);

  const handleWin = (amount: number) => {
    setWinAmount(amount);
    setShowWin(true);
    // Refresh coins after win
    setTimeout(fetchUserCoins, 500);
  };

  const handleLoss = (amount: number) => {
    setLossAmount(amount);
    setShowLoss(true);
  };

  const {
    currentRound,
    timeLeft,
    phase,
    placeBet,
    processResult,
    lastWinAmount,
    lastLossAmount
  } = useLiveGameRound({
    gameId: activeGame || 'dragon_tiger',
    roomId: roomId,
    autoStart: true,
    bettingSeconds: 12,
    onWin: handleWin,
    onLoss: handleLoss
  });

  useEffect(() => {
    fetchGames();
    fetchUserCoins();
  }, []);

  // Allow all active games now (native + iframe + external)
  const fetchGames = async () => {
    try {
      const { data } = await supabase
        .from('game_settings')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      setGames(data || []);
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
    console.log('handlePlaceBet called:', { phase, betAmount, userCoins, betType, betValue });
    
    if (phase !== 'betting') {
      console.log('Not in betting phase');
      return { success: false, error: 'Betting is closed' };
    }
    if (betAmount > userCoins) { 
      toast.error('Not enough diamonds'); 
      return { success: false, error: 'Not enough diamonds' }; 
    }
    
    try {
      setUserCoins(prev => prev - betAmount);
      const result = await placeBet(betAmount, betType, betValue);
      console.log('placeBet result:', result);
      
      if (!result || !result.success) {
        setUserCoins(prev => prev + betAmount);
        return { success: false, error: result?.error || 'Bet failed' };
      }
      
      // Refresh user coins after successful bet
      fetchUserCoins();
      return { success: true };
    } catch (error: any) {
      console.error('handlePlaceBet error:', error);
      setUserCoins(prev => prev + betAmount);
      return { success: false, error: error.message || 'Bet failed' };
    }
  };

  const currentGame = games.find(g => g.game_id === activeGame);

  const renderMiniGame = () => {
    const props = {
      betAmount,
      setBetAmount,
      userCoins,
      phase,
      timeLeft,
      onPlaceBet: handlePlaceBet,
      currentRound
    };

    // Check if current game is iframe or external type
    if (currentGame?.game_type === 'iframe' && currentGame?.game_url) {
      return (
        <div className="p-1.5">
          <iframe
            src={currentGame.game_url}
            width="100%"
            height={Math.min(currentGame.iframe_height || 200, 180)}
            className="rounded-lg border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            allowFullScreen
          />
        </div>
      );
    }

    if (currentGame?.game_type === 'external' && currentGame?.game_url) {
      return (
        <div className="w-full overflow-hidden rounded-lg relative" style={{ height: currentGame.iframe_height || 600 }}>
          <iframe
            src={currentGame.game_url}
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
        return <MiniDragonTiger {...props} />;
      case 'crash':
      case 'aviator':
        return <MiniCrashGame {...props} />;
      case 'lucky_28':
        return <MiniLucky28 {...props} />;
      case 'plinko':
        return <MiniPlinko {...props} />;
      case 'andar_bahar':
        return <MiniAndarBahar {...props} />;
      default:
        // If game has URL, show iframe/external, otherwise show dragon tiger
        if (currentGame?.game_url) {
          if (currentGame.game_type === 'iframe') {
            return (
              <div className="p-1.5">
                <iframe
                  src={currentGame.game_url}
                  width="100%"
                  height={Math.min(currentGame.iframe_height || 200, 180)}
                  className="rounded-lg border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  allowFullScreen
                />
              </div>
            );
          } else {
            return (
              <div className="p-3 text-center">
                <span className="text-3xl">{currentGame.game_emoji}</span>
                <p className="text-white/70 text-xs mt-1 mb-2">{currentGame.description || 'External game'}</p>
                <a
                  href={currentGame.game_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-xs"
                >
                  🎮 Play →
                </a>
              </div>
            );
          }
        }
        return <MiniDragonTiger {...props} />;
    }
  };

  if (loading) return null;

  return (
    <>
      {/* Win/Loss Animations */}
      <WinCelebration show={showWin} amount={winAmount} onComplete={() => setShowWin(false)} />
      <LossDisplay show={showLoss} amount={lossAmount} onComplete={() => setShowLoss(false)} />
      <CoinFlyAnimation coins={flyingCoins} />
      
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed inset-x-1 bottom-14 z-50 mb-1"
        style={{ maxHeight: '35vh' }}
      >
      {/* Game Picker Sheet */}
      <Sheet open={showGamePicker} onOpenChange={setShowGamePicker}>
        <SheetContent side="bottom" className="h-[40vh] rounded-t-2xl p-0" style={{
          background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)'
        }}>
          <div className="flex justify-center pt-2">
            <div className="w-10 h-0.5 bg-white/30 rounded-full" />
          </div>
          <div className="p-3">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-1.5">
              <Gamepad2 className="w-4 h-4" /> Select Game
            </h3>
            <div className="grid grid-cols-3 gap-1.5 max-h-[28vh] overflow-y-auto">
              {games.map((game) => (
                <motion.button
                  key={game.game_id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setActiveGame(game.game_id);
                    setShowGamePicker(false);
                    setActiveGame(game.game_id);
                    setShowGamePicker(false);
                  }}
                  className={cn(
                    "flex flex-col items-center p-1.5 rounded-lg transition-all relative",
                    activeGame === game.game_id
                      ? "bg-gradient-to-br from-purple-500/40 to-pink-500/40 ring-1 ring-purple-400"
                      : "bg-white/10"
                  )}
                >
                  {/* Game Type Badge */}
                  {game.game_type === 'iframe' && (
                    <span className="absolute -top-1 -right-1 text-[6px] bg-blue-500 text-white px-1 rounded">🖼️</span>
                  )}
                  {game.game_type === 'external' && (
                    <span className="absolute -top-1 -right-1 text-[6px] bg-orange-500 text-white px-1 rounded">🔗</span>
                  )}
                  
                  {game.logo_url ? (
                    <img src={getProxiedUrl(game.logo_url)} alt={game.game_name} className="w-8 h-8 rounded object-contain" />
                  ) : (
                    <span className="text-lg">{game.game_emoji}</span>
                  )}
                  <span className="text-[7px] text-white/80 truncate w-full text-center mt-0.5">
                    {game.game_name}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Ultra Compact Floating Footer */}
      <div 
        className="rounded-xl overflow-hidden shadow-xl"
        style={{
          background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)',
          boxShadow: '0 -2px 20px rgba(139, 92, 246, 0.3), 0 5px 25px rgba(0,0,0,0.4)'
        }}
      >
        {/* Ultra Compact Header Bar */}
        <div className="flex items-center justify-between px-2 py-1 bg-black/40">
          {/* Game Selector */}
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

          {/* Center - Round & Timer */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/40">R#{currentRound?.round_number || 0}</span>
            {phase === 'betting' && timeLeft > 0 && (
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

          {/* Right - Coins & Controls */}
          <div className="flex items-center gap-1">
            {/* Coins - Compact format */}
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 rounded text-[10px]">
              <Coins className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-amber-300 font-bold">
                {userCoins >= 1000000 
                  ? `${(userCoins / 1000000).toFixed(1)}M` 
                  : userCoins >= 1000 
                    ? `${(userCoins / 1000).toFixed(0)}K` 
                    : userCoins}
              </span>
            </div>

            {/* Sound */}
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

        {/* Phase Status */}
        <div className={cn(
          "py-0.5 text-center text-[10px] font-bold flex items-center justify-center gap-1",
          phase === 'betting' && "bg-green-500/15 text-green-400",
          phase === 'playing' && "bg-purple-500/15 text-purple-400",
          phase === 'result' && "bg-amber-500/15 text-amber-400",
          phase === 'waiting' && "bg-slate-500/15 text-slate-400"
        )}>
          {phase === 'betting' && <>🎲 Bet Now! {timeLeft}s</>}
          {phase === 'playing' && <>⏳ Playing...</>}
          {phase === 'result' && <>🏆 Done!</>}
          {phase === 'waiting' && <>Wait...</>}
        </div>

        {/* Game Content - More compact */}
        <div className="max-h-[18vh] overflow-y-auto">
          {renderMiniGame()}
        </div>

        {/* Bet Amount Selector */}
        {phase === 'betting' && (
          <div className="flex justify-center gap-1 px-2 py-1.5 bg-black/30 border-t border-white/5">
            {DEFAULT_PRESET_BETS.map((amount) => (
              <motion.button
                key={amount}
                whileTap={{ scale: 0.95 }}
                onClick={() => setBetAmount(amount)}
                disabled={amount > userCoins}
                className={cn(
                  "flex-1 py-1 rounded text-[11px] font-bold transition-all",
                  betAmount === amount
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20"
                    : amount > userCoins
                      ? "bg-white/5 text-white/20"
                      : "bg-white/10 text-white/70"
                )}
              >
                {formatBet(amount)}
              </motion.button>
            ))}
          </div>
        )}

        {/* Bet Info Footer - More compact */}
        <div className="flex items-center justify-between px-1.5 py-0.5 bg-black/30 border-t border-white/5">
          <span className="text-white/50 text-[7px]">Your Bet</span>
          <div className="flex items-center gap-0.5">
            <Coins className="w-1.5 h-1.5 text-amber-400" />
            <span className="text-amber-300 font-bold text-[8px]">{betAmount.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
    </>
  );
}

export default CompactGameFooter;

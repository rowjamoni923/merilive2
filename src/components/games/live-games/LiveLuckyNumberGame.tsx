import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins, Star, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WinPopup } from "../common/WinPopup";
import { formatBetAmount } from "../common/BetControls";
import { processWin } from "@/services/gameBalanceService";

interface LiveLuckyNumberGameProps {
  game: any;
  betAmount: number;
  setBetAmount: (amount: number) => void;
  userCoins: number;
  phase: string;
  timeLeft: number;
  currentRound: any;
  bets: any[];
  myBets: any[];
  onPlaceBet: (betType?: string, betValue?: string) => Promise<any>;
  onProcessResult: (result: any) => void;
  onUpdateCoins?: (newBalance: number) => void;
  onGameWin?: (winAmount: number) => void;
  onTimerUpdate?: (timeLeft: number, phase: 'betting' | 'spinning') => void;
}

// Numbers 1-10 with 9x multiplier
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const MULTIPLIER = 9;

const NUMBER_COLORS = [
  "from-red-500 to-red-700",
  "from-orange-500 to-orange-700",
  "from-yellow-500 to-yellow-700",
  "from-lime-500 to-lime-700",
  "from-green-500 to-green-700",
  "from-teal-500 to-teal-700",
  "from-cyan-500 to-cyan-700",
  "from-blue-500 to-blue-700",
  "from-purple-500 to-purple-700",
  "from-pink-500 to-pink-700",
];

const AUTO_PLAY_BETTING_TIME = 25000;
const REVEAL_DURATION = 3000;

// Generate stars once
const generateStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 0.5 + Math.random() * 1,
    delay: Math.random() * 2,
  }));
};

export function LiveLuckyNumberGame({
  game,
  betAmount,
  setBetAmount,
  userCoins,
  phase: externalPhase,
  timeLeft: externalTimeLeft,
  currentRound,
  bets,
  myBets,
  onPlaceBet,
  onProcessResult,
  onUpdateCoins,
  onGameWin,
  onTimerUpdate
}: LiveLuckyNumberGameProps) {
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [betOnNumber, setBetOnNumber] = useState<Record<number, number>>({});
  const [isRevealing, setIsRevealing] = useState(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [revealingNumber, setRevealingNumber] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [recentResults, setRecentResults] = useState<number[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [totalBetPlaced, setTotalBetPlaced] = useState(0);
  
  const [autoPlayPhase, setAutoPlayPhase] = useState<'betting' | 'revealing'>('betting');
  const [autoPlayTimeLeft, setAutoPlayTimeLeft] = useState(25);
  const [roundCounter, setRoundCounter] = useState(0);

  const isMountedRef = useRef(true);
  const selectedNumbersRef = useRef<Set<number>>(new Set());
  const betOnNumberRef = useRef<Record<number, number>>({});
  const totalBetPlacedRef = useRef<number>(0);
  
  const stars = useMemo(() => generateStars(30), []);

  useEffect(() => { selectedNumbersRef.current = selectedNumbers; }, [selectedNumbers]);
  useEffect(() => { betOnNumberRef.current = betOnNumber; }, [betOnNumber]);
  useEffect(() => { totalBetPlacedRef.current = totalBetPlaced; }, [totalBetPlaced]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    onTimerUpdate?.(autoPlayTimeLeft, autoPlayPhase === 'betting' ? 'betting' : 'spinning');
  }, [autoPlayTimeLeft, autoPlayPhase, onTimerUpdate]);

  // Main game cycle
  useEffect(() => {
    let bettingTimer: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    
    setAutoPlayPhase('betting');
    setAutoPlayTimeLeft(25);
    setWinningNumber(null);
    setRevealingNumber(null);
    setSelectedNumbers(new Set());
    setBetOnNumber({});
    setTotalBetPlaced(0);
    setIsRevealing(false);
    setWon(null);
    setShowWinPopup(false);
    setCountdown(null);

    let timeRemaining = 25;
    countdownInterval = setInterval(() => {
      if (isMountedRef.current) {
        timeRemaining -= 1;
        setAutoPlayTimeLeft(timeRemaining);
        if (timeRemaining <= 0 && countdownInterval) clearInterval(countdownInterval);
      }
    }, 1000);

    bettingTimer = setTimeout(() => {
      if (isMountedRef.current) startCountdown();
    }, AUTO_PLAY_BETTING_TIME);

    return () => {
      if (bettingTimer) clearTimeout(bettingTimer);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [roundCounter]);

  const startCountdown = async () => {
    setAutoPlayPhase('revealing');
    for (let i = 3; i >= 1; i--) {
      if (!isMountedRef.current) return;
      setCountdown(i);
      await new Promise(r => setTimeout(r, 800));
    }
    if (isMountedRef.current) {
      setCountdown(null);
      revealNumber();
    }
  };

  const revealNumber = async () => {
    setAutoPlayPhase('revealing');
    setIsRevealing(true);
    
    const winner = Math.floor(Math.random() * 10) + 1;
    
    // Dramatic reveal animation - cycle through numbers
    for (let cycle = 0; cycle < 20; cycle++) {
      if (!isMountedRef.current) return;
      const speed = 50 + cycle * 15; // Slow down gradually
      setRevealingNumber(((cycle + winner) % 10) + 1);
      await new Promise(r => setTimeout(r, speed));
    }
    
    setRevealingNumber(null);
    setWinningNumber(winner);
    setIsRevealing(false);
    setRecentResults(prev => [winner, ...prev].slice(0, 10));
    
    processResults(winner);
  };

  const processResults = async (winner: number) => {
    const currentBets = betOnNumberRef.current;
    const currentTotalBet = totalBetPlacedRef.current;
    
    if (currentBets[winner] && currentBets[winner] > 0) {
      const totalWinnings = Math.floor(currentBets[winner] * MULTIPLIER);
      setWon(true);
      setWinAmount(totalWinnings);
      setShowWinPopup(true);
      
      const creditWinnings = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const result = await processWin(user.id, game?.id || 'lucky-number', game?.name || 'Lucky Number', totalWinnings, MULTIPLIER);
          if (result.success && result.newBalance !== undefined) {
            onUpdateCoins?.(result.newBalance);
          }
        } catch (error) {
          console.error('[LuckyNumber] Credit error:', error);
        }
      };
      creditWinnings();
      onGameWin?.(totalWinnings);
    } else if (currentTotalBet > 0) {
      setWon(false);
      setWinAmount(currentTotalBet);
      setShowWinPopup(true);
    }

    setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 3000);
    onProcessResult(winner.toString());
    
    setTimeout(() => {
      if (isMountedRef.current) setRoundCounter(prev => prev + 1);
    }, 3000);
  };

  const handleSelectNumber = async (num: number) => {
    if (autoPlayPhase !== 'betting' || isPlacingBet) return;
    if (betAmount > userCoins) return;

    setSelectedNumbers(prev => new Set([...prev, num]));
    setBetOnNumber(prev => ({ ...prev, [num]: (prev[num] || 0) + betAmount }));
    setTotalBetPlaced(prev => prev + betAmount);
    
    setIsPlacingBet(true);

    onPlaceBet('lucky_number', num.toString()).then(result => {
      if (!result?.success) {
        setBetOnNumber(prev => ({ ...prev, [num]: Math.max(0, (prev[num] || 0) - betAmount) }));
        setTotalBetPlaced(prev => Math.max(0, prev - betAmount));
      }
    }).finally(() => {
      setIsPlacingBet(false);
    });
  };

  return (
    <div className="space-y-2 p-2 relative">
      <WinPopup 
        show={showWinPopup} 
        amount={winAmount} 
        multiplier={won ? MULTIPLIER : undefined}
        emoji={game?.game_emoji || "🎯"}
        logoUrl={game?.logo_url}
        message={won ? "PERFECT!" : "Try Again!"}
        isWin={won === true}
      />

      {/* Recent Results with Timer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-purple-950/80 to-pink-950/80 rounded-xl border border-purple-500/30 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          {/* Timer - Left Side */}
          <div className={cn(
            "px-2 py-1 rounded-lg font-bold text-sm tabular-nums min-w-[40px] text-center",
            autoPlayPhase === 'betting' 
              ? autoPlayTimeLeft <= 5 
                ? "bg-red-500/30 text-red-400 animate-pulse" 
                : "bg-amber-500/30 text-amber-400"
              : "bg-purple-500/30 text-purple-400"
          )}>
            {autoPlayPhase === 'betting' ? `${autoPlayTimeLeft}s` : '🎯'}
          </div>
          
          <span className="text-[10px] text-purple-300 font-semibold whitespace-nowrap">🎯 History:</span>
          <div className="flex gap-1.5">
            {recentResults.length === 0 ? (
              <span className="text-[10px] text-gray-500">No results yet</span>
            ) : (
              recentResults.slice(0, 6).map((num, i) => (
                <motion.div
                  key={`${num}-${i}`}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shadow-lg text-[10px] font-bold text-white border border-white/20",
                    `bg-gradient-to-br ${NUMBER_COLORS[num - 1]}`
                  )}
                >
                  {num}
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Game Area - Space Theme */}
      <div className="relative rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-2xl p-4"
        style={{
          background: 'linear-gradient(180deg, #0f0a1f 0%, #1a0f2e 40%, #2a1a4a 100%)'
        }}
      >
        {/* Countdown Overlay */}
        <AnimatePresence>
          {countdown !== null && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 3, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-30 bg-black/60 backdrop-blur-sm"
            >
              <motion.span 
                className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400"
                animate={{ scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                style={{
                  textShadow: '0 0 40px rgba(168, 85, 247, 0.8), 0 0 80px rgba(168, 85, 247, 0.4)'
                }}
              >
                {countdown}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Stars Background */}
        <div className="absolute inset-0 overflow-hidden">
          {stars.map((star) => (
            <motion.div
              key={star.id}
              className="absolute rounded-full bg-white"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
              }}
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2 + Math.random(), repeat: Infinity, delay: star.delay }}
            />
          ))}
        </div>

        {/* Timer */}
        {autoPlayPhase === 'betting' && (
          <motion.div 
            className="absolute top-2 right-2 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-purple-500/40">
              <div className="text-purple-400 text-xl font-bold tabular-nums">{autoPlayTimeLeft}s</div>
            </div>
          </motion.div>
        )}

        {/* Multiplier Badge */}
        <div className="flex justify-center mb-4">
          <motion.div 
            className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-2 rounded-full shadow-lg border border-white/20"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-white font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Pick a Number · {MULTIPLIER}x Win!
              <Sparkles className="w-4 h-4" />
            </span>
          </motion.div>
        </div>

        {/* Winner Display */}
        <AnimatePresence>
          {(winningNumber || revealingNumber) && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="flex justify-center mb-4"
            >
              <motion.div 
                className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black text-white shadow-2xl border-2 border-white/30",
                  winningNumber 
                    ? `bg-gradient-to-br ${NUMBER_COLORS[winningNumber - 1]}` 
                    : revealingNumber 
                      ? `bg-gradient-to-br ${NUMBER_COLORS[revealingNumber - 1]}`
                      : "bg-purple-600"
                )}
                animate={isRevealing ? { rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] } : { scale: [1, 1.1, 1] }}
                transition={{ duration: isRevealing ? 0.1 : 0.5, repeat: isRevealing ? Infinity : winningNumber ? 3 : 0 }}
                style={{
                  boxShadow: `0 0 40px ${winningNumber ? 'rgba(168, 85, 247, 0.6)' : 'rgba(168, 85, 247, 0.3)'}`
                }}
              >
                {winningNumber || revealingNumber || '?'}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Number Grid - 2 Rows of 5 */}
        <div className="grid grid-cols-5 gap-2">
          {NUMBERS.map((num) => (
            <motion.button
              key={num}
              onClick={() => handleSelectNumber(num)}
              disabled={isPlacingBet || betAmount > userCoins || autoPlayPhase !== 'betting'}
              whileHover={{ scale: autoPlayPhase === 'betting' ? 1.1 : 1 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "relative aspect-square rounded-xl border-2 transition-all overflow-hidden",
                selectedNumbers.has(num) 
                  ? "border-white/60 ring-2 ring-white/40" 
                  : "border-white/20",
                winningNumber === num && "ring-4 ring-yellow-400 border-yellow-400",
                (isPlacingBet || betAmount > userCoins || autoPlayPhase !== 'betting') && "opacity-60"
              )}
            >
              {/* Background Gradient */}
              <div className={cn(
                "absolute inset-0",
                `bg-gradient-to-br ${NUMBER_COLORS[num - 1]}`
              )} />
              
              {/* Shine Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/30" />
              
              {/* Number */}
              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                <span className="text-2xl font-black text-white drop-shadow-lg">{num}</span>
                
                {/* Bet Amount */}
                {betOnNumber[num] > 0 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-lg"
                  >
                    {formatBetAmount(betOnNumber[num])}
                  </motion.div>
                )}
              </div>
              
              {/* Winner Glow */}
              {winningNumber === num && (
                <motion.div 
                  className="absolute inset-0 bg-yellow-400/30"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}
            </motion.button>
          ))}
        </div>

        {/* Revealing Indicator */}
        {isRevealing && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mt-4"
          >
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-2 rounded-full text-white text-sm font-bold shadow-lg">
              ✨ Revealing Lucky Number...
            </div>
          </motion.div>
        )}
      </div>

      {/* Total Bet */}
      {totalBetPlaced > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl py-2 border border-purple-500/30"
        >
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="text-purple-400 text-sm font-bold">
            Total Bet: {formatBetAmount(totalBetPlaced)}
          </span>
        </motion.div>
      )}
    </div>
  );
}

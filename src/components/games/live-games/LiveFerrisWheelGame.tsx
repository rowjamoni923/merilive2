import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShimmerEffect, ParticleField } from "../common/ShimmerEffect";
import { useGameSoundManager } from "@/hooks/useGameSoundManager";
import { useLiveGameEffects } from "@/hooks/useLiveGameEffects";
import { WinPopup, formatBetDisplay } from "../common/WinPopup";

interface LiveFerrisWheelGameProps {
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

// Wheel items with 3D realistic icons (clockwise from top)
// Wheel items with emojis (since external 3D images don't load reliably)
const WHEEL_ITEMS = [
  { id: 1, emoji: "🎁", name: "Gift", multiplier: 45, color: "from-pink-500 to-purple-600" },
  { id: 2, emoji: "🎈", name: "Balloon", multiplier: 5, color: "from-pink-400 to-rose-500" },
  { id: 3, emoji: "⭐", name: "Star", multiplier: 10, color: "from-yellow-400 to-amber-500" },
  { id: 4, emoji: "🐷", name: "Pig", multiplier: 25, color: "from-pink-300 to-pink-500" },
  { id: 5, emoji: "💣", name: "Bomb", multiplier: 5, color: "from-gray-600 to-gray-800" },
  { id: 6, emoji: "🍊", name: "Orange", multiplier: 5, color: "from-orange-400 to-orange-600" },
  { id: 7, emoji: "🍇", name: "Grapes", multiplier: 15, color: "from-purple-400 to-purple-600" },
  { id: 8, emoji: "🍓", name: "Strawberry", multiplier: 5, color: "from-red-400 to-red-600" },
];

// Auto-play timing (25 seconds betting + 5 seconds spinning = 30 second cycle)
const AUTO_PLAY_BETTING_TIME = 25000;
const AUTO_PLAY_SPIN_TIME = 5000;

export function LiveFerrisWheelGame({
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
}: LiveFerrisWheelGameProps) {
  // Track bets per food item
  const [selectedFoods, setSelectedFoods] = useState<Set<number>>(new Set());
  const [betAmountsPerFood, setBetAmountsPerFood] = useState<Record<number, number>>({});
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningIndex, setWinningIndex] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  // showResultPopup removed - result emoji already shown in Results strip
  const [recentResults, setRecentResults] = useState<number[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [totalBetPlaced, setTotalBetPlaced] = useState(0);
  
  // 24/7 Auto-play state - SINGLE TIMER SYSTEM
  const [autoPlayPhase, setAutoPlayPhase] = useState<'betting' | 'spinning'>('betting');
  const [autoPlayTimeLeft, setAutoPlayTimeLeft] = useState(25);
  const [roundCounter, setRoundCounter] = useState(0);

  // Use centralized sound manager - only plays when this game is active
  const sounds = useGameSoundManager('ferris-wheel');
  const liveEffects = useLiveGameEffects();
  const isMountedRef = useRef(true);
  
  // CRITICAL: Use refs to access current state in autoSpinWheel (closure fix)
  const selectedFoodsRef = useRef<Set<number>>(new Set());
  const betAmountsPerFoodRef = useRef<Record<number, number>>({});
  const totalBetPlacedRef = useRef<number>(0);
  
  // Keep refs in sync with state
  useEffect(() => {
    selectedFoodsRef.current = selectedFoods;
  }, [selectedFoods]);
  
  useEffect(() => {
    betAmountsPerFoodRef.current = betAmountsPerFood;
  }, [betAmountsPerFood]);
  
  useEffect(() => {
    totalBetPlacedRef.current = totalBetPlaced;
  }, [totalBetPlaced]);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set sound mute state
  useEffect(() => {
    sounds.setMuted(!isSoundEnabled);
  }, [isSoundEnabled, sounds]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      sounds.stopAllSounds();
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [sounds]);

  // Notify parent of timer updates
  useEffect(() => {
    onTimerUpdate?.(autoPlayTimeLeft, autoPlayPhase);
  }, [autoPlayTimeLeft, autoPlayPhase, onTimerUpdate]);

  // 24/7 Auto-play cycle - SINGLE TIMER SYSTEM controlled by roundCounter
  useEffect(() => {
    let bettingTimer: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    
    // Reset for new round
    setAutoPlayPhase('betting');
    setAutoPlayTimeLeft(25);
    setWinningIndex(null);
    setSelectedFoods(new Set());
    setBetAmountsPerFood({});
    setTotalBetPlaced(0);
    setIsSpinning(false);
    setWon(null);
    setShowWinPopup(false);
    
    // Countdown timer - SINGLE instance per round
    countdownInterval = setInterval(() => {
      setAutoPlayTimeLeft(prev => {
        if (prev <= 1) {
          if (countdownInterval) clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // After betting time, start spinning
    bettingTimer = setTimeout(() => {
      if (countdownInterval) clearInterval(countdownInterval);
      setAutoPlayPhase('spinning');
      runSpin();
    }, AUTO_PLAY_BETTING_TIME);
    
    return () => {
      if (bettingTimer) clearTimeout(bettingTimer);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [roundCounter]);

  // Spin function - runs when betting phase ends
  const runSpin = async () => {
    setIsSpinning(true);
    sounds.playFerrisWheelSpin();
    liveEffects.play('spin');
    
    if (navigator.vibrate) navigator.vibrate(100);

    // Determine winner with weighted probability
    const random = Math.random();
    const weights = WHEEL_ITEMS.map(item => 1 / item.multiplier);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    let winIndex = 0;
    
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i] / totalWeight;
      if (random < cumulative) {
        winIndex = i;
        break;
      }
    }

    // Animate wheel
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    sounds.playFerrisWheelStop();
    
    setWinningIndex(winIndex);
    setIsSpinning(false);
    setRecentResults(prev => [winIndex, ...prev.slice(0, 9)]);

    // Use REFS to access current bet state (closure fix)
    const currentSelectedFoods = selectedFoodsRef.current;
    const currentBetAmounts = betAmountsPerFoodRef.current;
    const currentTotalBetPlaced = totalBetPlacedRef.current;
    
    let totalWinnings = 0;
    const winningMultiplier = WHEEL_ITEMS[winIndex].multiplier;
    
    // Check EACH bet the user placed
    currentSelectedFoods.forEach(foodIndex => {
      const betOnThisFood = currentBetAmounts[foodIndex] || 0;
      if (foodIndex === winIndex && betOnThisFood > 0) {
        totalWinnings += betOnThisFood * winningMultiplier;
        console.log(`[FerrisWheel] ✅ WON on ${WHEEL_ITEMS[foodIndex]?.emoji}! ${betOnThisFood} × ${winningMultiplier}x`);
      }
    });
    
    // IMPORTANT: Show WIN first, LOSS only if no win
    if (totalWinnings > 0) {
      setWon(true);
      setWinAmount(totalWinnings);
      setShowWinPopup(true);
      sounds.playWinSound();
      sounds.playCoinSound();
      liveEffects.play('win');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      
      // Credit winnings
      const creditWinnings = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          
          const { processWin } = await import('@/services/gameBalanceService');
          const result = await processWin(user.id, 'ferris_wheel', 'Ferris Wheel', Math.floor(totalWinnings), winningMultiplier, false);
          
          if (result.success && result.newBalance !== undefined && onUpdateCoins) {
            onUpdateCoins(result.newBalance);
          }
        } catch (error) {
          console.error('[FerrisWheel] Credit error:', error);
        }
      };
      creditWinnings();
      onGameWin?.(totalWinnings);
      setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 3000);
    } else if (currentSelectedFoods.size > 0) {
      // LOSS - only show after confirming no win
      setWon(false);
      setWinAmount(currentTotalBetPlaced);
      setShowWinPopup(true);
      sounds.playLoseSound();
      liveEffects.play('lose');
      setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 3000);
    }

    onProcessResult(winIndex.toString());
    
    // CRITICAL: Trigger next round via roundCounter - NO duplicate timer
    setTimeout(() => {
      if (isMountedRef.current) {
        setRoundCounter(prev => prev + 1);
      }
    }, 3000);
  };

  // Allow multiple concurrent bets on different foods - INSTANT, non-blocking
  const handleSelectFood = (index: number) => {
    if (autoPlayPhase !== 'betting') return;
    if (betAmount > userCoins) return;

    const stake = betAmount;
    // Instant UI update BEFORE API call
    setSelectedFoods(prev => new Set([...prev, index]));
    setBetAmountsPerFood(prev => ({ ...prev, [index]: (prev[index] || 0) + stake }));
    setTotalBetPlaced(prev => prev + stake);

    sounds.playBetSound();
    liveEffects.play('bet');

    // Fire-and-forget: never block subsequent taps
    onPlaceBet('ferris_wheel', index.toString()).then(result => {
      if (!result?.success) {
        setSelectedFoods(prev => {
          const newSet = new Set(prev);
          if ((betAmountsPerFood[index] || 0) <= stake) newSet.delete(index);
          return newSet;
        });
        setBetAmountsPerFood(prev => ({ ...prev, [index]: Math.max(0, (prev[index] || 0) - stake) }));
        setTotalBetPlaced(prev => Math.max(0, prev - stake));
      }
    });
  };

  return (
    <div className="space-y-2 p-2 relative live-game-premium-panel">
      <div ref={liveEffects.bindLayer} className="live-game-fx-layer" aria-hidden="true" />
      {/* Win/Lose Popup - Enhanced with Game Logo */}
      <WinPopup 
        show={showWinPopup} 
        amount={winAmount} 
        multiplier={won && winningIndex !== null ? WHEEL_ITEMS[winningIndex].multiplier : undefined}
        emoji={game?.game_emoji || (winningIndex !== null ? WHEEL_ITEMS[winningIndex].emoji : "🎡")}
        logoUrl={game?.logo_url}
        message={won ? "WINNER!" : "Try Again!"}
        isWin={won === true}
      />

      {/* Recent Results History Bar with Timer - Inside Game Board */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-black/40 rounded-lg overflow-x-auto scrollbar-hide">
        {/* Large Premium Timer - Left Side */}
        <div className={cn(
          "px-3 py-1.5 rounded-xl font-bold text-lg tabular-nums min-w-[50px] text-center flex-shrink-0 shadow-lg border",
          autoPlayPhase === 'betting' 
            ? autoPlayTimeLeft <= 5 
              ? "bg-red-500/40 text-red-300 animate-pulse border-red-500/50 shadow-red-500/20" 
              : "bg-gradient-to-r from-cyan-600/40 to-blue-600/40 text-cyan-300 border-cyan-500/40 shadow-cyan-500/20"
            : "bg-purple-500/40 text-purple-300 border-purple-500/50"
        )}>
          {autoPlayPhase === 'betting' ? `${autoPlayTimeLeft}s` : '🎡'}
        </div>
        
        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">Results:</span>
        <div className="flex gap-1">
          {recentResults.length === 0 ? (
            <span className="text-[10px] text-gray-500">-</span>
          ) : (
            recentResults.map((idx, i) => (
              <motion.div
                key={`${idx}-${i}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-6 h-6 rounded-full flex items-center justify-center bg-white/90 shadow-md border border-amber-300"
              >
                <span className="text-sm">{WHEEL_ITEMS[idx]?.emoji}</span>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* WIN/LOSE popup only - Result emoji is shown in Results strip */}

      {/* Premium Ferris Wheel Container */}
      <div className="relative bg-gradient-to-b from-indigo-900/50 via-purple-900/40 to-indigo-900/50 rounded-2xl p-3 border-2 border-purple-500/40 shadow-2xl overflow-hidden">
        {/* Background Particles */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-purple-400/40 rounded-full"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
              }}
              animate={{ 
                y: [-10, 10, -10],
                opacity: [0.3, 1, 0.3]
              }}
              transition={{ 
                duration: 2 + Math.random() * 2, 
                repeat: Infinity, 
                delay: i * 0.3
              }}
            />
          ))}
        </div>

        <div className="relative flex justify-center items-center py-2">
          <div className="relative w-56 h-56">
            {/* Wheel Support Structure */}
            <div className="absolute bottom-[-8px] left-1/2 -translate-x-1/2 w-3 h-12 bg-gradient-to-b from-gray-400 to-gray-600 rounded-b-lg shadow-lg" />
            <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-16 h-2 bg-gradient-to-r from-gray-500 via-gray-400 to-gray-500 rounded-lg shadow-lg" />
            
            {/* Spinning Wheel - Code-based design */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ rotate: isSpinning ? 1080 : 0 }}
              transition={{ duration: 5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {/* Wheel Background */}
              <div className="absolute w-52 h-52 rounded-full shadow-2xl" 
                style={{ 
                  background: 'conic-gradient(from 0deg, #8b5cf6, #6366f1, #3b82f6, #06b6d4, #10b981, #22c55e, #eab308, #f97316, #ef4444, #ec4899, #8b5cf6)',
                  boxShadow: '0 0 30px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(0,0,0,0.3)'
                }}
              />
              
              {/* Inner Ring */}
              <div className="absolute w-44 h-44 rounded-full bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 shadow-inner" />
              
              {/* Section Dividers */}
              {WHEEL_ITEMS.map((_, i) => (
                <div key={i} className="absolute" style={{ transform: `rotate(${i * 45}deg)` }}>
                  <div className="w-0.5 h-[104px] bg-white/30"
                    style={{ transformOrigin: "bottom center", position: "absolute", bottom: "50%", left: "calc(50% - 1px)" }}
                  />
                </div>
              ))}

              {/* Food Items with Images */}
              {WHEEL_ITEMS.map((item, i) => {
                const angle = (i * 45 - 90) * (Math.PI / 180);
                const radius = 80;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                
                const isWinner = winningIndex === i;
                const isSelected = selectedFoods.has(i);

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => handleSelectFood(i)}
                    className={cn(
                      "absolute w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg",
                      "bg-white/95 border-2",
                      isSelected && "border-green-400 ring-2 ring-green-300/60 scale-110",
                      isWinner && "border-yellow-400 ring-3 ring-yellow-300/70 scale-115",
                      !isSelected && !isWinner && "border-white/50"
                    )}
                    style={{
                      left: `calc(50% + ${x}px - 22px)`,
                      top: `calc(50% + ${y}px - 22px)`,
                    }}
                    whileHover={{ scale: autoPlayPhase === "betting" ? 1.15 : 1 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={autoPlayPhase !== "betting"}
                  >
                    {/* Food Emoji */}
                    <motion.span 
                      className="text-xl drop-shadow-sm"
                      animate={isWinner ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] } : {}}
                      transition={{ duration: 0.4, repeat: isWinner ? Infinity : 0 }}
                    >
                      {item.emoji}
                    </motion.span>
                    {/* Multiplier Badge */}
                    <span className={cn(
                      "absolute -bottom-1.5 text-[7px] font-black px-1.5 py-0.5 rounded-full",
                      `bg-gradient-to-r ${item.color} text-white shadow-sm`
                    )}>
                      {item.multiplier}x
                    </span>
                    {/* Bet Amount Badge */}
                    {betAmountsPerFood[i] > 0 && (
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ 
                          scale: 1,
                          rotate: isSpinning ? -1080 : 0
                        }}
                        transition={{ 
                          scale: { duration: 0.2 },
                          rotate: { duration: 5, ease: [0.2, 0.8, 0.2, 1] }
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-lg border-2 border-white z-10"
                      >
                        {formatBetDisplay(betAmountsPerFood[i])}
                      </motion.span>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>

            {/* FIXED Winner Pointer/Arrow - Does NOT rotate */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="relative">
                {/* Arrow pointing down */}
                <div 
                  className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-red-500 drop-shadow-lg"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                />
                {/* Glowing effect */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-400 rounded-full blur-sm animate-pulse" />
              </div>
            </div>

            {/* FIXED Outer Ring/Frame - Does NOT rotate */}
            <div className="absolute inset-[-4px] rounded-full border-4 border-purple-500/60 pointer-events-none z-10" 
              style={{ 
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.4), inset 0 0 15px rgba(168, 85, 247, 0.2)'
              }}
            />

            {/* Center - Timer is now shown in the game board header, not here */}
            {/* Removed duplicate timer display */}
          </div>
        </div>

        {/* Win Celebration Particles */}
        <AnimatePresence>
          {won && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
            >
              <ParticleField count={30} color="#fbbf24" />
              {/* Extra confetti */}
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-sm"
                  style={{
                    background: ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#a855f7'][i % 5],
                    left: '50%',
                    top: '50%',
                  }}
                  animate={{
                    x: [0, (Math.random() - 0.5) * 150],
                    y: [0, (Math.random() - 0.5) * 150],
                    rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
                    opacity: [1, 0],
                  }}
                  transition={{ duration: 1.5, delay: i * 0.05 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bet controls removed - using LiveGameBoard's unified bet controls at bottom */}

      {/* Multiplier Info Grid removed - info already shown on wheel pods */}

      {/* Current Bet display removed - using LiveGameBoard's unified controls */}

      {/* Total Bet Display */}
      {totalBetPlaced > 0 && (
        <div className="text-center text-[10px] text-amber-300 bg-amber-500/20 rounded-lg py-1 mt-1">
          Total Bet: {totalBetPlaced.toLocaleString()} on {selectedFoods.size} food(s)
        </div>
      )}

      {/* Result Display */}
      <AnimatePresence>
        {winningIndex !== null && selectedFoods.size > 0 && won !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "relative p-3 rounded-lg text-center font-bold overflow-hidden",
              won 
                ? "bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-500/50" 
                : "bg-gradient-to-r from-red-500/30 to-rose-500/30 border border-red-500/50"
            )}
          >
            {won && <ShimmerEffect intensity="high" />}
            {won && <ParticleField count={12} color="#22c55e" />}
            
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">{WHEEL_ITEMS[winningIndex].emoji}</span>
              <div>
                <span className={cn("relative z-10 text-sm", won ? "text-green-400" : "text-red-400")}>
                  {won ? `🎉 Won ${WHEEL_ITEMS[winningIndex].multiplier}x!` : "Better luck next time!"}
                </span>
                {won && (
                  <div className="flex items-center justify-center gap-1 text-green-300 text-xs">
                    <span>+{winAmount.toLocaleString()}</span>
                    <Coins className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

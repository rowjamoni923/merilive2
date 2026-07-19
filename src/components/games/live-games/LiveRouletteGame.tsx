import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import rouletteBg from "@/assets/games-bg/roulette-bg.jpg";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ShimmerEffect, ParticleField } from "../common/ShimmerEffect";
import { useGameSoundManager } from "@/hooks/useGameSoundManager";
import { useLiveGameEffects } from "@/hooks/useLiveGameEffects";
import { WinPopup, formatBetDisplay } from "../common/WinPopup";

interface LiveRouletteGameProps {
  game: any;
  betAmount: number;
  setBetAmount: (amount: number) => void;
  userDiamonds: number;
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

// EUROPEAN ROULETTE - Official Red Numbers (VERIFIED STANDARD)
// Red: 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
// Black: 2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35
// Green: 0
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// European Roulette wheel order (AUTHENTIC - clockwise from 0)
// This is the official European single-zero wheel layout
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// Helper function to get color for any number
const getNumberColor = (num: number): 'red' | 'black' | 'green' => {
  if (num === 0) return 'green';
  if (RED_NUMBERS.includes(num)) return 'red';
  return 'black';
};

const NUMBERS = Array.from({ length: 37 }, (_, i) => i);

// --- Professional SVG wheel helpers (premium casino look, GPU-smooth) ---
const SEG_ANGLE = 360 / WHEEL_ORDER.length; // ≈ 9.73°
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};
const arcPath = (
  cx: number, cy: number,
  rOuter: number, rInner: number,
  startDeg: number, endDeg: number,
) => {
  const p1 = polar(cx, cy, rOuter, startDeg);
  const p2 = polar(cx, cy, rOuter, endDeg);
  const p3 = polar(cx, cy, rInner, endDeg);
  const p4 = polar(cx, cy, rInner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
};

// Premium ivory ball that orbits the outer track on a single rotating layer.
// Pure CSS transform = no jitter, no keyframe bounce. Lands at top (12 o'clock)
// where the winning segment sits after the wheel settles.
const RouletteBall = ({ isSpinning }: { isSpinning: boolean; finalAngle: number }) => {
  return (
    <motion.div
      className="absolute inset-0 z-50 pointer-events-none"
      style={{ willChange: 'transform' }}
      animate={{ rotate: isSpinning ? -1440 : 0 }}
      transition={
        isSpinning
          ? { duration: 4, ease: [0.15, 0.85, 0.15, 1] }
          : { duration: 0.6, ease: 'easeOut' }
      }
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 14,
          height: 14,
          left: '50%',
          top: 6,
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle at 30% 28%, #ffffff 0%, #f4f4f4 28%, #d6d6d6 60%, #8e8e8e 100%)',
          boxShadow:
            '0 2px 6px rgba(0,0,0,0.85), inset 0 2px 3px rgba(255,255,255,0.95), inset 0 -2px 3px rgba(0,0,0,0.35)',
        }}
      />
    </motion.div>
  );
};


// Auto-play interval (25 seconds betting + 5 seconds spinning = 30 second cycle)
const AUTO_PLAY_BETTING_TIME = 25000; // 25 seconds betting phase
const AUTO_PLAY_SPIN_TIME = 5000; // 5 seconds spin animation

export function LiveRouletteGame({
  game,
  betAmount,
  setBetAmount,
  userDiamonds,
  phase,
  timeLeft,
  currentRound,
  bets,
  myBets,
  onPlaceBet,
  onProcessResult,
  onUpdateCoins,
  onGameWin,
  onTimerUpdate
}: LiveRouletteGameProps) {
  // Multi-bet support - track bets per option
  const [selectedBets, setSelectedBets] = useState<Set<string>>(new Set());
  const [betAmountsPerOption, setBetAmountsPerOption] = useState<Record<string, number>>({});
  const [totalBetPlaced, setTotalBetPlaced] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  // showResultPopup removed - result number already shown in Results strip
  const [recentResults, setRecentResults] = useState<number[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [autoPlayPhase, setAutoPlayPhase] = useState<'betting' | 'spinning'>('betting');
  const [autoPlayTimeLeft, setAutoPlayTimeLeft] = useState(25);
  const [winningSegmentIndex, setWinningSegmentIndex] = useState(0); // Track winning segment for ball position
  
  // Multipliers from Admin Panel
  const [adminMultipliers, setAdminMultipliers] = useState<Record<string, number>>({
    zero: 33,
    red: 2,
    black: 2,
    even: 2,
    odd: 2,
    low: 2,
    high: 2,
  });
  
  // Use centralized sound manager - only plays when this game is active
  const sounds = useGameSoundManager('roulette');
  const { bindLayer, play: playLiveEffect } = useLiveGameEffects();
  const isMountedRef = useRef(true);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSpinningRef = useRef(false); // Guard against duplicate spins
  const resultShownRef = useRef(false); // Guard against duplicate result processing
  
  // CRITICAL: Use refs to access current state in autoSpinWheel (closure fix)
  const selectedBetsRef = useRef<Set<string>>(new Set());
  const betAmountsPerOptionRef = useRef<Record<string, number>>({});
  const totalBetPlacedRef = useRef<number>(0);
  const adminMultipliersRef = useRef<Record<string, number>>({
  });
  
  // Keep refs in sync with state
  useEffect(() => {
    selectedBetsRef.current = selectedBets;
  }, [selectedBets]);
  
  useEffect(() => {
    betAmountsPerOptionRef.current = betAmountsPerOption;
  }, [betAmountsPerOption]);
  
  useEffect(() => {
    totalBetPlacedRef.current = totalBetPlaced;
  }, [totalBetPlaced]);
  
  useEffect(() => {
    adminMultipliersRef.current = adminMultipliers;
  }, [adminMultipliers]);

  // Fetch multipliers from Admin Panel (game_settings.rules.bet_multipliers)
  useEffect(() => {
    const fetchMultipliers = async () => {
      const { data } = await supabase
        .from('game_settings')
        .select('rules')
        .eq('game_id', 'roulette')
        .single();
      
      if (data?.rules && typeof data.rules === 'object') {
        const rules = data.rules as Record<string, any>;
        if (rules.bet_multipliers && Array.isArray(rules.bet_multipliers)) {
          const multiplierMap: Record<string, number> = {};
          rules.bet_multipliers.forEach((m: any) => {
            multiplierMap[m.bet_type] = m.multiplier;
          });
          setAdminMultipliers(prev => ({ ...prev, ...multiplierMap }));
          console.log('[Roulette] Loaded multipliers from Admin:', multiplierMap);
        }
      }
    };
    
    fetchMultipliers();
  }, []);

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

  // Round counter to trigger new cycles - SINGLE TIMER SYSTEM
  const [roundCounter, setRoundCounter] = useState(0);
  
  // AUTO-PLAY SYSTEM - Game runs 24/7 automatically every 25-30 seconds
  // CRITICAL: Only ONE timer system - controlled by roundCounter
  useEffect(() => {
    let bettingTimer: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    
    // Reset for new round
    setAutoPlayPhase('betting');
    setAutoPlayTimeLeft(25);
    setResult(null);
    setSelectedBets(new Set());
    setBetAmountsPerOption({});
    setTotalBetPlaced(0);
    setWon(null);
    setShowWinPopup(false);
    setRotation(0);
    
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
    
    // After betting phase, auto-spin
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
    if (!isMountedRef.current) return;
    // GUARD: Prevent duplicate spin calls
    if (isSpinningRef.current) {
      console.log('[Roulette] ⚠️ Spin already in progress, skipping');
      return;
    }
    isSpinningRef.current = true;
    resultShownRef.current = false;
    
    setIsSpinning(true);
    sounds.playRouletteWheelSpin();
    playLiveEffect('spin');
    
    // Generate random winning number using WHEEL_ORDER for authentic positioning
    const randomIndex = Math.floor(Math.random() * WHEEL_ORDER.length);
    const winningNumber = WHEEL_ORDER[randomIndex];
    
    console.log('[Roulette] ✅ Winning number:', winningNumber, '| Color:', getNumberColor(winningNumber).toUpperCase());
    
    setWinningSegmentIndex(randomIndex);
    
    const degreePerSlot = 360 / 37;
    const currentAngleOfWinningSegment = randomIndex * degreePerSlot;
    const rotationToTop = 360 - currentAngleOfWinningSegment;
    const fullRotations = 5 + Math.floor(Math.random() * 3);
    const totalRotation = (fullRotations * 360) + rotationToTop;
    
    setRotation(totalRotation);
    
    // Wait for spin animation
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    if (!isMountedRef.current) { isSpinningRef.current = false; return; }
    // GUARD: Only process result once per spin
    if (resultShownRef.current) { isSpinningRef.current = false; return; }
    resultShownRef.current = true;
    
    sounds.playRouletteBallDrop();
    setResult(winningNumber);
    setRecentResults(prev => [winningNumber, ...prev.slice(0, 9)]);
    
    // Use REFS to access current bet state (closure fix)
    const currentSelectedBets = selectedBetsRef.current;
    const currentBetAmounts = betAmountsPerOptionRef.current;
    const currentTotalBetPlaced = totalBetPlacedRef.current;
    
    // Check if user won (if they placed any bets)
    if (currentSelectedBets.size > 0) {
      const resultColor = getNumberColor(winningNumber);
      const isRedResult = resultColor === 'red';
      const isBlackResult = resultColor === 'black';
      const isOdd = winningNumber !== 0 && winningNumber % 2 === 1;
      const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
      const isLow = winningNumber >= 1 && winningNumber <= 18;
      const isHigh = winningNumber >= 19 && winningNumber <= 36;
      
      let totalWinnings = 0;
      const MULTIPLIERS = adminMultipliersRef.current;
      
      currentSelectedBets.forEach(betType => {
        let isWinner = false;
        const betAmt = currentBetAmounts[betType] || 0;
        const multiplier = MULTIPLIERS[betType] || 2;
        
        switch (betType) {
          case 'zero': isWinner = winningNumber === 0; break;
          case 'red': isWinner = isRedResult; break;
          case 'black': isWinner = isBlackResult; break;
          case 'even': isWinner = isEven; break;
          case 'odd': isWinner = isOdd; break;
          case 'low': isWinner = isLow; break;
          case 'high': isWinner = isHigh; break;
        }
        
        if (isWinner) {
          totalWinnings += betAmt * multiplier;
          console.log(`[Roulette] ✅ WON on ${betType}! ${betAmt} × ${multiplier}x = ${betAmt * multiplier}`);
        }
      });
      
      // IMPORTANT: Show WIN first, LOSS only if no win
      if (totalWinnings > 0) {
        setWon(true);
        setWinAmount(totalWinnings);
        setShowWinPopup(true);
        sounds.playWinSound();
        sounds.playCoinSound();
        playLiveEffect('win');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        
        // Credit winnings
        const creditWinnings = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { processWin } = await import('@/services/gameBalanceService');
            const result = await processWin(user.id, 'roulette', 'Roulette', Math.floor(totalWinnings), undefined, false);
            
            if (result.success && result.newBalance !== undefined && onUpdateCoins) {
              onUpdateCoins(result.newBalance);
            }
          } catch (error) {
            console.error('[Roulette] Credit error:', error);
          }
        };
        creditWinnings();
        onGameWin?.(totalWinnings);
        
        setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 2500);
      } else {
        // LOSS - only show after confirming no win
        setWon(false);
        setWinAmount(currentTotalBetPlaced);
        setShowWinPopup(true);
        sounds.playLoseSound();
        playLiveEffect('lose');
        setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 2000);
      }
      
    }
    
    // Always notify parent of round result so history/UI stays in sync even on no-bet rounds
    onProcessResult(winningNumber.toString());
    
    setIsSpinning(false);
    isSpinningRef.current = false;
    
    // CRITICAL: Trigger next round via roundCounter - NO duplicate timer
    setTimeout(() => {
      if (isMountedRef.current) {
        setRoundCounter(prev => prev + 1);
      }
    }, 3000);
  };

  // INSTANT multi-bet placement - fire-and-forget, never blocks other taps
  const handlePlaceBet = (type: string, value: string) => {
    if (autoPlayPhase !== 'betting') return;
    if (betAmount > userDiamonds) return;

    const currentBetAmount = betAmount;

    // Instant UI update BEFORE API call
    setSelectedBets(prev => new Set([...prev, type]));
    setBetAmountsPerOption(prev => ({ ...prev, [type]: (prev[type] || 0) + currentBetAmount }));
    setTotalBetPlaced(prev => prev + currentBetAmount);

    sounds.playBetSound();
    playLiveEffect('bet');

    // Fire API call in background - never block UI
    onPlaceBet('roulette', `${type}:${value}`).then(result => {
      if (!result?.success) {
        setBetAmountsPerOption(prev => {
          const newAmount = Math.max(0, (prev[type] || 0) - currentBetAmount);
          if (newAmount === 0) {
            setSelectedBets(s => {
              const newSet = new Set(s);
              newSet.delete(type);
              return newSet;
            });
          }
          return { ...prev, [type]: newAmount };
        });
        setTotalBetPlaced(prev => Math.max(0, prev - currentBetAmount));
      }
    });
  };

  // Use the centralized getNumberColor function for accurate color detection
  const isRed = (num: number) => getNumberColor(num) === 'red';
  const isBlack = (num: number) => getNumberColor(num) === 'black';
  const isGreen = (num: number) => getNumberColor(num) === 'green';

  return (
    <div className="space-y-2 p-1 relative live-game-premium-panel">
      <div ref={bindLayer} className="live-game-fx-layer" aria-hidden="true" />
      {/* Win/Lose Popup - Enhanced with Game Logo */}
      <WinPopup 
        show={showWinPopup} 
        amount={winAmount} 
        multiplier={won ? 2 : undefined}
        emoji={game?.game_emoji || "🎰"}
        logoUrl={game?.logo_url}
        message={won ? "JACKPOT!" : "Try Again!"}
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
            : "bg-green-500/40 text-green-300 border-green-500/50"
        )}>
          {autoPlayPhase === 'betting' ? `${autoPlayTimeLeft}s` : '🎰'}
        </div>
        
        <span className="text-[11px] text-amber-200 font-semibold whitespace-nowrap drop-shadow">Results:</span>
        <div className="flex gap-1">
          {recentResults.length === 0 ? (
            <span className="text-[10px] text-white/60">—</span>
          ) : (
            recentResults.map((num, i) => (
              <motion.div
                key={`${num}-${i}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-md",
                  num === 0 
                    ? "bg-gradient-to-br from-green-500 to-green-700" 
                    : isRed(num) 
                      ? "bg-gradient-to-br from-red-500 to-red-700"
                      : "bg-gradient-to-br from-gray-700 to-gray-900"
                )}
              >
                {num}
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* WIN/LOSE popup only - Result number is shown in Results strip */}

      {/* Premium Casino Roulette Container */}
      <div
        className="relative rounded-2xl p-4 border-2 border-amber-600/50 overflow-hidden shadow-[0_0_40px_rgba(212,175,55,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(5,20,10,0.6) 0%, rgba(5,20,10,0.78) 100%), url(${rouletteBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Casino Table Felt Texture */}
        <div className="absolute inset-0 rounded-2xl opacity-40" style={{
            radial-gradient(circle at 50% 30%, rgba(34,197,94,0.3) 0%, transparent 50%),
            radial-gradient(circle at 30% 70%, rgba(34,197,94,0.2) 0%, transparent 40%),
            radial-gradient(circle at 70% 70%, rgba(34,197,94,0.2) 0%, transparent 40%)
          `,
        }} />
        
        {/* Golden Border Glow */}
        <div className="absolute inset-0 rounded-2xl border border-amber-500/20" />

        {/* Wheel Layout - Larger and More Premium */}
        <div className="flex items-center justify-center gap-3 relative z-10">
          {/* Left Side - Red & Even - Larger Chips */}
          <div className="flex flex-col gap-2 w-16">
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05, y: -2 }}
              onClick={() => handlePlaceBet('red', 'red')}
              disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
              className={cn(
                "relative h-14 rounded-xl font-bold disabled:opacity-40 flex flex-col items-center justify-center shadow-xl overflow-hidden",
                "bg-gradient-to-br from-red-500 via-red-600 to-red-800 border-2",
                selectedBets.has('red') 
                  ? "border-yellow-400 ring-2 ring-yellow-400/50 shadow-yellow-400/30"
                  : "border-red-400/60"
              )}
            >
              {/* Bet Amount Badge */}
              {betAmountsPerOption['red'] > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                  {formatBetDisplay(betAmountsPerOption['red'])}
                </span>
              )}
              {/* Chip shine effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
              <span className="text-white font-black text-xs drop-shadow-lg relative z-10">Red</span>
              <span className="text-yellow-200 text-[10px] font-bold bg-black/30 px-2 rounded-full relative z-10">({adminMultipliers.red || 2}x)</span>
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05, y: -2 }}
              onClick={() => handlePlaceBet('even', 'even')}
              disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
              className={cn(
                "relative h-14 rounded-xl font-bold disabled:opacity-40 flex flex-col items-center justify-center shadow-xl overflow-hidden",
                "bg-gradient-to-br from-purple-500 via-purple-600 to-purple-800 border-2",
                selectedBets.has('even') 
                  ? "border-yellow-400 ring-2 ring-yellow-400/50 shadow-yellow-400/30"
                  : "border-purple-400/60"
              )}
            >
              {/* Bet Amount Badge */}
              {betAmountsPerOption['even'] > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                  {formatBetDisplay(betAmountsPerOption['even'])}
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
              <span className="text-white font-black text-xs drop-shadow-lg relative z-10">Even</span>
              <span className="text-yellow-200 text-[10px] font-bold bg-black/30 px-2 rounded-full relative z-10">({adminMultipliers.even || 2}x)</span>
            </motion.button>
          </div>

          {/* Center - Premium Roulette Wheel - Cleaner Design */}
          <div className="relative h-52 w-52 flex items-center justify-center">
            {/* Outer Glow */}
            <motion.div
              className="absolute inset-[-10px] rounded-full"
              style={{ 
                background: 'radial-gradient(circle, rgba(218,165,32,0.4) 0%, transparent 60%)',
                filter: 'blur(8px)'
              }}
              animate={isSpinning ? { opacity: [0.4, 0.8, 0.4] } : { opacity: 0.3 }}
              transition={{ duration: 0.5, repeat: isSpinning ? Infinity : 0 }}
            />

            {/* Main Wheel — pro casino SVG (GPU-smooth single transform) */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ rotate: rotation }}
              transition={{ duration: 5, ease: [0.15, 0.85, 0.15, 1] }}
              style={{ willChange: 'transform' }}
            >
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
              >
                <defs>
                  <linearGradient id="rouletteGoldRim" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFE9A0" />
                    <stop offset="35%" stopColor="#D4AF37" />
                    <stop offset="55%" stopColor="#8B6914" />
                    <stop offset="100%" stopColor="#FFD86B" />
                  </linearGradient>
                  <radialGradient id="rouletteWood" cx="50%" cy="50%" r="60%">
                    <stop offset="0%" stopColor="#5C3D2E" />
                    <stop offset="100%" stopColor="#1F1108" />
                  </radialGradient>
                  <radialGradient id="rouletteHub" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#FFFDE4" />
                    <stop offset="40%" stopColor="#FFD700" />
                    <stop offset="80%" stopColor="#A07314" />
                    <stop offset="100%" stopColor="#5A3F0A" />
                  </radialGradient>
                </defs>

                {/* Outer gold rim */}
                <circle cx="100" cy="100" r="99" fill="url(#rouletteGoldRim)" />
                <circle cx="100" cy="100" r="96.5" fill="#0a0a0a" />

                {/* Number segments */}
                {WHEEL_ORDER.map((num, i) => {
                  const startDeg = i * SEG_ANGLE - SEG_ANGLE / 2;
                  const endDeg = startDeg + SEG_ANGLE;
                  const colorType = getNumberColor(num);
                  const fill =
                    colorType === 'green' ? '#0F8A3C'
                      : colorType === 'red' ? '#C8102E'
                      : '#141414';
                  return (
                    <path
                      key={`seg-${num}`}
                      d={arcPath(100, 100, 95, 38, startDeg, endDeg)}
                      fill={fill}
                      stroke="#D4AF37"
                      strokeWidth="0.35"
                    />
                  );
                })}

                {/* Numbers — crisp SVG text, stroke-on-fill for legibility */}
                {WHEEL_ORDER.map((num, i) => {
                  const angle = i * SEG_ANGLE;
                  const p = polar(100, 100, 78, angle);
                  return (
                    <text
                      key={`txt-${num}`}
                      x={p.x}
                      y={p.y}
                      fontSize="8.5"
                      fontWeight="800"
                      fill="#ffffff"
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${angle} ${p.x} ${p.y})`}
                      style={{
                        paintOrder: 'stroke',
                        stroke: 'rgba(0,0,0,0.85)',
                        strokeWidth: 0.9,
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      }}
                    >
                      {num}
                    </text>
                  );
                })}

                {/* Inner gold ring */}
                <circle cx="100" cy="100" r="38" fill="url(#rouletteGoldRim)" />
                <circle cx="100" cy="100" r="35" fill="url(#rouletteWood)" />

                {/* Hub */}
                <circle cx="100" cy="100" r="22" fill="url(#rouletteHub)" />
                <circle cx="100" cy="100" r="6" fill="#FFFDE4" opacity="0.85" />

                {/* Subtle highlight on rim */}
                <circle cx="100" cy="100" r="97.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
              </svg>
            </motion.div>

            
            {/* Ball OUTSIDE the rotating wheel container - positioned in screen coordinates */}
            {/* CRITICAL: Ball is placed OUTSIDE the motion.div so it doesn't rotate with the wheel */}
            {/* Ball stays fixed relative to the wheel container, points to winning number */}
            <RouletteBall 
              isSpinning={isSpinning} 
              finalAngle={rotation}
            />
            
            {/* ROULETTE: No arrow pointer - Ball is the main indicator */}
            {/* Arrow pointer is ONLY for Ferris Wheel, NOT for Roulette */}
            
            {/* Win Celebration */}
            <AnimatePresence>
              {won && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }} 
                  className="absolute inset-0 pointer-events-none"
                >
                  <ParticleField count={24} color="#fbbf24" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-2 w-16">
            {/* Zero Button - 33x Multiplier */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05, y: -2 }}
              onClick={() => handlePlaceBet('zero', 'zero')}
              disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
              className={cn(
                "relative h-10 rounded-xl font-bold disabled:opacity-40 flex flex-col items-center justify-center shadow-xl overflow-hidden",
                "bg-gradient-to-br from-green-500 via-green-600 to-green-800 border-2",
                selectedBets.has('zero') 
                  ? "border-yellow-400 ring-2 ring-yellow-400/50 shadow-yellow-400/30"
                  : "border-green-400/60"
              )}
            >
              {/* Bet Amount Badge */}
              {betAmountsPerOption['zero'] > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                  {formatBetDisplay(betAmountsPerOption['zero'])}
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
              <span className="text-white font-black text-base drop-shadow-lg relative z-10">0</span>
              <span className="text-yellow-200 text-[9px] font-bold bg-black/30 px-1.5 rounded-full relative z-10">({adminMultipliers.zero || 33}x)</span>
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05, y: -2 }}
              onClick={() => handlePlaceBet('black', 'black')}
              disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
              className={cn(
                "relative h-12 rounded-xl font-bold disabled:opacity-40 flex flex-col items-center justify-center shadow-xl overflow-hidden",
                "bg-gradient-to-br from-gray-600 via-gray-800 to-gray-950 border-2",
                selectedBets.has('black') 
                  ? "border-yellow-400 ring-2 ring-yellow-400/50 shadow-yellow-400/30"
                  : "border-gray-500/60"
              )}
            >
              {/* Bet Amount Badge */}
              {betAmountsPerOption['black'] > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                  {formatBetDisplay(betAmountsPerOption['black'])}
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/30" />
              <span className="text-white font-black text-xs drop-shadow-lg relative z-10">Black</span>
              <span className="text-yellow-200 text-[10px] font-bold bg-white/10 px-2 rounded-full relative z-10">({adminMultipliers.black || 2}x)</span>
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05, y: -2 }}
              onClick={() => handlePlaceBet('odd', 'odd')}
              disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
              className={cn(
                "relative h-12 rounded-xl font-bold disabled:opacity-40 flex flex-col items-center justify-center shadow-xl overflow-hidden",
                "bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 border-2",
                selectedBets.has('odd') 
                  ? "border-yellow-400 ring-2 ring-yellow-400/50 shadow-yellow-400/30"
                  : "border-indigo-400/60"
              )}
            >
              {/* Bet Amount Badge */}
              {betAmountsPerOption['odd'] > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                  {formatBetDisplay(betAmountsPerOption['odd'])}
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
              <span className="text-white font-black text-xs drop-shadow-lg relative z-10">Odd</span>
              <span className="text-yellow-200 text-[10px] font-bold bg-black/30 px-2 rounded-full relative z-10">({adminMultipliers.odd || 2}x)</span>
            </motion.button>
          </div>
        </div>

        {/* 1-18 / 19-36 Row - Premium Casino Chips */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02, y: -1 }}
            onClick={() => handlePlaceBet('low', 'low')}
            disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
            className={cn(
              "relative h-10 rounded-xl font-bold disabled:opacity-40 shadow-lg overflow-hidden",
              "bg-gradient-to-br from-cyan-500 via-cyan-600 to-cyan-800 border-2",
              selectedBets.has('low') 
                ? "border-yellow-400 ring-2 ring-yellow-400/50" 
                : "border-cyan-400/50"
            )}
          >
            {/* Bet Amount Badge */}
            {betAmountsPerOption['low'] > 0 && (
              <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                {formatBetDisplay(betAmountsPerOption['low'])}
              </span>
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
            <span className="text-white font-black text-sm drop-shadow-md relative z-10">1-18 ({adminMultipliers.low || 2}x)</span>
          </motion.button>
          
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02, y: -1 }}
            onClick={() => handlePlaceBet('high', 'high')}
            disabled={autoPlayPhase !== 'betting' || betAmount > userDiamonds}
            className={cn(
              "relative h-10 rounded-xl font-bold disabled:opacity-40 shadow-lg overflow-hidden",
              "bg-gradient-to-br from-teal-500 via-teal-600 to-teal-800 border-2",
              selectedBets.has('high') 
                ? "border-yellow-400 ring-2 ring-yellow-400/50" 
                : "border-teal-400/50"
            )}
          >
            {/* Bet Amount Badge */}
            {betAmountsPerOption['high'] > 0 && (
              <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-20">
                {formatBetDisplay(betAmountsPerOption['high'])}
              </span>
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
            <span className="text-white font-black text-sm drop-shadow-md relative z-10">19-36 ({adminMultipliers.high || 2}x)</span>
          </motion.button>
        </div>

        {/* Total Bet Display */}
        {totalBetPlaced > 0 && (
          <div className="text-center text-[10px] text-amber-300 bg-amber-500/20 rounded-lg py-1 mt-2">
            Total Bet: {totalBetPlaced.toLocaleString()} on {selectedBets.size} option(s)
          </div>
        )}
      </div>


      {/* Result Display with Premium 3D effect */}
      <AnimatePresence>
        {result !== null && selectedBets.size > 0 && won !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "relative p-2 rounded-lg text-center font-bold text-sm overflow-hidden",
              won 
                ? "bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-500/50" 
                : "bg-gradient-to-r from-red-500/30 to-rose-500/30 border border-red-500/50"
            )}
          >
            {won && <ShimmerEffect intensity="high" />}
            {won && <ParticleField count={8} color="#22c55e" />}
            
            <span className={cn("relative z-10", won ? "text-green-400" : "text-red-400")}>
              {won ? `🎉 Won ${winAmount.toLocaleString()}!` : "😢 Better luck next time"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

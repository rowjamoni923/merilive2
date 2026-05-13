import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WinPopup } from "../common/WinPopup";
import { formatBetAmount } from "../common/BetControls";
import { PremiumRocket3D } from "./rocket-race/PremiumRocket3D";
import { useGameSoundManager } from "@/hooks/useGameSoundManager";
import { useLiveGameEffects } from "@/hooks/useLiveGameEffects";
import { processWin } from "@/services/gameBalanceService";

// Import rocket images for UI elements
import rocketBlueImg from "@/assets/rockets/rocket-blue.png";
import rocketGreenImg from "@/assets/rockets/rocket-green.png";
import rocketOrangeImg from "@/assets/rockets/rocket-orange.png";

// Map rocket color keys to images
const ROCKET_ASSETS: Record<string, string> = {
  red: rocketBlueImg,
  blue: rocketGreenImg,
  green: rocketOrangeImg,
};

interface LiveRocketRaceGameProps {
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

// 3 Premium Rockets with realistic colors
const ROCKETS = [
  { id: 1, name: "Red Rocket", colorKey: "red" as const, color: "from-red-500 to-red-700", bgColor: "bg-red-500/30", odds: 2.5 },
  { id: 2, name: "Blue Rocket", colorKey: "blue" as const, color: "from-blue-500 to-blue-700", bgColor: "bg-blue-500/30", odds: 3.0 },
  { id: 3, name: "Green Rocket", colorKey: "green" as const, color: "from-green-500 to-green-700", bgColor: "bg-green-500/30", odds: 3.5 },
];

const AUTO_PLAY_BETTING_TIME = 25000;
const LAUNCH_DURATION = 4000;

// Generate stars once
const generateStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 0.5 + Math.random() * 2,
    opacity: 0.3 + Math.random() * 0.7,
    delay: Math.random() * 3,
  }));
};

export function LiveRocketRaceGame({
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
}: LiveRocketRaceGameProps) {
  const [selectedRocket, setSelectedRocket] = useState<number | null>(null);
  const [betOnRocket, setBetOnRocket] = useState<Record<number, number>>({});
  const [isLaunching, setIsLaunching] = useState(false);
  const [winningRocket, setWinningRocket] = useState<number | null>(null);
  const [rocketPositions, setRocketPositions] = useState([0, 0, 0]);
  const [won, setWon] = useState<boolean | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [recentResults, setRecentResults] = useState<number[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [totalBetPlaced, setTotalBetPlaced] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [autoPlayPhase, setAutoPlayPhase] = useState<'betting' | 'launching'>('betting');
  const [autoPlayTimeLeft, setAutoPlayTimeLeft] = useState(25);
  const [roundCounter, setRoundCounter] = useState(0);

  const isMountedRef = useRef(true);
  const betOnRocketRef = useRef<Record<number, number>>({});
  const totalBetPlacedRef = useRef<number>(0);
  
  // Memoize stars so they don't regenerate
  const stars = useMemo(() => generateStars(60), []);
  
  // Sound manager for rocket race
  const sounds = useGameSoundManager('rocket-race');
  const { bindLayer, play: playLiveEffect } = useLiveGameEffects();

  useEffect(() => { betOnRocketRef.current = betOnRocket; }, [betOnRocket]);
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
    setWinningRocket(null);
    setRocketPositions([0, 0, 0]);
    setSelectedRocket(null);
    setBetOnRocket({});
    setTotalBetPlaced(0);
    setIsLaunching(false);
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
    setAutoPlayPhase('launching');
    for (let i = 3; i >= 1; i--) {
      if (!isMountedRef.current) return;
      setCountdown(i);
      sounds.playCountdownBeep(i === 1); // Last beep is louder
      await new Promise(r => setTimeout(r, 800));
    }
    if (isMountedRef.current) {
      setCountdown(null);
      runLaunch();
    }
  };

  const runLaunch = async () => {
    setIsLaunching(true);
    sounds.playRocketLaunch(); // 🔊 Launch sound!
    playLiveEffect('launch');
    
    const winnerIndex = Math.floor(Math.random() * 3);
    const finalPositions = [0, 0, 0];
    
    const animationSteps = 40;
    for (let step = 0; step <= animationSteps; step++) {
      if (!isMountedRef.current) return;
      
      const progress = step / animationSteps;
      const positions = ROCKETS.map((_, i) => {
        const baseProgress = progress;
        const isWinner = i === winnerIndex;
        const randomFactor = Math.sin(step * 0.5 + i * 2) * 3;
        
        if (progress > 0.7) {
          const finalStretch = (progress - 0.7) / 0.3;
          if (isWinner) {
            return Math.min(85 + randomFactor + finalStretch * 15, 100);
          } else {
            return 55 + randomFactor + Math.random() * 20;
          }
        }
        
        return baseProgress * 70 + randomFactor + (isWinner ? 5 : 0);
      });
      
      setRocketPositions(positions);
      await new Promise(r => setTimeout(r, LAUNCH_DURATION / animationSteps));
    }

    finalPositions[winnerIndex] = 100;
    ROCKETS.forEach((_, i) => {
      if (i !== winnerIndex) finalPositions[i] = 60 + Math.random() * 20;
    });
    setRocketPositions(finalPositions);
    
    setIsLaunching(false);
    setWinningRocket(winnerIndex);
    setRecentResults(prev => [winnerIndex, ...prev].slice(0, 10));
    
    processResults(winnerIndex);
  };

  const processResults = async (winnerIndex: number) => {
    const currentBets = betOnRocketRef.current;
    const currentTotalBet = totalBetPlacedRef.current;
    
    if (currentBets[winnerIndex] && currentBets[winnerIndex] > 0) {
      const totalWinnings = Math.floor(currentBets[winnerIndex] * ROCKETS[winnerIndex].odds);
      setWon(true);
      setWinAmount(totalWinnings);
      setShowWinPopup(true);
      sounds.playRocketWin(); // 🔊 Win sound!
      playLiveEffect('win');
      
      const creditWinnings = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const result = await processWin(user.id, game?.id || 'rocket-race', game?.name || 'Rocket Race', totalWinnings, ROCKETS[winnerIndex].odds);
          if (result.success && result.newBalance !== undefined) {
            onUpdateCoins?.(result.newBalance);
          }
        } catch (error) {
          console.error('[RocketRace] Credit error:', error);
        }
      };
      creditWinnings();
      onGameWin?.(totalWinnings);
    } else if (currentTotalBet > 0) {
      setWon(false);
      setWinAmount(currentTotalBet);
      setShowWinPopup(true);
      sounds.playLoseSound(); // 🔊 Lose sound
      playLiveEffect('lose');
    }

    setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 3000);
    onProcessResult(winnerIndex.toString());
    
    setTimeout(() => {
      if (isMountedRef.current) setRoundCounter(prev => prev + 1);
    }, 3000);
  };

  const handleSelectRocket = async (rocketIndex: number) => {
    if (autoPlayPhase !== 'betting' || isPlacingBet) return;
    if (betAmount > userCoins) return;

    setSelectedRocket(rocketIndex);
    setBetOnRocket(prev => ({ ...prev, [rocketIndex]: (prev[rocketIndex] || 0) + betAmount }));
    setTotalBetPlaced(prev => prev + betAmount);
    sounds.playBetSound(); // 🔊 Bet sound!
    playLiveEffect('bet');
    
    setIsPlacingBet(true);

    onPlaceBet('rocket_race', rocketIndex.toString()).then(result => {
      if (!result?.success) {
        setBetOnRocket(prev => ({ ...prev, [rocketIndex]: Math.max(0, (prev[rocketIndex] || 0) - betAmount) }));
        setTotalBetPlaced(prev => Math.max(0, prev - betAmount));
      }
    }).finally(() => {
      setIsPlacingBet(false);
    });
  };

  return (
    <div className="space-y-2 p-2 relative live-game-premium-panel">
      <div ref={bindLayer} className="live-game-fx-layer" aria-hidden="true" />
      <WinPopup 
        show={showWinPopup} 
        amount={winAmount} 
        multiplier={won && winningRocket !== null ? ROCKETS[winningRocket].odds : undefined}
        emoji={game?.game_emoji || "🚀"}
        logoUrl={game?.logo_url}
        message={won ? "LIFTOFF!" : "Try Again!"}
        isWin={won === true}
      />

      {/* Recent Results with Timer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-indigo-950/80 to-purple-950/80 rounded-xl border border-purple-500/30 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          {/* Timer - Left Side */}
          <div className={cn(
            "px-2 py-1 rounded-lg font-bold text-sm tabular-nums min-w-[40px] text-center",
            autoPlayPhase === 'betting' 
              ? autoPlayTimeLeft <= 5 
                ? "bg-red-500/30 text-red-400 animate-pulse" 
                : "bg-amber-500/30 text-amber-400"
              : "bg-indigo-500/30 text-indigo-400"
          )}>
            {autoPlayPhase === 'betting' ? `${autoPlayTimeLeft}s` : '🚀'}
          </div>
          
          <span className="text-[10px] text-purple-300 font-semibold whitespace-nowrap">🏆 Recent:</span>
          <div className="flex gap-1.5">
            {recentResults.length === 0 ? (
              <span className="text-[10px] text-gray-500">No results yet</span>
            ) : (
              recentResults.slice(0, 5).map((idx, i) => (
                <motion.div
                  key={`${idx}-${i}`}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shadow-lg border overflow-hidden",
                    `bg-gradient-to-br ${ROCKETS[idx]?.color}`,
                    "border-white/20"
                  )}
                >
                  <img 
                    src={ROCKET_ASSETS[ROCKETS[idx]?.colorKey]} 
                    alt="winner"
                    className="w-5 h-5 object-contain"
                  />
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Premium 3D Space Arena */}
      <div 
        className="relative rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-2xl min-h-[320px]"
        style={{
          background: 'linear-gradient(180deg, #0a0a1f 0%, #1a0a2e 30%, #2d1b4e 60%, #4a1d6e 100%)'
        }}
      >
        {/* Animated Stars Background */}
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
              animate={{ 
                opacity: [star.opacity * 0.5, star.opacity, star.opacity * 0.5],
                scale: [1, 1.3, 1]
              }}
              transition={{ 
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: star.delay
              }}
            />
          ))}
        </div>

        {/* Nebula/Galaxy Effect */}
        <div className="absolute inset-0 opacity-30"
          style={{
            background: 'radial-gradient(ellipse at 30% 20%, rgba(139, 92, 246, 0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)'
          }}
        />

        {/* Finish Line */}
        <div className="absolute top-4 left-6 right-6 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full" />
        <motion.div 
          className="absolute top-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-amber-500 px-4 py-1 rounded-b-lg text-xs font-bold text-black shadow-lg z-10"
          animate={{ y: [0, 2, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          🏁 FINISH LINE
        </motion.div>

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
                className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400"
                animate={{ scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                style={{
                  textShadow: '0 0 40px rgba(139, 92, 246, 0.8), 0 0 80px rgba(139, 92, 246, 0.4)'
                }}
              >
                {countdown}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timer Display */}
        {autoPlayPhase === 'betting' && (
          <motion.div 
            className="absolute top-3 right-3 z-20"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 border border-cyan-500/40">
              <div className="text-cyan-400 text-2xl font-bold tabular-nums">
                {autoPlayTimeLeft}s
              </div>
            </div>
          </motion.div>
        )}

        {/* Launch Lanes with 3D Rockets */}
        <div className="relative flex justify-around items-end h-[280px] pt-12 px-6">
          {ROCKETS.map((rocket, i) => (
            <div key={rocket.id} className="relative flex flex-col items-center" style={{ width: '30%' }}>
              {/* Vertical Launch Lane */}
              <div 
                className="absolute bottom-16 w-full h-[210px] rounded-t-2xl overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, rgba(0,0,0,0.3) 0%, ${
                    i === 0 ? 'rgba(239,68,68,0.15)' : 
                    i === 1 ? 'rgba(59,130,246,0.15)' : 
                    'rgba(34,197,94,0.15)'
                  } 100%)`,
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
                }}
              >
                {/* Lane Grid Lines */}
                {[...Array(6)].map((_, j) => (
                  <div 
                    key={j} 
                    className="absolute w-full border-t border-white/5" 
                    style={{ bottom: `${(j + 1) * 14}%` }} 
                  />
                ))}
              </div>

              {/* Premium 3D Rocket - positioned right above launch pad */}
              <div className="absolute z-20 bottom-[22px]">
                <PremiumRocket3D
                  color={rocket.colorKey}
                  position={rocketPositions[i]}
                  isLaunching={isLaunching}
                  isWinner={winningRocket === i}
                  hasBet={betOnRocket[i] > 0}
                  betAmount={betOnRocket[i]}
                  onClick={() => handleSelectRocket(i)}
                />
              </div>

              {/* Launch Pad */}
              <div className="absolute bottom-0 w-full flex flex-col items-center">
                <div 
                  className={cn(
                    "w-16 h-4 rounded-t-lg relative overflow-hidden",
                    `bg-gradient-to-t ${rocket.color}`
                  )}
                  style={{
                    boxShadow: `0 -5px 20px ${
                      i === 0 ? 'rgba(239,68,68,0.4)' : 
                      i === 1 ? 'rgba(59,130,246,0.4)' : 
                      'rgba(34,197,94,0.4)'
                    }`
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute top-0 left-0 right-0 h-1 bg-white/30" />
                </div>
                <div className="flex justify-between w-12">
                  <div className="w-2 h-3 bg-gray-600 rounded-b-sm" />
                  <div className="w-2 h-3 bg-gray-600 rounded-b-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Launching Indicator */}
        {isLaunching && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20"
          >
            <div className="bg-gradient-to-r from-cyan-500 to-purple-500 px-6 py-2 rounded-full text-white text-sm font-bold shadow-lg border border-white/20">
              🚀 LAUNCHING!
            </div>
          </motion.div>
        )}
      </div>

      {/* Betting Buttons - Premium Design */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        {ROCKETS.map((rocket, i) => (
          <motion.button
            key={rocket.id}
            onClick={() => handleSelectRocket(i)}
            disabled={isPlacingBet || betAmount > userCoins || autoPlayPhase !== 'betting'}
            whileHover={{ scale: autoPlayPhase === 'betting' ? 1.05 : 1 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "relative p-3 rounded-xl border-2 transition-all overflow-hidden",
              selectedRocket === i 
                ? `border-white/60 ${rocket.bgColor}` 
                : "border-white/20 bg-black/40 hover:bg-white/10",
              (isPlacingBet || betAmount > userCoins || autoPlayPhase !== 'betting') && "opacity-50 cursor-not-allowed"
            )}
          >
            {/* Background Glow */}
            <div className={cn(
              "absolute inset-0 opacity-30",
              `bg-gradient-to-t ${rocket.color}`
            )} />
            
            <div className="relative z-10">
              {/* Mini SVG Rocket Icon */}
              <div className={cn(
                "w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center overflow-hidden",
                `bg-gradient-to-br ${rocket.color}`,
                "shadow-lg"
              )}>
                <img 
                  src={ROCKET_ASSETS[rocket.colorKey]} 
                  alt={rocket.name}
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="text-xs text-white font-semibold">{rocket.name}</div>
              <div className={cn(
                "text-sm font-bold px-3 py-1 rounded-full mt-2 text-white",
                `bg-gradient-to-r ${rocket.color}`
              )}>
                {rocket.odds}x
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Total Bet Display */}
      {totalBetPlaced > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-xl py-2 border border-cyan-500/30"
        >
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="text-cyan-400 text-sm font-bold">
            Total Bet: {formatBetAmount(totalBetPlaced)}
          </span>
        </motion.div>
      )}
    </div>
  );
}

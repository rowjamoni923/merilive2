import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShimmerEffect, ParticleField } from "../common/ShimmerEffect";
import { useGameSoundManager } from "@/hooks/useGameSoundManager";
import { useLiveGameEffects } from "@/hooks/useLiveGameEffects";
import { WinPopup, formatBetDisplay } from "../common/WinPopup";
import { processWin } from "@/services/gameBalanceService";

interface LiveTeenPattiGameProps {
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
  onTimerUpdate?: (timeLeft: number, phase: 'betting' | 'dealing') => void;
}

// Card suits and values
const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

interface Card {
  suit: string;
  value: string;
  rank: number;
}

interface Hand {
  cards: Card[];
  score: number;
  name: string;
}

const createDeck = (): Card[] => {
  const deck: Card[] = [];
  SUITS.forEach(suit => {
    VALUES.forEach((value, index) => {
      deck.push({ suit, value, rank: index + 1 });
    });
  });
  return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const evaluateHand = (cards: Card[]): { score: number; name: string } => {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isSequence = ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1;
  const isTriple = ranks[0] === ranks[1] && ranks[1] === ranks[2];
  const isPair = ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2];

  if (isTriple) return { score: 600 + ranks[0], name: "Trail" };
  if (isSequence && isFlush) return { score: 500 + ranks[0], name: "Pure Sequence" };
  if (isSequence) return { score: 400 + ranks[0], name: "Sequence" };
  if (isFlush) return { score: 300 + ranks[0], name: "Color" };
  if (isPair) {
    const pairRank = ranks[0] === ranks[1] ? ranks[0] : ranks[1] === ranks[2] ? ranks[1] : ranks[0];
    return { score: 200 + pairRank, name: "Pair" };
  }
  return { score: ranks[0], name: "High Card" };
};

// Auto-play timing constants
const AUTO_PLAY_BETTING_TIME = 25000;
const AUTO_PLAY_DEALING_TIME = 5000;

export function LiveTeenPattiGame({
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
}: LiveTeenPattiGameProps) {
  // Allow multiple bets - track bets per hand
  const [selectedHands, setSelectedHands] = useState<Set<"A" | "B" | "C">>(new Set());
  const [betAmounts, setBetAmounts] = useState<{ A: number; B: number; C: number }>({ A: 0, B: 0, C: 0 });
  const [hands, setHands] = useState<{ A: Hand | null; B: Hand | null; C: Hand | null }>({
    A: null, B: null, C: null
  });
  const [winner, setWinner] = useState<"A" | "B" | "C" | null>(null);
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [totalBetPlaced, setTotalBetPlaced] = useState(0);

  // 24/7 Auto-play state - SINGLE TIMER SYSTEM
  const [autoPlayPhase, setAutoPlayPhase] = useState<'betting' | 'dealing'>('betting');
  const [autoPlayTimeLeft, setAutoPlayTimeLeft] = useState(25);
  const [roundCounter, setRoundCounter] = useState(0);

  // Use centralized sound manager - only plays when this game is active
  const sounds = useGameSoundManager('teen-patti');
  const { bindLayer, play: playLiveEffect } = useLiveGameEffects();
  const isMountedRef = useRef(true);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL: Use refs to access current state in autoDealCards (closure fix)
  const selectedHandsRef = useRef<Set<"A" | "B" | "C">>(new Set());
  const betAmountsRef = useRef<{ A: number; B: number; C: number }>({ A: 0, B: 0, C: 0 });
  const totalBetPlacedRef = useRef<number>(0);
  
  // Keep refs in sync with state
  useEffect(() => {
    selectedHandsRef.current = selectedHands;
  }, [selectedHands]);
  
  useEffect(() => {
    betAmountsRef.current = betAmounts;
  }, [betAmounts]);
  
  useEffect(() => {
    totalBetPlacedRef.current = totalBetPlaced;
  }, [totalBetPlaced]);

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
    setHands({ A: null, B: null, C: null });
    setSelectedHands(new Set());
    setBetAmounts({ A: 0, B: 0, C: 0 });
    setTotalBetPlaced(0);
    setWinner(null);
    setCardsRevealed(false);
    setIsDealing(false);
    setWon(null);
    setShowWinPopup(false);
    setWinAmount(0);
    
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
    
    // After betting time, start dealing
    bettingTimer = setTimeout(() => {
      if (countdownInterval) clearInterval(countdownInterval);
      setAutoPlayPhase('dealing');
      runDeal();
    }, AUTO_PLAY_BETTING_TIME);
    
    return () => {
      if (bettingTimer) clearTimeout(bettingTimer);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [roundCounter]);

  // Deal cards function - runs when betting phase ends
  const runDeal = async () => {
    setIsDealing(true);
    sounds.playCardShuffle();
    playLiveEffect('deal');
    
    if (navigator.vibrate) navigator.vibrate(100);

    // Create and shuffle deck
    const deck = shuffleDeck(createDeck());
    
    // Deal 3 cards to each hand
    const handA: Card[] = [deck[0], deck[1], deck[2]];
    const handB: Card[] = [deck[3], deck[4], deck[5]];
    const handC: Card[] = [deck[6], deck[7], deck[8]];

    const evalA = evaluateHand(handA);
    const evalB = evaluateHand(handB);
    const evalC = evaluateHand(handC);

    setHands({
      A: { cards: handA, ...evalA },
      B: { cards: handB, ...evalB },
      C: { cards: handC, ...evalC }
    });

    sounds.playCardDeal();

    // Reveal cards after delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    setCardsRevealed(true);
    sounds.playCardReveal();

    // Determine winner after another delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const scores = { A: evalA.score, B: evalB.score, C: evalC.score };
    const winningHand = Object.entries(scores).reduce((a, b) => 
      a[1] > b[1] ? a : b
    )[0] as "A" | "B" | "C";
    
    setWinner(winningHand);

    // Use REFS to access current bet state (closure fix)
    const currentSelectedHands = selectedHandsRef.current;
    const currentBetAmounts = betAmountsRef.current;
    const currentTotalBetPlaced = totalBetPlacedRef.current;
    
    let totalWinnings = 0;
    const multiplier = 2; // Teen Patti pays 2x
    
    // Check EACH bet the user placed
    currentSelectedHands.forEach(hand => {
      const betOnThisHand = currentBetAmounts[hand] || 0;
      if (hand === winningHand && betOnThisHand > 0) {
        totalWinnings += betOnThisHand * multiplier;
        console.log(`[TeenPatti] ✅ WON on Hand ${hand}! ${betOnThisHand} × ${multiplier}x`);
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
          const result = await processWin(user.id, 'teen_patti', 'Teen Patti', Math.floor(totalWinnings), multiplier, false);
          
          if (result.success && result.newBalance !== undefined && onUpdateCoins) {
            onUpdateCoins(result.newBalance);
          }
        } catch (error) {
          console.error('[TeenPatti] Credit error:', error);
        }
      };
      creditWinnings();
      onGameWin?.(totalWinnings);
      setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 2500);
    } else if (currentSelectedHands.size > 0) {
      // LOSS - only show after confirming no win
      setWon(false);
      setWinAmount(currentTotalBetPlaced);
      setShowWinPopup(true);
      sounds.playLoseSound();
      playLiveEffect('lose');
      setTimeout(() => { if (isMountedRef.current) setShowWinPopup(false); }, 2500);
    }

    onProcessResult(winningHand);
    setIsDealing(false);
    
    // CRITICAL: Trigger next round via roundCounter - NO duplicate timer
    setTimeout(() => {
      if (isMountedRef.current) {
        setRoundCounter(prev => prev + 1);
      }
    }, 3000);
  };

  // Deal cards and show result (with user bet)
  const dealCards = useCallback(async () => {
    if (isDealing) return;
    setIsDealing(true);
    sounds.playCardShuffle();
    sounds.playCardDeal();
    playLiveEffect('deal');
    
    if (navigator.vibrate) navigator.vibrate(100);

    // Create and shuffle deck
    const deck = shuffleDeck(createDeck());
    
    // Deal 3 cards to each hand
    const handA: Card[] = [deck[0], deck[1], deck[2]];
    const handB: Card[] = [deck[3], deck[4], deck[5]];
    const handC: Card[] = [deck[6], deck[7], deck[8]];

    const evalA = evaluateHand(handA);
    const evalB = evaluateHand(handB);
    const evalC = evaluateHand(handC);

    setHands({
      A: { cards: handA, ...evalA },
      B: { cards: handB, ...evalB },
      C: { cards: handC, ...evalC }
    });

    // Reveal cards after delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    setCardsRevealed(true);

    // Determine winner after another delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const scores = { A: evalA.score, B: evalB.score, C: evalC.score };
    const winningHand = Object.entries(scores).reduce((a, b) => 
      a[1] > b[1] ? a : b
    )[0] as "A" | "B" | "C";
    
    setWinner(winningHand);

    // Check if user won on any of their bets
    const isWinner = selectedHands.has(winningHand);
    setWon(isWinner);

    if (isWinner) {
      const wonBet = betAmounts[winningHand];
      const winTotal = wonBet * 2; // 2x multiplier for Teen Patti
      setWinAmount(winTotal);
      setWon(true);
      setShowWinPopup(true);
      sounds.playWinSound();
      sounds.playCoinSound();
      playLiveEffect('win');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      
      // IMPORTANT: Credit winnings to user's balance
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const result = await processWin(user.id, game?.id || 'teen-patti', game?.name || 'Teen Patti', winTotal, 2);
          if (result.success && result.newBalance !== undefined) {
            onUpdateCoins?.(result.newBalance);
            console.log('[TeenPatti dealCards] Credited winnings via RPC:', winTotal, 'New balance:', result.newBalance);
          }
        }
      } catch (error) {
        console.error('[TeenPatti dealCards] Failed to credit winnings:', error);
      }
      
      // Send win notification to party room chat
      onGameWin?.(winTotal);
      setTimeout(() => setShowWinPopup(false), 2500);
    } else if (selectedHands.size > 0) {
      // Loss case - show loss popup with sad emoji
      setWon(false);
      setWinAmount(totalBetPlaced); // Show how much was lost
      setShowWinPopup(true);
      sounds.playLoseSound();
      playLiveEffect('lose');
      setTimeout(() => setShowWinPopup(false), 2500);
    }

    onProcessResult(winningHand);
    setIsDealing(false);
  }, [selectedHands, betAmounts, sounds, playLiveEffect, onProcessResult, isDealing, onGameWin, totalBetPlaced]);
  
  // Deal cards without user bet (just show result for spectators)
  const dealCardsWithoutBet = useCallback(async () => {
    if (isDealing) return;
    setIsDealing(true);
    
    // Create and shuffle deck
    const deck = shuffleDeck(createDeck());
    
    // Deal 3 cards to each hand
    const handA: Card[] = [deck[0], deck[1], deck[2]];
    const handB: Card[] = [deck[3], deck[4], deck[5]];
    const handC: Card[] = [deck[6], deck[7], deck[8]];

    const evalA = evaluateHand(handA);
    const evalB = evaluateHand(handB);
    const evalC = evaluateHand(handC);

    setHands({
      A: { cards: handA, ...evalA },
      B: { cards: handB, ...evalB },
      C: { cards: handC, ...evalC }
    });

    // Reveal cards after delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    setCardsRevealed(true);

    // Determine winner after another delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const scores = { A: evalA.score, B: evalB.score, C: evalC.score };
    const winningHand = Object.entries(scores).reduce((a, b) => 
      a[1] > b[1] ? a : b
    )[0] as "A" | "B" | "C";
    
    setWinner(winningHand);
    setIsDealing(false);
  }, [isDealing]);

  // Allow multiple bets on different hands - INSTANT response
  const handleSelectHand = (hand: "A" | "B" | "C") => {
    console.log('[TeenPatti] handleSelectHand called:', { hand, autoPlayPhase, betAmount, userCoins });
    
    if (autoPlayPhase !== 'betting') {
      console.log('[TeenPatti] Not in betting phase, ignoring');
      return;
    }
    
    if (betAmount > userCoins) {
      console.log('[TeenPatti] Not enough coins');
      return;
    }

    // Store the current bet amount
    const currentBetAmount = betAmount;
    
    // Instant UI update
    setSelectedHands(prev => new Set([...prev, hand]));
    setBetAmounts(prev => {
      const newAmounts = { ...prev, [hand]: prev[hand] + currentBetAmount };
      console.log('[TeenPatti] Updated betAmounts:', newAmounts);
      return newAmounts;
    });
    setTotalBetPlaced(prev => prev + currentBetAmount);
    
    sounds.playBetSound();
    playLiveEffect('bet');

    // Fire API call in background - don't block UI
    onPlaceBet('teen_patti', hand)
      .then(result => {
        console.log('[TeenPatti] Bet result:', result);
        if (!result?.success) {
          console.log('[TeenPatti] Bet failed, rolling back');
          // Rollback on failure
          setBetAmounts(prev => {
            const newAmount = Math.max(0, prev[hand] - currentBetAmount);
            if (newAmount === 0) {
              setSelectedHands(s => {
                const newSet = new Set(s);
                newSet.delete(hand);
                return newSet;
              });
            }
            return { ...prev, [hand]: newAmount };
          });
          setTotalBetPlaced(prev => Math.max(0, prev - currentBetAmount));
        }
      })
      .catch(err => {
        console.error('[TeenPatti] Bet error:', err);
      });
  };

  const CardBack = () => (
    <div className="w-8 h-11 rounded bg-gradient-to-br from-red-500 to-red-700 border border-yellow-400/50 flex items-center justify-center shadow-md">
      <div className="w-6 h-9 rounded-sm bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
        <span className="text-red-600 text-xs">♦</span>
      </div>
    </div>
  );

  const CardFace = ({ card }: { card: Card }) => {
    const isRed = card.suit === "♥" || card.suit === "♦";
    return (
      <div className="w-8 h-11 rounded bg-white border border-gray-300 flex flex-col items-center justify-center shadow-md">
        <span className={cn("text-[9px] font-bold", isRed ? "text-red-600" : "text-gray-900")}>
          {card.value}
        </span>
        <span className={cn("text-sm", isRed ? "text-red-600" : "text-gray-900")}>
          {card.suit}
        </span>
      </div>
    );
  };

  const HandDisplay = ({ 
    label, 
    hand,
    isSelected,
    isWinner,
    onSelect
  }: { 
    label: "A" | "B" | "C";
    hand: Hand | null;
    isSelected: boolean;
    isWinner: boolean;
    onSelect: () => void;
  }) => {
    const labelColors = {
      A: "text-orange-400",
      B: "text-orange-500", 
      C: "text-yellow-400"
    };

    return (
      <button
        onClick={() => {
          console.log('[TeenPatti] Button clicked for hand:', label);
          onSelect();
        }}
        disabled={autoPlayPhase !== "betting"}
        className={cn(
          "relative flex flex-col items-center p-2 rounded-xl transition-all duration-150",
          isSelected && "ring-2 ring-yellow-400 bg-yellow-400/10",
          isWinner && "ring-2 ring-green-500 bg-green-500/10",
          !isSelected && !isWinner && "bg-white/5 hover:bg-white/10",
          autoPlayPhase === "betting" && "active:scale-[0.97] cursor-pointer",
          autoPlayPhase !== "betting" && "opacity-70 cursor-not-allowed"
        )}
      >
        {/* Bet Amount Badge */}
        {betAmounts[label] > 0 && (
          <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center z-10">
            {formatBetDisplay(betAmounts[label])}
          </span>
        )}
        
        {/* Label */}
        <span className={cn("text-2xl font-bold mb-1", labelColors[label])}>
          {label}
        </span>

        {/* Cards */}
        <div className="bg-black/20 rounded-lg p-1.5 mb-1">
          <div className="flex gap-0.5">
            {hand && cardsRevealed ? (
              hand.cards.map((card, i) => (
                <CardFace key={i} card={card} />
              ))
            ) : (
              <>
                <CardBack />
                <CardBack />
                <CardBack />
              </>
            )}
          </div>
        </div>

        {/* Hand Name */}
        {hand && cardsRevealed && (
          <span className="text-[9px] text-white/80 bg-black/30 px-1.5 py-0.5 rounded">
            {hand.name}
          </span>
        )}

        {/* Winner Badge */}
        {isWinner && (
          <span className="mt-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-2 py-0.5 rounded-full text-[9px] font-bold">
            WINNER!
          </span>
        )}
      </button>
    );
  };

  return (
    <div 
      className="space-y-1 p-1 rounded-xl relative live-game-premium-panel"
      style={{
        background: "linear-gradient(180deg, rgba(139,0,0,0.3) 0%, rgba(92,0,0,0.3) 100%)"
      }}
    >
      <div ref={bindLayer} className="live-game-fx-layer" aria-hidden="true" />
      {/* Timer and Betting Hint Bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-black/40 rounded-lg">
        {/* Large Premium Timer - Left Side */}
        <div className={cn(
          "px-3 py-1.5 rounded-xl font-bold text-lg tabular-nums min-w-[50px] text-center flex-shrink-0 shadow-lg border",
          autoPlayPhase === 'betting' 
            ? autoPlayTimeLeft <= 5 
              ? "bg-red-500/40 text-red-300 animate-pulse border-red-500/50 shadow-red-500/20" 
              : "bg-gradient-to-r from-cyan-600/40 to-blue-600/40 text-cyan-300 border-cyan-500/40 shadow-cyan-500/20"
            : "bg-red-600/40 text-red-300 border-red-500/50"
        )}>
          {autoPlayPhase === 'betting' ? `${autoPlayTimeLeft}s` : '🃏'}
        </div>
        
        <span className="text-xs font-semibold text-amber-200 drop-shadow">Pick A, B, or C to bet</span>
      </div>

      {/* Win/Lose Popup - with Game Logo */}
      <WinPopup 
        show={showWinPopup} 
        amount={winAmount} 
        multiplier={won ? 2 : undefined}
        emoji={game?.game_emoji || "🃏"}
        logoUrl={game?.logo_url}
        message={won ? "You Won!" : "You Lost!"}
        isWin={won === true}
      />

      {/* Three Hands - Multiple bets allowed */}
      <div className="grid grid-cols-3 gap-1.5">
        <HandDisplay
          label="A"
          hand={hands.A}
          isSelected={selectedHands.has("A")}
          isWinner={winner === "A"}
          onSelect={() => handleSelectHand("A")}
        />
        <HandDisplay
          label="B"
          hand={hands.B}
          isSelected={selectedHands.has("B")}
          isWinner={winner === "B"}
          onSelect={() => handleSelectHand("B")}
        />
        <HandDisplay
          label="C"
          hand={hands.C}
          isSelected={selectedHands.has("C")}
          isWinner={winner === "C"}
          onSelect={() => handleSelectHand("C")}
        />
      </div>

      {/* Total Bet Display */}
      {totalBetPlaced > 0 && (
        <div className="text-center text-[10px] text-amber-300 bg-amber-500/20 rounded-lg py-1">
          Total Bet: {totalBetPlaced.toLocaleString()} on {selectedHands.size} hand(s)
        </div>
      )}

      {/* Win Multiplier Info */}
      <div className="text-center text-[10px] text-white/80 font-medium">
        Win 2x your bet • Select A, B, or C
      </div>

      {/* Bet controls removed - using LiveGameBoard's unified bet controls at bottom */}

      {/* Result Display */}
      <AnimatePresence>
        {winner !== null && selectedHands.size > 0 && won !== null && (
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
              <span className="text-xl">🃏</span>
              <div>
                <span className={cn("relative z-10 text-sm", won ? "text-green-400" : "text-red-400")}>
                  {won ? `🎉 ${winner} Wins! You got 2x!` : `${winner} Wins! Better luck next time!`}
                </span>
                {won && betAmounts[winner] > 0 && (
                  <div className="flex items-center justify-center gap-1 text-green-300 text-xs">
                    <span>+{(betAmounts[winner] * 2).toLocaleString()}</span>
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
